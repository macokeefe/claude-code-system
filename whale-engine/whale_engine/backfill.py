"""Historical backfill — seed the DB with recent market history at startup.

Without this, the engine starts blind and the detectors must spend time
learning each market's "normal" before they can flag a whale. Backfill
pulls recent candlestick history (price / volume / open-interest buckets)
for each tracked market so the baselines exist immediately.

Candlesticks report *per-period* volume; the detectors expect *cumulative*
volume (they diff consecutive snapshots). So we reconstruct a cumulative
series that ENDS at the market's current lifetime volume — that way the
handoff to live polling is seamless (no phantom volume spike on the first
live cycle).
"""

from __future__ import annotations

import logging
import time

from .models import MarketSnapshot

log = logging.getLogger("whale_engine.backfill")


def backfill(source, store, hours: int, interval: int = 60) -> int:
    """Insert `hours` of historical snapshots for the source's liquid markets.
    Returns the number of snapshots inserted. No-op for sources without
    candlestick support (e.g. the synthetic simulator)."""
    if not hasattr(source, "fetch_candlesticks"):
        log.info("backfill skipped: source %r has no history support", source.name)
        return 0

    markets = source.fetch_markets()
    end_ts = int(time.time())
    start_ts = end_ts - hours * 3600
    inserted = 0

    for snap in markets:
        series = source.series_of(snap.market_id)
        try:
            points = source.fetch_candlesticks(snap.market_id, series,
                                                start_ts, end_ts, interval)
        except Exception as exc:  # one bad market shouldn't abort the backfill
            log.warning("backfill failed for %s: %s", snap.market_id, exc)
            continue
        if not points:
            continue

        # Reconstruct cumulative volume so the series ends at today's lifetime
        # total (snap.volume), keeping per-period deltas intact.
        total_recent = sum(p["vol"] for p in points)
        cum = max(snap.volume - total_recent, 0)
        for p in points:
            cum += p["vol"]
            store.insert_snapshot(MarketSnapshot(
                platform=snap.platform,
                market_id=snap.market_id,
                question=snap.question,
                status=snap.status,
                ts=p["ts"],
                yes_price=p["price"],
                volume=int(cum),
                open_interest=p["oi"],
                liquidity=snap.liquidity,
            ))
            inserted += 1

    log.info("backfill: inserted %d historical snapshots across %d markets "
             "(%dh @ %dm buckets)", inserted, len(markets), hours, interval)
    return inserted
