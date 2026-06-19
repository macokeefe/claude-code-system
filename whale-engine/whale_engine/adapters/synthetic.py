"""Synthetic source — a fake market simulator for offline demos & tests.

Generates a handful of markets whose prices random-walk and whose volume
grows steadily, then occasionally injects a "whale" event (a big trade,
a volume burst, an OI jump, or a sharp repricing). Lets you watch the
full pipeline fire signals with no network or API key.
"""

from __future__ import annotations

import random

from ..models import MarketSnapshot, TradeEvent, now_ms

_QUESTIONS = [
    ("PRES-2028-DEM", "Will the Democratic nominee win the 2028 election?"),
    ("FED-CUT-JUL", "Will the Fed cut rates in July?"),
    ("BTC-100K-EOY", "Will BTC close above $100k this year?"),
    ("SB-CHIEFS", "Will the Chiefs win the Super Bowl?"),
    ("CPI-HOT-MAY", "Will May CPI come in above 3.5%?"),
]


class _MarketState:
    def __init__(self, ticker: str, question: str, seed: int) -> None:
        self.ticker = ticker
        self.question = question
        self.rng = random.Random(seed)
        self.price = self.rng.uniform(0.25, 0.75)
        self.volume = self.rng.randint(1_000, 5_000)
        self.open_interest = self.rng.randint(500, 3_000)
        # spread close times so the "closing soon" view has variety
        days = self.rng.choice([0.1, 1, 3, 12, 90])
        self.close_ts = now_ms() + int(days * 86_400_000)
        self._pending_trades: list[TradeEvent] = []

    def step(self) -> MarketSnapshot:
        # normal drift
        self.price = max(0.02, min(0.98, self.price + self.rng.gauss(0, 0.01)))
        base_vol = self.rng.randint(20, 80)
        base_oi = self.rng.randint(-30, 60)
        ts = now_ms()

        roll = self.rng.random()
        if roll < 0.04:          # whale: volume burst
            base_vol += self.rng.randint(1_500, 4_000)
        elif roll < 0.07:        # whale: OI jump (new conviction)
            base_oi += self.rng.randint(1_500, 3_500)
        elif roll < 0.10:        # whale: sharp move
            self.price = max(0.02, min(0.98, self.price + self.rng.choice([-1, 1]) * 0.15))
        elif roll < 0.14:        # whale: one giant trade
            big = self.rng.randint(2_000, 6_000)
            base_vol += big
            self._pending_trades.append(TradeEvent(
                platform="synthetic", market_id=self.ticker, ts=ts,
                price=self.price, count=big,
                taker_side=self.rng.choice(["yes", "no"]),
                trade_id=f"{self.ticker}:{ts}:{big}",
            ))
        else:                    # normal small trades
            for _ in range(self.rng.randint(1, 4)):
                c = self.rng.randint(5, 50)
                self._pending_trades.append(TradeEvent(
                    platform="synthetic", market_id=self.ticker, ts=ts,
                    price=self.price, count=c,
                    taker_side=self.rng.choice(["yes", "no"]),
                    trade_id=f"{self.ticker}:{ts}:{c}:{self.rng.randint(0, 1_000_000)}",
                ))

        self.volume += base_vol
        self.open_interest = max(0, self.open_interest + base_oi)
        return MarketSnapshot(
            platform="synthetic", market_id=self.ticker, question=self.question,
            status="open", ts=ts, yes_price=round(self.price, 3),
            volume=self.volume, open_interest=self.open_interest,
            liquidity=float(self.open_interest * 10), close_ts=self.close_ts,
        )


class SyntheticSource:
    name = "synthetic"

    def __init__(self, market_limit: int) -> None:
        self.states = {
            t: _MarketState(t, q, seed=i)
            for i, (t, q) in enumerate(_QUESTIONS[:market_limit])
        }

    def fetch_markets(self) -> list[MarketSnapshot]:
        return [st.step() for st in self.states.values()]

    def fetch_trades(self, market_id: str, since_ms: int) -> list[TradeEvent]:
        st = self.states.get(market_id)
        if not st:
            return []
        trades, st._pending_trades = st._pending_trades, []
        return [t for t in trades if t.ts > since_ms]
