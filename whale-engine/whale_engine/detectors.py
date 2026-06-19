"""Whale / unusual-activity detectors.

Each detector judges a market against *its own* recent history, so
thresholds are relative to that market's normal size (per SPEC.md §2).
All detectors honor a per-(market, type) cooldown so the same event
doesn't re-fire every poll.

v1 detectors:
  - size_spike   : one unusually large single trade
  - volume_surge : a burst of volume in one interval
  - oi_jump      : a sharp step up in open interest (new conviction money)
  - sharp_move   : fast repricing within a short window
"""

from __future__ import annotations

import statistics

from .config import Thresholds
from .models import MarketSnapshot, Signal, TradeEvent
from .storage import Storage

_MIN_AGO_MS = 60_000


def _median(values: list[float]) -> float:
    return statistics.median(values) if values else 0.0


def _on_cooldown(store: Storage, market_id: str, sig_type: str,
                 now_ts: int, cooldown_min: int) -> bool:
    last = store.last_signal_ts(market_id, sig_type)
    return last is not None and (now_ts - last) < cooldown_min * _MIN_AGO_MS


class Detectors:
    def __init__(self, store: Storage, th: Thresholds) -> None:
        self.store = store
        self.th = th

    # --- snapshot-driven detectors (volume surge, OI jump, sharp move) ---
    def on_snapshot(self, snap: MarketSnapshot) -> list[Signal]:
        signals: list[Signal] = []
        # Rows are newest-first; [0] is the snapshot we just stored.
        rows = self.store.recent_snapshots(snap.market_id, self.th.baseline_window)
        if len(rows) < self.th.min_history:
            return signals

        signals += self._volume_surge(snap, rows)
        signals += self._oi_jump(snap, rows)
        signals += self._sharp_move(snap, rows)
        return signals

    def _volume_surge(self, snap: MarketSnapshot, rows: list) -> list[Signal]:
        th = self.th
        if _on_cooldown(self.store, snap.market_id, "volume_surge", snap.ts, th.cooldown_min):
            return []
        # interval volume = consecutive deltas of cumulative volume (newest-first)
        deltas = [max(rows[i]["volume"] - rows[i + 1]["volume"], 0)
                  for i in range(len(rows) - 1)]
        if not deltas:
            return []
        current = deltas[0]
        baseline = _median(deltas[1:]) or _median(deltas)
        if current >= th.volume_surge_min and current >= th.volume_surge_mult * max(baseline, 1):
            mult = current / max(baseline, 1)
            return [Signal(
                platform=snap.platform, market_id=snap.market_id, ts=snap.ts,
                type="volume_surge", severity=round(mult, 2),
                reason=f"{current} contracts this interval vs ~{baseline:.0f} baseline ({mult:.1f}x)",
                price=snap.yes_price, question=snap.question,
            )]
        return []

    def _oi_jump(self, snap: MarketSnapshot, rows: list) -> list[Signal]:
        th = self.th
        if _on_cooldown(self.store, snap.market_id, "oi_jump", snap.ts, th.cooldown_min):
            return []
        deltas = [rows[i]["open_interest"] - rows[i + 1]["open_interest"]
                  for i in range(len(rows) - 1)]
        if not deltas:
            return []
        current = deltas[0]
        baseline = _median([abs(d) for d in deltas[1:]]) or _median([abs(d) for d in deltas])
        if abs(current) >= th.oi_jump_min and abs(current) >= th.oi_jump_mult * max(baseline, 1):
            mult = abs(current) / max(baseline, 1)
            direction = "added" if current > 0 else "closed"
            return [Signal(
                platform=snap.platform, market_id=snap.market_id, ts=snap.ts,
                type="oi_jump", severity=round(mult, 2),
                reason=f"open interest {direction} {abs(current)} vs ~{baseline:.0f} baseline ({mult:.1f}x)",
                price=snap.yes_price, question=snap.question,
            )]
        return []

    def _sharp_move(self, snap: MarketSnapshot, rows: list) -> list[Signal]:
        th = self.th
        if _on_cooldown(self.store, snap.market_id, "sharp_move", snap.ts, th.cooldown_min):
            return []
        window_ms = th.sharp_move_window_min * _MIN_AGO_MS
        # find the most recent snapshot at least `window` older than now
        past = next((r for r in rows if snap.ts - r["ts"] >= window_ms), None)
        if past is None:
            return []
        delta = snap.yes_price - past["yes_price"]
        if abs(delta) >= th.sharp_move_delta:
            direction = "up" if delta > 0 else "down"
            return [Signal(
                platform=snap.platform, market_id=snap.market_id, ts=snap.ts,
                type="sharp_move", severity=round(abs(delta), 3),
                reason=(f"implied prob moved {direction} {abs(delta)*100:.0f} pts in "
                        f"~{th.sharp_move_window_min}m ({past['yes_price']*100:.0f}->"
                        f"{snap.yes_price*100:.0f})"),
                price=snap.yes_price, question=snap.question,
            )]
        return []

    # --- trade-driven detector (size spike) ---
    def on_trades(self, snap: MarketSnapshot, new_trades: list[TradeEvent]) -> list[Signal]:
        th = self.th
        if not new_trades:
            return []
        history = self.store.recent_trades(snap.market_id, th.baseline_window)
        sizes = [r["count"] for r in history]
        if len(sizes) < th.min_history:
            return []
        baseline = _median(sizes)
        signals: list[Signal] = []
        for t in sorted(new_trades, key=lambda x: x.count, reverse=True):
            if t.count >= th.size_spike_min and t.count >= th.size_spike_mult * max(baseline, 1):
                if _on_cooldown(self.store, snap.market_id, "size_spike", t.ts, th.cooldown_min):
                    break
                mult = t.count / max(baseline, 1)
                signals.append(Signal(
                    platform=snap.platform, market_id=snap.market_id, ts=t.ts,
                    type="size_spike", severity=round(mult, 2),
                    reason=(f"single trade of {t.count} contracts vs ~{baseline:.0f} median "
                            f"({mult:.1f}x){' ' + t.taker_side if t.taker_side else ''}"),
                    price=t.price, question=snap.question,
                ))
                break  # one size-spike signal per market per cycle is enough
        return signals
