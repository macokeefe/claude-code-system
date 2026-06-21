"""Calibration grading — the gate the analyst must pass before it trades.

An estimator that says "70%" is only useful if events it rates 70% actually
happen ~70% of the time. This module measures that against resolved outcomes:

  * Brier score  — mean squared error of the probabilities (lower = better;
                   0.25 = always guessing 50%, 0 = perfect).
  * reliability  — predicted vs observed frequency, bucketed (the calibration
                   curve; a perfectly calibrated model sits on the diagonal).
  * ECE          — expected calibration error (avg gap between the two).

The decisive comparison is **vs the market itself**: the market price is also
a probability. The analyst only has edge if its Brier beats the market's on
the same questions. Beating a base-rate baseline is necessary but not enough.
Pure functions, no I/O — graded offline against fixtures.
"""

from __future__ import annotations


def brier(items: list) -> float:
    """Mean squared error of `prob` vs `outcome` (0/1). Lower is better."""
    n = len(items)
    if not n:
        return 0.0
    return sum((it["prob"] - it["outcome"]) ** 2 for it in items) / n


def base_rate(items: list) -> float:
    n = len(items)
    return (sum(it["outcome"] for it in items) / n) if n else 0.0


def reliability(items: list, nbins: int = 10) -> list:
    """Bucket by predicted probability; report predicted vs observed per bucket."""
    buckets = [[] for _ in range(nbins)]
    for it in items:
        b = min(nbins - 1, int(it["prob"] * nbins))
        buckets[b].append(it)
    out = []
    for i, rows in enumerate(buckets):
        if not rows:
            continue
        out.append({
            "band": f"{i/nbins*100:.0f}-{(i+1)/nbins*100:.0f}%",
            "n": len(rows),
            "predicted": sum(r["prob"] for r in rows) / len(rows),
            "observed": sum(r["outcome"] for r in rows) / len(rows),
        })
    return out


def ece(items: list, nbins: int = 10) -> float:
    """Expected calibration error: sample-weighted |predicted - observed|."""
    n = len(items)
    if not n:
        return 0.0
    return sum(b["n"] / n * abs(b["predicted"] - b["observed"])
               for b in reliability(items, nbins))


def summarize(items: list, nbins: int = 10) -> dict:
    """Full calibration report. `items` = [{prob, outcome, market?}].
    If `market` (the market's own implied prob) is present, compares the
    estimator's Brier to the market's — the real edge test."""
    n = len(items)
    rep = {
        "n": n,
        "base_rate": base_rate(items),
        "mean_pred": (sum(it["prob"] for it in items) / n) if n else 0.0,
        "brier": brier(items),
        "ece": ece(items, nbins),
        "reliability": reliability(items, nbins),
    }
    # baseline: always predict the base rate — model must beat this to add value
    br = rep["base_rate"]
    rep["brier_baseline"] = (sum((br - it["outcome"]) ** 2 for it in items) / n) if n else 0.0
    rep["skill_vs_baseline"] = rep["brier_baseline"] - rep["brier"]  # >0 = better

    # the decisive test: does the estimator beat the MARKET's own probability?
    mkt = [it for it in items if it.get("market") is not None]
    if mkt:
        rep["brier_market"] = sum((it["market"] - it["outcome"]) ** 2 for it in mkt) / len(mkt)
        rep["brier_model_on_mkt"] = sum((it["prob"] - it["outcome"]) ** 2 for it in mkt) / len(mkt)
        rep["edge_vs_market"] = rep["brier_market"] - rep["brier_model_on_mkt"]  # >0 = edge
        rep["compared"] = len(mkt)
    return rep
