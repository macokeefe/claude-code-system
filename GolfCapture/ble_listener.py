"""Garmin Approach R10 BLE listener.

The R10's BLE protocol is **not** publicly documented, so this module is built
defensively around that fact:

1. `scan` discovers the device by name ("R10" / "Approach"), connects, and
   dumps every service/characteristic + properties to `r10_characteristics.json`
   so the protocol can be mapped empirically.
2. During `record` we subscribe to *all* notifiable characteristics and write
   every notification verbatim to `raw_ble_log.jsonl` (hex + decimal byte
   views + candidate float decodes) so byte patterns can be reverse engineered
   by hand even if the auto-parser is wrong.
3. `parse_shot` is a *best-effort* heuristic decoder. It never raises and never
   emits implausible values; on failure it simply records nothing and the raw
   log remains the source of truth.
4. If a connection can't be established (e.g. the R10 is already paired to an
   iPhone and refuses a second central), we fall back to a passive
   advertisement scanner that logs adverts without connecting.

The active mode is written to `CONNECTION_MODE.txt`.
"""

from __future__ import annotations

import asyncio
import struct
from datetime import datetime
from pathlib import Path

from bleak import BleakClient, BleakScanner
from bleak.exc import BleakError

from session_paths import Clock, append_jsonl, write_json

R10_NAME_TOKENS = ("r10", "approach")
SCAN_TIMEOUT_S = 30.0
RECONNECT_INTERVAL_S = 5.0

# Plausibility gates. Anything outside these ranges is treated as a mis-parse.
BALL_SPEED_RANGE = (20.0, 220.0)      # mph
CARRY_RANGE = (10.0, 400.0)           # yards
TOTAL_RANGE = (10.0, 450.0)           # yards
LAUNCH_ANGLE_RANGE = (-10.0, 60.0)    # degrees
LAUNCH_DIR_RANGE = (-45.0, 45.0)      # degrees
SPIN_RANGE = (0.0, 14000.0)           # rpm

# Best-guess little-endian float32 offsets for the parsed-shot payload. These
# are placeholders to be refined from r10_characteristics.json + raw_ble_log;
# the parser falls back to a heuristic scan when they don't yield plausible
# values, so partial/incorrect offsets degrade gracefully.
KNOWN_OFFSETS = {
    "ball_speed_mph": 0,
    "launch_angle_deg": 4,
    "launch_direction_deg": 8,
    "spin_rate_rpm": 12,
    "carry_yards": 16,
    "total_yards": 20,
}


def is_r10_name(name: str | None) -> bool:
    if not name:
        return False
    lowered = name.lower()
    return any(token in lowered for token in R10_NAME_TOKENS)


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

async def find_r10(timeout: float = SCAN_TIMEOUT_S):
    """Scan for an R10. Returns the BLEDevice or None.

    On failure, prints every discovered device to aid debugging (per spec).
    """
    print(f"[ble] scanning for Garmin R10 (up to {timeout:.0f}s)...")
    devices = await BleakScanner.discover(timeout=timeout, return_adv=True)

    found = None
    discovered = []
    for device, adv in devices.values():
        name = adv.local_name or device.name
        discovered.append((device.address, name, adv.rssi))
        if found is None and is_r10_name(name):
            found = device

    if found is None:
        print("[ble] No R10 found. Discovered BLE devices:")
        if not discovered:
            print("       (none — is Bluetooth on and permission granted?)")
        for addr, name, rssi in sorted(discovered, key=lambda d: (d[2] or -999), reverse=True):
            print(f"       {addr}  rssi={rssi}  name={name!r}")
    else:
        print(f"[ble] Found R10: {found.address} name={found.name!r}")
    return found, discovered


async def dump_characteristics(session_dir: Path, timeout: float = SCAN_TIMEOUT_S) -> bool:
    """`scan` entry point: connect and write r10_characteristics.json.

    Returns True if characteristics were written, False otherwise.
    """
    device, discovered = await find_r10(timeout)
    if device is None:
        return False

    catalog = {
        "scanned_at": datetime.now().isoformat(timespec="seconds"),
        "device": {"address": device.address, "name": device.name},
        "services": [],
    }
    try:
        async with BleakClient(device) as client:
            print(f"[ble] connected={client.is_connected}; discovering services...")
            for service in client.services:
                svc = {"uuid": service.uuid, "description": service.description,
                       "characteristics": []}
                for char in service.characteristics:
                    entry = {
                        "uuid": char.uuid,
                        "description": char.description,
                        "properties": list(char.properties),
                        "handle": char.handle,
                        "descriptors": [d.uuid for d in char.descriptors],
                    }
                    # Opportunistically read readable characteristics.
                    if "read" in char.properties:
                        try:
                            value = await client.read_gatt_char(char)
                            entry["read_value_hex"] = value.hex(" ")
                        except BleakError as exc:
                            entry["read_error"] = str(exc)
                    svc["characteristics"].append(entry)
                    print(f"       {char.uuid}  props={','.join(char.properties)}")
                catalog["services"].append(svc)
    except BleakError as exc:
        catalog["connection_error"] = str(exc)
        print(f"[ble] connection failed: {exc}")
        write_json(session_dir / "r10_characteristics.json", catalog)
        return False

    write_json(session_dir / "r10_characteristics.json", catalog)
    print(f"[ble] wrote {session_dir / 'r10_characteristics.json'}")
    return True


# ---------------------------------------------------------------------------
# Best-effort shot parser
# ---------------------------------------------------------------------------

def _f32(data: bytes, offset: int) -> float | None:
    if offset < 0 or offset + 4 > len(data):
        return None
    try:
        return struct.unpack_from("<f", data, offset)[0]
    except struct.error:
        return None


def _in_range(value, lo, hi) -> bool:
    return value is not None and value == value and lo <= value <= hi  # NaN-safe


def candidate_floats(data: bytes) -> list[dict]:
    """Decode every aligned/unaligned LE float32 window for manual inspection."""
    out = []
    for off in range(0, max(0, len(data) - 3)):
        val = _f32(data, off)
        if val is not None and val == val and abs(val) < 1e6:
            out.append({"offset": off, "le_f32": round(val, 4)})
    return out


def parse_shot(data: bytes) -> dict | None:
    """Best-effort decode of a shot payload. Returns None on any doubt.

    Strategy: try the configured KNOWN_OFFSETS first; if ball speed / carry are
    implausible, scan the payload for a window of floats that satisfies the
    plausibility gates. Never raises.
    """
    try:
        # 1) Known-offset attempt.
        shot = {field: _f32(data, off) for field, off in KNOWN_OFFSETS.items()}
        if _in_range(shot.get("ball_speed_mph"), *BALL_SPEED_RANGE) and \
           _in_range(shot.get("carry_yards"), *CARRY_RANGE):
            return _finalize_shot(shot, source="known_offsets")

        # 2) Heuristic scan: slide a 6-float window looking for plausible
        #    ball-speed + carry pairs.
        for base in range(0, max(0, len(data) - 3)):
            speed = _f32(data, base)
            if not _in_range(speed, *BALL_SPEED_RANGE):
                continue
            window = {
                "ball_speed_mph": speed,
                "launch_angle_deg": _f32(data, base + 4),
                "launch_direction_deg": _f32(data, base + 8),
                "spin_rate_rpm": _f32(data, base + 12),
                "carry_yards": _f32(data, base + 16),
                "total_yards": _f32(data, base + 20),
            }
            if _in_range(window["carry_yards"], *CARRY_RANGE):
                return _finalize_shot(window, source=f"scan@{base}")
        return None
    except Exception:
        # Defensive: a parser bug must never crash the listener.
        return None


def _finalize_shot(shot: dict, source: str) -> dict | None:
    """Apply per-field plausibility gates; null out implausible optionals."""
    if not _in_range(shot.get("ball_speed_mph"), *BALL_SPEED_RANGE):
        return None
    if not _in_range(shot.get("carry_yards"), *CARRY_RANGE):
        return None

    def gate(field, lo, hi):
        v = shot.get(field)
        shot[field] = round(v, 2) if _in_range(v, lo, hi) else None

    gate("ball_speed_mph", *BALL_SPEED_RANGE)
    gate("carry_yards", *CARRY_RANGE)
    gate("total_yards", *TOTAL_RANGE)
    gate("launch_angle_deg", *LAUNCH_ANGLE_RANGE)
    gate("launch_direction_deg", *LAUNCH_DIR_RANGE)
    gate("spin_rate_rpm", *SPIN_RANGE)
    shot["club_type"] = None  # club type is not derivable from raw floats yet
    shot["parse_source"] = source
    return shot


# ---------------------------------------------------------------------------
# Live listener
# ---------------------------------------------------------------------------

class R10Listener:
    """Connects to the R10, subscribes to notifications, logs raw + parsed data.

    Falls back to passive advertisement scanning if a connection can't be made.
    Designed to be run as an asyncio task alongside the video recorder.
    """

    def __init__(self, session_dir: Path, clock: Clock, on_shot=None):
        self.session_dir = session_dir
        self.clock = clock
        self.on_shot = on_shot  # callback(shot_dict, stamp) for terminal output
        self.raw_log = session_dir / "raw_ble_log.jsonl"
        self.shots_log = session_dir / "shots_raw.jsonl"
        self.gaps_log = session_dir / "ble_gaps.txt"
        self.mode_file = session_dir / "CONNECTION_MODE.txt"
        self.shot_count = 0
        self._stop = asyncio.Event()
        self._notify_count = 0

    def stop(self) -> None:
        self._stop.set()

    # -- notification handling ------------------------------------------------

    def _handle_notification(self, char_uuid: str, data: bytearray):
        stamp = self.clock.stamp()
        raw = bytes(data)
        self._notify_count += 1

        # Human-readable raw record: hex (spaced), decimal bytes, and candidate
        # float decodes so byte patterns are identifiable by eye.
        append_jsonl(self.raw_log, {
            **stamp,
            "char_uuid": char_uuid,
            "length": len(raw),
            "hex": raw.hex(" "),
            "bytes": list(raw),
            "ascii": "".join(chr(b) if 32 <= b < 127 else "." for b in raw),
            "candidate_le_f32": candidate_floats(raw),
        })

        shot = parse_shot(raw)
        if shot is not None:
            self.shot_count += 1
            record = {**stamp, "char_uuid": char_uuid, "shot_index": self.shot_count,
                      "hex": raw.hex(" "), **shot}
            append_jsonl(self.shots_log, record)
            carry = shot.get("carry_yards")
            print(f"[ble] SHOT #{self.shot_count}  carry={carry} yds  "
                  f"ball_speed={shot.get('ball_speed_mph')} mph  ({shot['parse_source']})")
            if self.on_shot:
                self.on_shot(record, stamp)

    def _log_gap(self, message: str):
        with open(self.gaps_log, "a") as fh:
            fh.write(f"{datetime.now().isoformat(timespec='seconds')}  {message}\n")

    def _set_mode(self, mode: str, detail: str = ""):
        self.mode_file.write_text(
            f"mode={mode}\nset_at={datetime.now().isoformat(timespec='seconds')}\n{detail}\n"
        )
        print(f"[ble] connection mode: {mode}")

    # -- run loops ------------------------------------------------------------

    async def run(self):
        """Find the R10, then maintain a connection with auto-reconnect.

        Falls back to passive advertisement logging if connection is refused.
        """
        device, _ = await find_r10()
        if device is None:
            self._set_mode("none", "No R10 discovered; nothing to listen to.")
            return

        # Try an active connection first.
        connected_once = await self._try_connected_session(device)
        if connected_once:
            return
        # Connection refused/failed -> passive fallback.
        print("[ble] active connection unavailable; switching to passive scan.")
        await self._passive_scan(device)

    async def _try_connected_session(self, device) -> bool:
        """Maintain a notify subscription with reconnect. Returns True if we ever
        connected (so the caller doesn't fall back to passive mode)."""
        ever_connected = False
        first_attempt = True
        while not self._stop.is_set():
            try:
                async with BleakClient(device) as client:
                    if not client.is_connected:
                        raise BleakError("client reported not connected")
                    ever_connected = True
                    self._set_mode("active_connection",
                                   f"address={device.address} name={device.name}")
                    await self._subscribe_all(client)
                    print("[ble] subscribed to all notifiable characteristics; listening.")
                    # Wait until told to stop or the link drops.
                    while client.is_connected and not self._stop.is_set():
                        await asyncio.sleep(0.5)
                    if not client.is_connected and not self._stop.is_set():
                        self._log_gap("connection dropped; will reconnect")
                        print("[ble] connection dropped — reconnecting...")
            except BleakError as exc:
                if first_attempt and not ever_connected:
                    # Likely refused (e.g. paired to iPhone). Bail to passive.
                    self._log_gap(f"connect failed: {exc}")
                    return False
                self._log_gap(f"connect error: {exc}; retry in {RECONNECT_INTERVAL_S}s")
                print(f"[ble] error: {exc}; retrying in {RECONNECT_INTERVAL_S}s")
            first_attempt = False
            if self._stop.is_set():
                break
            await asyncio.sleep(RECONNECT_INTERVAL_S)
        return ever_connected

    async def _subscribe_all(self, client: BleakClient):
        for service in client.services:
            for char in service.characteristics:
                if "notify" in char.properties or "indicate" in char.properties:
                    uuid = char.uuid

                    def make_cb(u):
                        return lambda _sender, data: self._handle_notification(u, data)

                    try:
                        await client.start_notify(char, make_cb(uuid))
                    except BleakError as exc:
                        self._log_gap(f"start_notify failed for {uuid}: {exc}")

    async def _passive_scan(self, device):
        """Log advertisements from the R10's address without connecting."""
        self._set_mode("passive_advertisement",
                       f"address={device.address}; logging adverts only.")
        target = device.address.lower()

        def adv_cb(dev, adv):
            if dev.address.lower() != target:
                return
            stamp = self.clock.stamp()
            mfg = {str(k): v.hex(" ") for k, v in (adv.manufacturer_data or {}).items()}
            svc = {k: (v.hex(" ") if isinstance(v, (bytes, bytearray)) else v)
                   for k, v in (adv.service_data or {}).items()}
            append_jsonl(self.raw_log, {
                **stamp,
                "source": "advertisement",
                "rssi": adv.rssi,
                "local_name": adv.local_name,
                "manufacturer_data": mfg,
                "service_data": svc,
                "service_uuids": list(adv.service_uuids or []),
            })

        scanner = BleakScanner(detection_callback=adv_cb)
        await scanner.start()
        try:
            while not self._stop.is_set():
                await asyncio.sleep(0.5)
        finally:
            await scanner.stop()
