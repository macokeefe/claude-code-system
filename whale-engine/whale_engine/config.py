"""Configuration & detector thresholds.

All tunable knobs live here so calibration is one file. Thresholds are
applied *per market* relative to that market's own recent history, so a
"whale" in a thin sports market is judged differently from one in a deep
election market (see SPEC.md §2).
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass


@dataclass
class Thresholds:
    # --- size spike: one unusually large single trade ---
    size_spike_mult: float = 5.0      # trade count > mult x market's median trade size
    size_spike_min: int = 100         # ...and at least this many contracts

    # --- volume surge: a burst of activity in one poll interval ---
    volume_surge_mult: float = 4.0    # interval volume > mult x baseline interval volume
    volume_surge_min: int = 200       # ...and at least this many contracts

    # --- open-interest jump: new conviction money entering ---
    oi_jump_mult: float = 4.0         # |OI change| > mult x baseline OI change
    oi_jump_min: int = 200            # ...and at least this many contracts

    # --- sharp move: fast repricing ---
    sharp_move_delta: float = 0.10    # implied-prob move >= this (e.g. 0.10 = 10 points)
    sharp_move_window_min: int = 15   # ...within this many minutes

    # --- shared ---
    baseline_window: int = 50         # how many recent points define "normal"
    min_history: int = 5              # need at least this much history before judging
    cooldown_min: int = 20            # don't re-fire the same (market, type) within this


@dataclass
class Config:
    db_path: str = "whales.db"
    source: str = "synthetic"         # "kalshi" | "synthetic"
    poll_interval_sec: int = 30
    market_limit: int = 60            # how many (most-liquid) markets to keep
    scan_pages: int = 120             # max Kalshi pages (x1000) to scan during discovery
    active_only: bool = True          # drop dead markets (0 volume AND 0 open interest)
    discovery_every: int = 40         # re-run the full liquid-market discovery every N cycles
    kalshi_base_url: str = "https://api.elections.kalshi.com/trade-api/v2"
    thresholds: Thresholds = None     # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.thresholds is None:
            self.thresholds = Thresholds()
        elif isinstance(self.thresholds, dict):
            self.thresholds = Thresholds(**self.thresholds)

    @classmethod
    def load(cls, path: str | None) -> "Config":
        """Load config from JSON, falling back to defaults for missing keys."""
        if not path:
            return cls()
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except FileNotFoundError:
            return cls()
        return cls(**data)

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2)
