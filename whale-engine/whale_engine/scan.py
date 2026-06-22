"""News-driven trade scan — the always-on ingestion the thesis calls for.

Pulls the under-covered geopolitical event markets, asks the analyst (with web
search) which of them a recent article has mispriced, and writes the survivors
to the recommendations table with the article cited as evidence. Shared by the
CLI (`news`) and the dashboard's Scan button (POST /api/scan).
"""

from __future__ import annotations

import logging

from . import analyst
from .adapters.polymarket import PolymarketSource
from .models import MarketSnapshot, now_ms
from .storage import Storage

log = logging.getLogger("whale_engine.scan")

GEO = ("ceasefire", "strike", "invade", "missile", "nuclear", "hostage",
       "airspace", "withdraw troops", "peace deal", "attack", "captured",
       "occupy", "annex", "recognize", "sanction", "war ", "regime",
       "iran", "israel", "ukraine", "russia", "gaza", "hezbollah", "hamas")
DATE = (" by ", " before ", "in 2026", "by 2027", "by december", "by january",
        "by june", "by july", "by march", "by april", "by may", "by august",
        "by september", "by october", "by november", "by february")


def candidate_markets(limit: int = 25) -> list:
    """The under-covered geopolitical 'will-X-happen-by-date' markets to watch."""
    pm = PolymarketSource()
    mk = pm.open_markets(max_markets=4000)
    geo = [m for m in mk
           if any(k in m["question"].lower() for k in GEO)
           and any(d in m["question"].lower() for d in DATE)]
    geo.sort(key=lambda m: m["liquidity"], reverse=True)
    return geo[:limit]


def find_trades(db_path: str, limit: int = 25, min_edge: float = 0.12) -> dict:
    """Scan markets for news catalysts; write the mispricings as recommendations.
    Returns {found, considered}."""
    markets = candidate_markets(limit)
    if not markets:
        return {"found": 0, "considered": 0}
    results = analyst.news_recommendations(markets)

    store = Storage(db_path)
    found = 0
    try:
        existing = store.open_recommendation_keys()
        for r in results:
            i = r["i"]
            if not (0 <= i < len(markets)):
                continue
            m = markets[i]
            mkt, p = m["yes"], r["p"]
            div = p - mkt
            if abs(div) < min_edge:
                continue
            side = "yes" if div > 0 else "no"
            entry = mkt if side == "yes" else 1.0 - mkt          # side price now
            target = p if side == "yes" else 1.0 - p             # side fair value
            if not (0.0 < entry < 1.0) or target <= entry:
                continue
            if (m["condition_id"], side) in existing:
                continue
            store.insert_snapshot(MarketSnapshot(
                "polymarket", m["condition_id"], m["question"], "open",
                now_ms(), mkt, 0, 0, 0.0))
            reason = (f"📰 {r['headline']} — {r['why']} "
                      f"(source: {r['source']}). Market {round(entry*100)}¢ vs "
                      f"news-grounded {round(target*100)}¢.")
            store.add_recommendation(m["condition_id"], m["question"], side,
                                     entry, target, abs(div), target, reason)
            existing.add((m["condition_id"], side))
            found += 1
    finally:
        store.close()
    return {"found": found, "considered": len(markets)}
