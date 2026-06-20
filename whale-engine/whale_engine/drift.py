"""Post-move drift backtest — does the tape under-react?

The trading thesis: when real information hits, slow/retail markets don't
reprice instantly — the price drifts toward the new level over the next
hour. If that's true, a sharp move predicts *continued* movement the same
direction, and you can ride it. If sharp moves instead snap back (over-
reaction) or wander (efficient), there's nothing to surf.

This measures it directly on the historical tape, no news feed required:
find every sharp move over `back` bars, then measure the next `fwd` bars'
return in the move's direction (positive = continuation = tradeable drift).
Ground truth is the price series itself; nothing here predicts the world.

Fixtures: `save`/`load` let us capture real series once and then iterate
the analysis fully offline (no live API).
"""

from __future__ import annotations

import json
import logging
import os
from collections import defaultdict

log = logging.getLogger("whale_engine.drift")


def save(path: str, series_set: list[dict]) -> None:
    """Persist captured price series: [{question, token, series:[[t,p],...]}]."""
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(series_set, fh)


def load(path: str) -> list[dict]:
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    for item in data:  # tuples survive JSON as lists; normalize
        item["series"] = [(int(t), float(p)) for t, p in item["series"]]
    return data


def _events(series: list, jump: float, back: int, fwd: int) -> list[dict]:
    """Sharp moves and their forward continuation on one series."""
    out, n = [], len(series)
    for i in range(back, n - fwd):
        p0, p1, p2 = series[i - back][1], series[i][1], series[i + fwd][1]
        move = p1 - p0
        if abs(move) < jump:
            continue
        d = 1.0 if move > 0 else -1.0
        out.append({
            "mag": abs(move),
            "cont": (p2 - p1) * d,   # forward return in the move's direction
            "entry": p1,
        })
    return out


def run(series_set: list[dict], jump: float = 0.05, back: int = 1,
        fwd: int = 1, cost: float = 0.01) -> dict:
    """Aggregate continuation across every series. `cost` is the assumed
    round-trip friction (spread+fees) subtracted from the edge."""
    rows = []
    for item in series_set:
        rows.extend(_events(item["series"], jump, back, fwd))

    rep = _agg(rows, cost)
    rep["jump"] = jump
    rep["fwd_bars"] = fwd
    rep["cost"] = cost
    rep["series"] = len(series_set)
    # by move-size band — small moves may drift differently than big ones
    bands = {"5-10c": [], "10-20c": [], "20c+": []}
    for r in rows:
        key = "5-10c" if r["mag"] < .10 else "10-20c" if r["mag"] < .20 else "20c+"
        if key in bands:
            bands[key].append(r)
    rep["by_band"] = {b: _agg(rs, cost) for b, rs in bands.items() if rs}
    return rep


def _agg(rows: list, cost: float) -> dict:
    n = len(rows)
    if not n:
        return {"events": 0, "mean_cont": 0.0, "net": 0.0, "hit_rate": 0.0}
    mean = sum(r["cont"] for r in rows) / n
    hit = sum(1 for r in rows if r["cont"] > 0) / n
    return {
        "events": n,
        "mean_cont": mean,          # avg forward move in the trade's direction
        "net": mean - cost,         # after assumed round-trip friction
        "hit_rate": hit,            # fraction that continued at all
    }
