"""Configuration & detector thresholds.

All tunable knobs live here so calibration is one file. Thresholds are
applied *per market* relative to that market's own recent history, so a
"whale" in a thin sports market is judged differently from one in a deep
election market (see SPEC.md §2).
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, fields


def _known(cls, data: dict) -> dict:
    """Keep only keys that are real fields of the dataclass `cls`."""
    valid = {f.name for f in fields(cls)}
    return {k: v for k, v in data.items() if k in valid}


@dataclass
class Thresholds:
    # A move must clear ALL of these to count as a "whale", so signals scale
    # with each market's size instead of a flat number:
    min_contracts: int = 500          # at least this many contracts moved, AND
    min_notional: float = 250.0       # at least ~$this in cost basis (contracts x price), AND
    oi_fraction: float = 0.02         # at least this fraction of the market's open interest

    # multiples vs the market's own recent baseline (informational severity;
    # baseline is floored by min_contracts so we never divide by ~0)
    size_spike_mult: float = 4.0      # single trade > mult x median trade size

    # --- sharp move: fast repricing (size-independent, but gated to liquid mkts) ---
    sharp_move_delta: float = 0.07    # implied-prob move >= this (0.07 = 7 points)
    sharp_move_window_min: int = 30   # ...within this many minutes
    sharp_move_min_oi: int = 1000     # ...and only in markets with at least this OI

    # --- shared ---
    baseline_window: int = 50         # how many recent points define "normal"
    min_history: int = 3              # need at least this much history before judging
    cooldown_min: int = 30            # don't re-fire the same (market, type) within this


@dataclass
class Config:
    db_path: str = "whales.db"
    source: str = "synthetic"         # "kalshi" | "synthetic"
    poll_interval_sec: int = 30
    market_limit: int = 60            # how many (most-liquid) markets to keep
    scan_pages: int = 20              # max event pages (x200) to scan during discovery
    active_only: bool = True          # drop dead markets (0 volume AND 0 open interest)
    discovery_every: int = 40         # re-run the full liquid-market discovery every N cycles
    max_close_days: int = 0           # if >0, only watch markets closing within this many days
    kalshi_base_url: str = "https://api.elections.kalshi.com/trade-api/v2"
    thresholds: Thresholds = None     # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.thresholds is None:
            self.thresholds = Thresholds()
        elif isinstance(self.thresholds, dict):
            self.thresholds = Thresholds(**_known(Thresholds, self.thresholds))

    @classmethod
    def load(cls, path: str | None) -> "Config":
        """Load config from JSON, ignoring unknown/stale keys so an older
        config file can never crash a newer build."""
        if not path:
            return cls()
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except FileNotFoundError:
            return cls()
        return cls(**_known(cls, data))

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2)
