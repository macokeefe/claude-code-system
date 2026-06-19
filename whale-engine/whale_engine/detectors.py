"""Whale / unusual-activity detectors.

A move counts as a whale only if it's big in absolute terms (contracts),
big in dollars (cost basis), AND big relative to the market's own size
(a fraction of its open interest). That last part is what makes a 600-lot
in a tiny market and a 40k-lot in a giant market both register — and keeps
quiet markets from screaming just because their baseline is ~0.

Severity is reported against the market's recent baseline, but the
baseline is floored by `min_contracts` so we never show "999x vs ~0".

v1 detectors:
  - size_spike   : one unusually large single trade
  - volume_surge : a burst of volume in one interval
  - oi_jump      : a sharp step up in open interest (new conviction money)
  - sharp_move   : fast repricing within a short window (liquid markets only)
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

    def _size_floor(self, open_interest: int) -> float:
        """Minimum contracts to qualify, scaled to the market's open interest."""
        return max(self.th.min_contracts, self.th.oi_fraction * max(open_interest, 0))

    def _qualifies(self, contracts: float, price: float, open_interest: int) -> bool:
        notional = contracts * max(price, 0.01)
        return (contracts >= self._size_floor(open_interest)
                and notional >= self.th.min_notional)

    # --- snapshot-driven detectors (volume surge, OI jump, sharp move) ---
    def on_snapshot(self, snap: MarketSnapshot) -> list[Signal]:
        signals: list[Signal] = []
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
        deltas = [max(rows[i]["volume"] - rows[i + 1]["volume"], 0)
                  for i in range(len(rows) - 1)]
        if not deltas:
            return []
        current = deltas[0]
        if not self._qualifies(current, snap.yes_price, snap.open_interest):
            return []
        baseline = max(_median(deltas[1:]) or _median(deltas), th.min_contracts)
        mult = current / baseline
        oi_pct = (current / snap.open_interest * 100) if snap.open_interest else 0
        return [Signal(
            platform=snap.platform, market_id=snap.market_id, ts=snap.ts,
            type="volume_surge", severity=round(mult, 2),
            reason=(f"{int(current)} contracts (~${current*snap.yes_price:,.0f}) traded "
                    f"this interval — {oi_pct:.1f}% of open interest, {mult:.1f}x baseline"),
            price=snap.yes_price, question=snap.question,
            contracts=int(current), notional=current * snap.yes_price,
        )]

    def _oi_jump(self, snap: MarketSnapshot, rows: list) -> list[Signal]:
        th = self.th
        if _on_cooldown(self.store, snap.market_id, "oi_jump", snap.ts, th.cooldown_min):
            return []
        deltas = [rows[i]["open_interest"] - rows[i + 1]["open_interest"]
                  for i in range(len(rows) - 1)]
        if not deltas:
            return []
        current = deltas[0]
        if not self._qualifies(abs(current), snap.yes_price, snap.open_interest):
            return []
        baseline = max(_median([abs(d) for d in deltas[1:]]) or
                       _median([abs(d) for d in deltas]), th.min_contracts)
        mult = abs(current) / baseline
        direction = "added" if current > 0 else "closed"
        return [Signal(
            platform=snap.platform, market_id=snap.market_id, ts=snap.ts,
            type="oi_jump", severity=round(mult, 2),
            reason=(f"{int(abs(current))} new positions {direction} "
                    f"(~${abs(current)*snap.yes_price:,.0f}) — {mult:.1f}x baseline"),
            price=snap.yes_price, question=snap.question,
            contracts=int(abs(current)), notional=abs(current) * snap.yes_price,
            side=direction,
        )]

    def _sharp_move(self, snap: MarketSnapshot, rows: list) -> list[Signal]:
        th = self.th
        if snap.open_interest < th.sharp_move_min_oi:
            return []
        if _on_cooldown(self.store, snap.market_id, "sharp_move", snap.ts, th.cooldown_min):
            return []
        window_ms = th.sharp_move_window_min * _MIN_AGO_MS
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
                        f"{snap.yes_price*100:.0f}%)"),
                price=snap.yes_price, question=snap.question, side=direction,
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
        baseline = max(_median(sizes), 1)
        signals: list[Signal] = []
        for t in sorted(new_trades, key=lambda x: x.count, reverse=True):
            if not self._qualifies(t.count, t.price or snap.yes_price, snap.open_interest):
                continue
            if t.count < th.size_spike_mult * baseline:
                continue
            if _on_cooldown(self.store, snap.market_id, "size_spike", t.ts, th.cooldown_min):
                break
            mult = t.count / baseline
            signals.append(Signal(
                platform=snap.platform, market_id=snap.market_id, ts=t.ts,
                type="size_spike", severity=round(mult, 2),
                reason=(f"single trade of {t.count} contracts "
                        f"(~${t.count*(t.price or snap.yes_price):,.0f}) vs ~{baseline:.0f} "
                        f"median ({mult:.1f}x){' ' + t.taker_side if t.taker_side else ''}"),
                price=t.price or snap.yes_price, question=snap.question,
                contracts=t.count, notional=t.count * (t.price or snap.yes_price),
                side=t.taker_side,
            ))
            break  # one size-spike per market per cycle is enough
        return signals
