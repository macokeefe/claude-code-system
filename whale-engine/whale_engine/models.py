"""Normalized event schema shared across all platform adapters.

Kalshi and Polymarket expose different raw shapes; every adapter maps
into these dataclasses so the detectors and storage never care which
venue the data came from.
"""

from __future__ import annotations

import time
from dataclasses import dataclass


def now_ms() -> int:
    """Current epoch time in milliseconds."""
    return int(time.time() * 1000)


@dataclass
class MarketSnapshot:
    """A point-in-time view of a single market."""

    platform: str          # "kalshi" | "polymarket" | "synthetic"
    market_id: str         # ticker / condition id
    question: str          # human-readable market question
    status: str            # "open" | "closed" | "settled" | ...
    ts: int                # epoch ms
    yes_price: float       # implied probability of YES, 0.0..1.0
    volume: int            # cumulative contracts traded (lifetime)
    open_interest: int     # contracts currently held open
    liquidity: float = 0.0 # notional resting liquidity, if the venue reports it


@dataclass
class TradeEvent:
    """A single executed trade."""

    platform: str
    market_id: str
    ts: int                # epoch ms
    price: float           # implied probability, 0.0..1.0
    count: int             # number of contracts in the fill
    taker_side: str = ""   # "yes" | "no" | ""
    trade_id: str = ""     # venue trade id, used for de-duplication


@dataclass
class Signal:
    """A detected whale / unusual-activity event."""

    platform: str
    market_id: str
    ts: int
    type: str              # size_spike | volume_surge | oi_jump | sharp_move
    severity: float        # how extreme (x-multiple or z-score, detector-defined)
    reason: str            # human-readable explanation
    price: float = 0.0     # implied prob at time of signal
    question: str = ""
