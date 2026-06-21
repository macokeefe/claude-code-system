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


def _events(series: list, jump: float, back: int, fwd: int,
            lag: int = 1) -> list[dict]:
    """Sharp moves and their forward continuation on one series.

    `lag` is the realistic entry delay: the spike is only known once bar i
    closes, so we enter at bar i+lag (not at the untradeable spike price).
    lag=0 measures the illusion; lag>=1 measures what's actually capturable.
    """
    out, n = [], len(series)
    for i in range(back, n - fwd - lag):
        p0, entry, exit_ = series[i - back][1], series[i + lag][1], series[i + lag + fwd][1]
        move = series[i][1] - p0
        if abs(move) < jump:
            continue
        d = 1.0 if move > 0 else -1.0
        out.append({
            "mag": abs(move),
            "cont": (exit_ - entry) * d,   # forward return in the move's direction
            "entry": entry,
        })
    return out


def run(series_set: list[dict], jump: float = 0.05, back: int = 1,
        fwd: int = 1, cost: float = 0.01, lag: int = 1) -> dict:
    """Aggregate continuation across every series. `cost` is the assumed
    round-trip friction (spread+fees); `lag` is the entry delay in bars
    (>=1 = realistic; the edge must survive not entering at the spike price)."""
    rows = []
    for item in series_set:
        rows.extend(_events(item["series"], jump, back, fwd, lag))

    rep = _agg(rows, cost)
    rep["jump"] = jump
    rep["fwd_bars"] = fwd
    rep["lag"] = lag
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


# --- repricing-speed profiler ---------------------------------------------
# After a sharp move is DETECTED (entry at +lag), how much more does price
# travel over the next h bars? A curve that keeps rising = slow repricing =
# a tradeable window. A flat/zero curve = the move was already over = no edge.

_CATS = [
    ("sports", ("win on", " vs ", " beat ", "match", "to win the", "advance to")),
    ("crypto", ("bitcoin", "btc", "ethereum", " eth ", "solana", "crypto",
                "$100k", "$150k", "all time high")),
    ("econ", ("fed ", "rate cut", "rate hike", "interest rate", "inflation",
              "cpi", "gdp", "recession", "jobs report", "bps")),
    ("geopolitics", ("iran", "israel", "russia", "ukraine", "gaza", "china",
                     "taiwan", "nato", "sanction", "strike", "ceasefire",
                     "regime", "nuclear", "missile", "hamas", "hezbollah",
                     "syria", "venezuela", "airspace", "hormuz")),
    ("politics", ("election", "president", "senate", "governor", "primary",
                  "nominee", "impeach", "parliament", "prime minister",
                  "out as", "out by", "out before", "resign")),
]


def category(question: str) -> str:
    q = question.lower()
    for name, keys in _CATS:
        if any(k in q for k in keys):
            return name
    return "other"


def profile(series_set: list[dict], jump: float = 0.05, lag: int = 1,
            back: int = 1, horizons=(1, 2, 3, 5, 10)) -> dict:
    """Per-category repricing curve: mean continuation at each forward horizon,
    measured from a realistic entry (+lag). Reveals where the window lives."""
    horizons = tuple(horizons)
    maxh = max(horizons)
    buckets: dict[str, dict] = {}
    for item in series_set:
        cat = item.get("category") or category(item.get("question", ""))
        s = item["series"]
        n = len(s)
        b = buckets.setdefault(cat, {"events": 0, **{h: [] for h in horizons}})
        for i in range(back, n - lag - maxh):
            move = s[i][1] - s[i - back][1]
            if abs(move) < jump:
                continue
            d = 1.0 if move > 0 else -1.0
            entry = s[i + lag][1]
            b["events"] += 1
            for h in horizons:
                b[h].append((s[i + lag + h][1] - entry) * d)
    out = {}
    for cat, b in buckets.items():
        out[cat] = {
            "events": b["events"],
            "curve": {h: (sum(b[h]) / len(b[h]) if b[h] else 0.0)
                      for h in horizons},
        }
    return {"horizons": horizons, "by_category": out}
