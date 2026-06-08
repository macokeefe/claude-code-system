"""Garmin Approach R10 BLE listener — real protocol implementation.

Protocol discovered via reverse engineering:

**Device Interface Service** (6A4E2800) — command/response, COBS encoded:
  6a4e2803  Read, Write, Write Without Response
  6a4e2822  Write, Write Without Response  (send commands here)
  6a4e2812  Read, Write, Write Without Response, Notify  (receive responses here)
  6a4e2811  Read, Write, Write Without Response, Notify

**Measurement Service** (6A4E3400) — shot data, raw protobuf:
  6a4e3401  Notify only  (shot data arrives here)
  6a4e3402  Write, Indicate  (control point)
  6a4e3403  Read, Notify  (status)

Initialization sequence:
  1. Subscribe notifications on 6a4e2812, 6a4e3401, 6a4e3403
  2. Send COBS handshake (bytes(24)) to 6a4e2822
  3. Wait for handshake response on 6a4e2812
  4. Send WakeUpRequest
  5. Send SubscribeRequest for LaunchMonitor alerts
  6. Shot data arrives on 6a4e3401 as raw protobuf

The active mode is written to CONNECTION_MODE.txt.
Raw BLE bytes are always logged to raw_ble_log.jsonl.
"""

from __future__ import annotations

import asyncio
import struct
from datetime import datetime
from pathlib import Path

from bleak import BleakClient, BleakScanner
from bleak.exc import BleakError

from session_paths import Clock, append_jsonl, write_json

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

R10_NAME_TOKENS = ("r10", "approach")
SCAN_TIMEOUT_S = 30.0
RECONNECT_INTERVAL_S = 5.0
HANDSHAKE_TIMEOUT_S = 5.0

# BLE notifications arrive some ms after ball impact; subtract to get impact time.
BLE_SHOT_DELAY_S = 1.5

# ---------------------------------------------------------------------------
# Characteristic UUIDs
# ---------------------------------------------------------------------------

# Device Interface Service (COBS encoded command/response)
UUID_CMD_TX  = "6a4e2822-667b-11e3-949a-0800200c9a66"  # send commands here
UUID_CMD_RX  = "6a4e2812-667b-11e3-949a-0800200c9a66"  # receive responses here
UUID_CMD_AUX = "6a4e2811-667b-11e3-949a-0800200c9a66"

# Measurement Service (raw protobuf)
UUID_SHOT   = "6a4e3401-667b-11e3-949a-0800200c9a66"  # shot data
UUID_CTRL   = "6a4e3402-667b-11e3-949a-0800200c9a66"  # control point
UUID_STATUS = "6a4e3403-667b-11e3-949a-0800200c9a66"  # status

KNOWN_R10_UUIDS: set[str] = {
    UUID_CMD_TX,
    UUID_CMD_RX,
    UUID_CMD_AUX,
    UUID_SHOT,
    UUID_CTRL,
    UUID_STATUS,
    "6a4e2803-667b-11e3-949a-0800200c9a66",
    "00002a19-0000-1000-8000-00805f9b34fb",  # battery
}

# Plausibility gates.
BALL_SPEED_RANGE   = (20.0, 220.0)   # mph
CARRY_RANGE        = (10.0, 400.0)   # yards
TOTAL_RANGE        = (10.0, 450.0)   # yards
LAUNCH_ANGLE_RANGE = (-10.0, 60.0)   # degrees
LAUNCH_DIR_RANGE   = (-45.0, 45.0)   # degrees
SPIN_RANGE         = (0.0, 14000.0)  # rpm
CLUB_SPEED_RANGE   = (10.0, 160.0)   # mph
CLUB_ANGLE_RANGE   = (-45.0, 45.0)   # degrees
ATTACK_ANGLE_RANGE = (-20.0, 20.0)   # degrees

# Legacy known-offset table (used by heuristic fallback).
KNOWN_OFFSETS = {
    "ball_speed_mph":       0,
    "launch_angle_deg":     4,
    "launch_direction_deg": 8,
    "spin_rate_rpm":        12,
    "carry_yards":          16,
    "total_yards":          20,
}

# Error patterns indicating R10 is paired to another central.
_ALREADY_CONNECTED_PATTERNS = (
    "already connected",
    "in use",
    "busy",
    "connection refused",
    "connection attempt failed",
    "org.bluez.error.connectionattemptfailed",
    "org.bluez.error.alreadyconnected",
)

# Pre-encoded protobuf payloads (hand-encoded, no protobuf library required).
#   WakeUpRequest:    WrapperProto { LaunchMonitorService(field38) { WakeUpRequest(field3) {} } }
#   SubscribeRequest: WrapperProto { EventSharing(field30) { SubscribeRequest(field1) { alerts(field1) { type=8 } } } }
#   AlertType 8 = LaunchMonitor (confirmed from gsp-r10-adapter)
_PROTO_WAKE_UP   = b'\xB2\x02\x02\x1A\x00'
_PROTO_SUBSCRIBE = b'\xF2\x01\x06\x0A\x04\x0A\x02\x08\x08'


# ---------------------------------------------------------------------------
# COBS codec (implemented from scratch — no external library)
# ---------------------------------------------------------------------------

def cobs_encode(data: bytes) -> bytes:
    """Standard COBS encoding."""
    output = bytearray()
    data = bytearray(data)
    code_idx = 0
    output.append(0)  # placeholder
    code = 1
    for byte in data:
        if byte == 0:
            output[code_idx] = code
            code_idx = len(output)
            output.append(0)
            code = 1
        else:
            output.append(byte)
            code += 1
            if code == 0xFF:
                output[code_idx] = code
                code_idx = len(output)
                output.append(0)
                code = 1
    output[code_idx] = code
    return bytes(output)


def cobs_decode(data: bytes) -> bytes:
    """Standard COBS decoding."""
    output = bytearray()
    data = bytearray(data)
    idx = 0
    while idx < len(data):
        code = data[idx]
        idx += 1
        for _ in range(code - 1):
            if idx >= len(data):
                break
            output.append(data[idx])
            idx += 1
        if code < 0xFF and idx < len(data):
            output.append(0)
    # Remove trailing zero added by algorithm.
    if output and output[-1] == 0:
        output = output[:-1]
    return bytes(output)


# ---------------------------------------------------------------------------
# CRC-16 (polynomial 0xA001, init 0xFFFF)
# ---------------------------------------------------------------------------

def crc16(data: bytes) -> int:
    crc = 0xFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc


# ---------------------------------------------------------------------------
# Message framing for Device Interface service
# ---------------------------------------------------------------------------

def build_frame(payload: bytes) -> bytes:
    """Frame a protobuf payload for the Device Interface service.

    Steps:
      1. Prepend 2-byte little-endian length
      2. Append CRC-16 of length-prefixed payload
      3. COBS encode
      4. Wrap: b'\x00' + cobs_encoded + b'\x00'
    """
    length_prefix = struct.pack("<H", len(payload))
    lp_payload = length_prefix + payload
    crc = crc16(lp_payload)
    crc_bytes = struct.pack("<H", crc)
    raw = lp_payload + crc_bytes
    encoded = cobs_encode(raw)
    return b'\x00' + encoded + b'\x00'


def _handshake_frame(header: int = 0x00) -> bytes:
    """Raw 13-byte handshake: mHeader + 12 known bytes. Written without COBS."""
    return bytes([header]) + bytes.fromhex("000000000000000000010000")


def build_b313_message(payload: bytes, counter: int, header: int = 0x00) -> list[bytes]:
    """Wrap payload in B313 frame, COBS-encode, split into ≤19-byte chunks.

    Each chunk is prefixed with mHeader so the R10 can reassemble multi-chunk
    messages.  Returns a list of byte strings to write sequentially.
    """
    b313 = b'\xB3\x13' + struct.pack("<H", counter) + b'\x00\x00'
    length = struct.pack("<I", len(payload))
    full_msg = b313 + length + length + payload
    length_prefix = struct.pack("<H", len(full_msg))
    framed = length_prefix + full_msg
    crc = crc16(framed)
    framed += struct.pack("<H", crc)
    encoded = b'\x00' + cobs_encode(framed) + b'\x00'
    chunks = []
    for i in range(0, len(encoded), 19):
        chunks.append(bytes([header]) + encoded[i:i + 19])
    return chunks


# ---------------------------------------------------------------------------
# Protobuf shot data parser
# ---------------------------------------------------------------------------

def _read_varint(data: bytes, pos: int):
    """Read a protobuf varint starting at pos. Returns (value, new_pos)."""
    result = 0
    shift = 0
    while pos < len(data):
        b = data[pos]
        pos += 1
        result |= (b & 0x7F) << shift
        if not (b & 0x80):
            return result, pos
        shift += 7
    raise ValueError("Truncated varint")


def _parse_message(data: bytes) -> dict:
    """Walk protobuf wire format and return {field_number: [(wire_type, value), ...]}."""
    fields: dict[int, list] = {}
    pos = 0
    while pos < len(data):
        tag, pos = _read_varint(data, pos)
        field_number = tag >> 3
        wire_type = tag & 0x7
        if wire_type == 0:  # varint
            val, pos = _read_varint(data, pos)
        elif wire_type == 1:  # 64-bit
            val = data[pos:pos + 8]
            pos += 8
        elif wire_type == 2:  # length-delimited
            length, pos = _read_varint(data, pos)
            val = data[pos:pos + length]
            pos += length
        elif wire_type == 5:  # 32-bit
            val = data[pos:pos + 4]
            pos += 4
        else:
            raise ValueError(f"Unknown wire type {wire_type}")
        fields.setdefault(field_number, []).append((wire_type, val))
    return fields


def _get_f32(fields: dict, field_number: int) -> float | None:
    """Extract a float32 value (wire type 5) from parsed fields."""
    for wtype, val in fields.get(field_number, []):
        if wtype == 5 and isinstance(val, (bytes, bytearray)) and len(val) == 4:
            return struct.unpack("<f", val)[0]
    return None


def parse_protobuf_shot(data: bytes) -> dict | None:
    """Parse a raw protobuf shot notification from 6a4e3401.

    Field layout:
      Field 1 = shot_id (varint)
      Field 3 = BallMetrics (length-delimited)
        Field 1 = launch_angle (float32)
        Field 2 = launch_direction (float32)
        Field 3 = ball_speed (float32, m/s — multiply by 2.2369 for mph)
        Field 4 = spin_axis (float32, degrees)
        Field 5 = total_spin (float32, RPM)
      Field 4 = ClubMetrics (length-delimited)
        Field 1 = club_head_speed (float32, m/s — multiply by 2.2369)
        Field 2 = club_angle_face (float32)
        Field 3 = club_angle_path (float32)
        Field 4 = attack_angle (float32)

    Returns None on any parse error.
    """
    try:
        fields = _parse_message(data)
        result: dict = {}

        # shot_id (field 1, varint)
        for wtype, val in fields.get(1, []):
            if wtype == 0:
                result["shot_id"] = val
                break

        # BallMetrics (field 3, length-delimited)
        for wtype, val in fields.get(3, []):
            if wtype == 2 and isinstance(val, (bytes, bytearray)):
                bfields = _parse_message(val)
                launch_angle  = _get_f32(bfields, 1)
                launch_dir    = _get_f32(bfields, 2)
                ball_speed_ms = _get_f32(bfields, 3)
                spin_axis     = _get_f32(bfields, 4)
                total_spin    = _get_f32(bfields, 5)
                if ball_speed_ms is not None:
                    result["ball_speed_mph"] = round(ball_speed_ms * 2.2369, 2)
                if launch_angle is not None:
                    result["launch_angle_deg"] = round(launch_angle, 2)
                if launch_dir is not None:
                    result["launch_direction_deg"] = round(launch_dir, 2)
                if spin_axis is not None:
                    result["spin_axis_deg"] = round(spin_axis, 2)
                if total_spin is not None:
                    result["spin_rate_rpm"] = round(total_spin, 2)
                break

        # ClubMetrics (field 4, length-delimited)
        for wtype, val in fields.get(4, []):
            if wtype == 2 and isinstance(val, (bytes, bytearray)):
                cfields = _parse_message(val)
                club_speed_ms = _get_f32(cfields, 1)
                face_angle    = _get_f32(cfields, 2)
                path_angle    = _get_f32(cfields, 3)
                attack_angle  = _get_f32(cfields, 4)
                if club_speed_ms is not None:
                    result["club_head_speed_mph"] = round(club_speed_ms * 2.2369, 2)
                if face_angle is not None:
                    result["club_face_angle_deg"] = round(face_angle, 2)
                if path_angle is not None:
                    result["club_path_deg"] = round(path_angle, 2)
                if attack_angle is not None:
                    result["attack_angle_deg"] = round(attack_angle, 2)
                break

        if not result:
            return None

        # Apply plausibility gates.
        def gate(field: str, lo: float, hi: float) -> None:
            v = result.get(field)
            if v is not None and not (v == v and lo <= v <= hi):
                result[field] = None

        gate("ball_speed_mph",       *BALL_SPEED_RANGE)
        gate("launch_angle_deg",     *LAUNCH_ANGLE_RANGE)
        gate("launch_direction_deg", *LAUNCH_DIR_RANGE)
        gate("spin_rate_rpm",        *SPIN_RANGE)
        gate("club_head_speed_mph",  *CLUB_SPEED_RANGE)
        gate("club_face_angle_deg",  *CLUB_ANGLE_RANGE)
        gate("club_path_deg",        *CLUB_ANGLE_RANGE)
        gate("attack_angle_deg",     *ATTACK_ANGLE_RANGE)

        result["parse_source"] = "protobuf"
        return result
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Heuristic / legacy helpers (kept for fallback)
# ---------------------------------------------------------------------------

def _f32(data: bytes, offset: int) -> float | None:
    if offset < 0 or offset + 4 > len(data):
        return None
    try:
        return struct.unpack_from("<f", data, offset)[0]
    except struct.error:
        return None


def _in_range(value, lo, hi) -> bool:
    return value is not None and value == value and lo <= value <= hi


def candidate_floats(data: bytes) -> list[dict]:
    """Decode every LE float32 window for manual inspection."""
    out = []
    for off in range(0, max(0, len(data) - 3)):
        val = _f32(data, off)
        if val is not None and val == val and abs(val) < 1e6:
            out.append({"offset": off, "le_f32": round(val, 4)})
    return out


def parse_shot_heuristic(data: bytes) -> dict | None:
    """Legacy best-effort heuristic decoder. Returns None on any doubt."""
    try:
        shot = {field: _f32(data, off) for field, off in KNOWN_OFFSETS.items()}
        if _in_range(shot.get("ball_speed_mph"), *BALL_SPEED_RANGE) and \
           _in_range(shot.get("carry_yards"), *CARRY_RANGE):
            return _finalize_shot(shot, source="known_offsets")

        for base in range(0, max(0, len(data) - 3)):
            speed = _f32(data, base)
            if not _in_range(speed, *BALL_SPEED_RANGE):
                continue
            window = {
                "ball_speed_mph":       speed,
                "launch_angle_deg":     _f32(data, base + 4),
                "launch_direction_deg": _f32(data, base + 8),
                "spin_rate_rpm":        _f32(data, base + 12),
                "carry_yards":          _f32(data, base + 16),
                "total_yards":          _f32(data, base + 20),
            }
            if _in_range(window["carry_yards"], *CARRY_RANGE):
                return _finalize_shot(window, source=f"scan@{base}")
        return None
    except Exception:
        return None


# Keep old name as alias so existing callers do not break.
parse_shot = parse_shot_heuristic


def _finalize_shot(shot: dict, source: str) -> dict | None:
    if not _in_range(shot.get("ball_speed_mph"), *BALL_SPEED_RANGE):
        return None
    if not _in_range(shot.get("carry_yards"), *CARRY_RANGE):
        return None

    def gate(field, lo, hi):
        v = shot.get(field)
        shot[field] = round(v, 2) if _in_range(v, lo, hi) else None

    gate("ball_speed_mph",       *BALL_SPEED_RANGE)
    gate("carry_yards",          *CARRY_RANGE)
    gate("total_yards",          *TOTAL_RANGE)
    gate("launch_angle_deg",     *LAUNCH_ANGLE_RANGE)
    gate("launch_direction_deg", *LAUNCH_DIR_RANGE)
    gate("spin_rate_rpm",        *SPIN_RANGE)
    shot["club_type"] = None
    shot["parse_source"] = source
    return shot


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

def is_r10_name(name: str | None) -> bool:
    if not name:
        return False
    lowered = name.lower()
    return any(token in lowered for token in R10_NAME_TOKENS)


def _is_already_connected_error(exc: BleakError) -> bool:
    msg = str(exc).lower()
    return any(pat in msg for pat in _ALREADY_CONNECTED_PATTERNS)


async def find_r10(timeout: float = SCAN_TIMEOUT_S):
    """Scan for an R10. Returns (BLEDevice|None, discovered_list)."""
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
    """`scan` entry point: connect and write r10_characteristics.json."""
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
        if _is_already_connected_error(exc):
            diagnosis = (
                "R10 appears to be connected to another device (likely your iPhone). "
                "To connect directly: Settings -> Bluetooth on your iPhone -> "
                "tap the R10 -> Forget This Device, then re-run scan."
            )
            print(f"[ble] {diagnosis}")
            catalog["connection_refused_diagnosis"] = diagnosis
        write_json(session_dir / "r10_characteristics.json", catalog)
        return False

    write_json(session_dir / "r10_characteristics.json", catalog)
    print(f"[ble] wrote {session_dir / 'r10_characteristics.json'}")
    return True


# ---------------------------------------------------------------------------
# debug-ble: real-protocol live printer
# ---------------------------------------------------------------------------

async def debug_ble_live(timeout: float = SCAN_TIMEOUT_S) -> None:
    """Connect, run the R10 init sequence, and print all raw BLE data live.

    Formatted output: timestamp, UUID, hex dump, candidate float decodes.
    Runs until Ctrl+C.  Does NOT write session files.
    """
    device, _ = await find_r10(timeout)
    if device is None:
        print("[debug-ble] No R10 found. Cannot start live debug.")
        return

    notify_count = 0
    handshake_done = asyncio.Event()

    def handle_notification(char_uuid: str, data: bytearray) -> None:
        nonlocal notify_count
        notify_count += 1
        raw = bytes(data)
        ts = datetime.now().isoformat(timespec="milliseconds")

        known_marker = " *** KNOWN ***" if char_uuid.lower() in KNOWN_R10_UUIDS else ""
        print(f"\n[{ts}] #{notify_count}  uuid={char_uuid}{known_marker}")
        print(f"  hex  : {raw.hex(' ')}")
        print(f"  len  : {len(raw)} bytes")

        if char_uuid.lower() == UUID_SHOT:
            shot = parse_protobuf_shot(raw)
            if shot:
                print(f"  shot : {shot}")

        if char_uuid.lower() == UUID_CMD_RX:
            try:
                stripped = raw.strip(b'\x00')
                if stripped:
                    decoded = cobs_decode(stripped)
                    print(f"  cobs : {decoded.hex(' ')}")
                    if len(decoded) > 12:
                        print(f"  hdr12: 0x{decoded[12]:02x}")
            except Exception as e:
                print(f"  cobs : decode error: {e}")
            if not handshake_done.is_set():
                handshake_done.set()

        candidates = candidate_floats(raw)
        top5 = candidates[:5]
        if top5:
            parts = "  ".join(f"@{c['offset']}={c['le_f32']}" for c in top5)
            print(f"  f32s : {parts}")

    print("[debug-ble] connecting...")
    try:
        async with BleakClient(device) as client:
            if not client.is_connected:
                print("[debug-ble] Failed to connect.")
                return
            print(f"[debug-ble] connected to {device.address}")
            print("[debug-ble] Press Ctrl+C to stop.\n")

            for uuid in (UUID_CMD_RX, UUID_SHOT, UUID_STATUS):
                try:
                    def make_cb(u: str):
                        return lambda _sender, data: handle_notification(u, data)
                    await client.start_notify(uuid, make_cb(uuid))
                    print(f"  subscribed: {uuid}")
                except BleakError as exc:
                    print(f"  [warn] start_notify failed for {uuid}: {exc}")

            for service in client.services:
                for char in service.characteristics:
                    if ("notify" in char.properties or "indicate" in char.properties) \
                            and char.uuid not in (UUID_CMD_RX, UUID_SHOT, UUID_STATUS):
                        u = char.uuid
                        def make_cb2(uu: str):
                            return lambda _sender, data: handle_notification(uu, data)
                        try:
                            await client.start_notify(char, make_cb2(u))
                            print(f"  subscribed: {u}")
                        except BleakError:
                            pass

            print("[debug-ble] sending handshake (raw, no COBS)...")
            await client.write_gatt_char(UUID_CMD_TX, _handshake_frame(0x00), response=False)

            mheader = 0x00
            try:
                await asyncio.wait_for(handshake_done.wait(), timeout=HANDSHAKE_TIMEOUT_S)
                print("[debug-ble] handshake response received")
            except asyncio.TimeoutError:
                print("[debug-ble] handshake timed out — continuing anyway")

            await asyncio.sleep(0.1)
            for chunk in build_b313_message(_PROTO_WAKE_UP, counter=0, header=mheader):
                await client.write_gatt_char(UUID_CMD_TX, chunk, response=False)
                await asyncio.sleep(0.01)
            print("[debug-ble] sent WakeUpRequest")
            await asyncio.sleep(0.3)
            for chunk in build_b313_message(_PROTO_SUBSCRIBE, counter=1, header=mheader):
                await client.write_gatt_char(UUID_CMD_TX, chunk, response=False)
                await asyncio.sleep(0.01)
            print("[debug-ble] sent SubscribeRequest (LaunchMonitor, AlertType=8)")

            while client.is_connected:
                await asyncio.sleep(0.5)
            print("[debug-ble] Connection dropped.")
    except BleakError as exc:
        if _is_already_connected_error(exc):
            print(
                "[debug-ble] R10 appears to be connected to another device (likely your "
                "iPhone). Settings -> Bluetooth -> tap the R10 -> Forget This Device."
            )
        else:
            print(f"[debug-ble] BLE error: {exc}")


# ---------------------------------------------------------------------------
# Live listener
# ---------------------------------------------------------------------------

class R10Listener:
    """Connects to the R10 using the real protocol, logs raw + parsed data.

    Falls back to passive advertisement scanning if connection fails.
    Designed to run as an asyncio task alongside the video recorder.
    """

    def __init__(self, session_dir: Path, clock: Clock, on_shot=None):
        self.session_dir = session_dir
        self.clock = clock
        self.on_shot = on_shot
        self.raw_log   = session_dir / "raw_ble_log.jsonl"
        self.shots_log = session_dir / "shots_raw.jsonl"
        self.gaps_log  = session_dir / "ble_gaps.txt"
        self.mode_file = session_dir / "CONNECTION_MODE.txt"
        self.shot_count = 0
        self._stop = asyncio.Event()
        self._notify_count = 0
        self._handshake_event: asyncio.Event | None = None
        self._handshake_header: int | None = None

    def stop(self) -> None:
        self._stop.set()

    # -- notification handlers ------------------------------------------------

    def _handle_cmd_rx(self, _sender, data: bytearray):
        """Handle responses on the Device Interface response channel (COBS)."""
        import time
        raw = bytes(data)
        stamp = self.clock.stamp()
        self._notify_count += 1

        log_entry: dict = {
            **stamp,
            "char_uuid": UUID_CMD_RX,
            "length": len(raw),
            "hex": raw.hex(" "),
            "bytes": list(raw),
            "ascii": "".join(chr(b) if 32 <= b < 127 else "." for b in raw),
        }

        try:
            stripped = raw.strip(b'\x00')
            if stripped:
                decoded = cobs_decode(stripped)
                log_entry["cobs_decoded_hex"] = decoded.hex(" ")
                if len(decoded) > 12:
                    self._handshake_header = decoded[12]
                    log_entry["handshake_header"] = self._handshake_header
        except Exception as e:
            log_entry["cobs_decode_error"] = str(e)

        append_jsonl(self.raw_log, log_entry)

        if self._handshake_event and not self._handshake_event.is_set():
            self._handshake_event.set()

    def _handle_shot(self, _sender, data: bytearray):
        """Handle shot data on the Measurement Service characteristic (protobuf)."""
        import time
        notification_wall = time.time()
        stamp = self.clock.stamp()
        raw = bytes(data)
        self._notify_count += 1

        append_jsonl(self.raw_log, {
            **stamp,
            "char_uuid": UUID_SHOT,
            "length": len(raw),
            "hex": raw.hex(" "),
            "bytes": list(raw),
            "ascii": "".join(chr(b) if 32 <= b < 127 else "." for b in raw),
            "candidate_le_f32": candidate_floats(raw),
        })

        shot = parse_protobuf_shot(raw)
        parse_method = "protobuf"
        if shot is None:
            shot = parse_shot_heuristic(raw)
            parse_method = "heuristic"

        if shot is not None:
            self.shot_count += 1
            corrected_wall = notification_wall - BLE_SHOT_DELAY_S
            record = {
                **stamp,
                "notification_wall": notification_wall,
                "wall": corrected_wall,
                "char_uuid": UUID_SHOT,
                "shot_index": self.shot_count,
                "hex": raw.hex(" "),
                **shot,
            }
            append_jsonl(self.shots_log, record)
            speed = shot.get("ball_speed_mph")
            carry = shot.get("carry_yards")
            print(f"[ble] SHOT #{self.shot_count}  ball_speed={speed} mph  "
                  f"carry={carry} yds  ({parse_method}/{shot.get('parse_source', '')})")
            if self.on_shot:
                self.on_shot(record, stamp)

    def _handle_status(self, _sender, data: bytearray):
        """Handle status notifications."""
        raw = bytes(data)
        stamp = self.clock.stamp()
        append_jsonl(self.raw_log, {
            **stamp,
            "char_uuid": UUID_STATUS,
            "length": len(raw),
            "hex": raw.hex(" "),
            "bytes": list(raw),
        })

    def _handle_generic(self, char_uuid: str, data: bytearray):
        """Generic handler for any other notifiable characteristic."""
        raw = bytes(data)
        stamp = self.clock.stamp()
        self._notify_count += 1
        known_marker = " *** KNOWN UUID ***" if char_uuid.lower() in KNOWN_R10_UUIDS else ""
        if known_marker:
            print(f"[ble]{known_marker}  uuid={char_uuid}")
        append_jsonl(self.raw_log, {
            **stamp,
            "char_uuid": char_uuid,
            "length": len(raw),
            "hex": raw.hex(" "),
            "bytes": list(raw),
            "ascii": "".join(chr(b) if 32 <= b < 127 else "." for b in raw),
            "candidate_le_f32": candidate_floats(raw),
        })

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
        """Find the R10, run the real init sequence, maintain auto-reconnect.

        Falls back to passive advertisement logging if connection is refused.
        """
        device, _ = await find_r10()
        if device is None:
            self._set_mode("none", "No R10 discovered; nothing to listen to.")
            return

        connected_once = await self._try_connected_session(device)
        if connected_once:
            return
        print("[ble] active connection unavailable; switching to passive scan.")
        await self._passive_scan(device)

    async def _try_connected_session(self, device) -> bool:
        """Maintain notify subscription with auto-reconnect."""
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

                    self._handshake_event = asyncio.Event()
                    self._handshake_header = None

                    await self._init_protocol(client)
                    print("[ble] protocol init complete; listening for shots.")

                    while client.is_connected and not self._stop.is_set():
                        await asyncio.sleep(0.5)
                    if not client.is_connected and not self._stop.is_set():
                        self._log_gap("connection dropped; will reconnect")
                        print("[ble] connection dropped — reconnecting...")
            except BleakError as exc:
                if first_attempt and not ever_connected:
                    self._log_gap(f"connect failed: {exc}")
                    return False
                self._log_gap(f"connect error: {exc}; retry in {RECONNECT_INTERVAL_S}s")
                print(f"[ble] error: {exc}; retrying in {RECONNECT_INTERVAL_S}s")
            first_attempt = False
            if self._stop.is_set():
                break
            await asyncio.sleep(RECONNECT_INTERVAL_S)
        return ever_connected

    async def _init_protocol(self, client: BleakClient):
        """Run the R10 initialization sequence on an already-connected client."""
        # 1. Subscribe to response channel.
        try:
            await client.start_notify(UUID_CMD_RX, self._handle_cmd_rx)
            print(f"[ble] subscribed: {UUID_CMD_RX} (cmd_rx)")
        except BleakError as exc:
            self._log_gap(f"start_notify failed for {UUID_CMD_RX}: {exc}")

        # 2. Subscribe to shot data.
        try:
            await client.start_notify(UUID_SHOT, self._handle_shot)
            print(f"[ble] subscribed: {UUID_SHOT} (shot)")
        except BleakError as exc:
            self._log_gap(f"start_notify failed for {UUID_SHOT}: {exc}")

        # 3. Subscribe to status.
        try:
            await client.start_notify(UUID_STATUS, self._handle_status)
            print(f"[ble] subscribed: {UUID_STATUS} (status)")
        except BleakError as exc:
            self._log_gap(f"start_notify failed for {UUID_STATUS}: {exc}")

        # Also subscribe to any other notifiable characteristics for raw logging.
        known_subscribed = {UUID_CMD_RX, UUID_SHOT, UUID_STATUS}
        for service in client.services:
            for char in service.characteristics:
                if ("notify" in char.properties or "indicate" in char.properties) \
                        and char.uuid not in known_subscribed:
                    u = char.uuid
                    def make_cb(uu: str):
                        return lambda _sender, data: self._handle_generic(uu, data)
                    try:
                        await client.start_notify(char, make_cb(u))
                    except BleakError as exc:
                        self._log_gap(f"start_notify failed for {u}: {exc}")

        # 4. Send handshake (raw bytes — no COBS, no B313).
        print("[ble] sending handshake...")
        try:
            await client.write_gatt_char(
                UUID_CMD_TX, _handshake_frame(header=0x00), response=False
            )
        except BleakError as exc:
            self._log_gap(f"handshake write failed: {exc}")
            print(f"[ble] handshake write failed: {exc}")

        # 5. Wait for handshake response; extract mHeader from byte 12.
        if self._handshake_event is not None:
            try:
                await asyncio.wait_for(
                    self._handshake_event.wait(), timeout=HANDSHAKE_TIMEOUT_S
                )
                hdr = self._handshake_header
                if hdr is not None:
                    print(f"[ble] handshake response received (mHeader=0x{hdr:02x})")
                else:
                    print("[ble] handshake response received (no mHeader extracted)")
            except asyncio.TimeoutError:
                print("[ble] handshake timed out — continuing anyway")

        mheader = self._handshake_header if self._handshake_header is not None else 0x00

        # 6. Send WakeUpRequest via B313 framing, chunked, mHeader-prefixed.
        await asyncio.sleep(0.1)
        try:
            chunks = build_b313_message(_PROTO_WAKE_UP, counter=0, header=mheader)
            for chunk in chunks:
                await client.write_gatt_char(UUID_CMD_TX, chunk, response=False)
                await asyncio.sleep(0.01)
            print(f"[ble] sent WakeUpRequest ({len(chunks)} chunk(s))")
        except BleakError as exc:
            self._log_gap(f"WakeUpRequest write failed: {exc}")

        await asyncio.sleep(0.3)

        # 7. Send SubscribeRequest for LaunchMonitor alerts (AlertType=8).
        try:
            chunks = build_b313_message(_PROTO_SUBSCRIBE, counter=1, header=mheader)
            for chunk in chunks:
                await client.write_gatt_char(UUID_CMD_TX, chunk, response=False)
                await asyncio.sleep(0.01)
            print(f"[ble] sent SubscribeRequest LaunchMonitor ({len(chunks)} chunk(s))")
        except BleakError as exc:
            self._log_gap(f"SubscribeRequest write failed: {exc}")

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
