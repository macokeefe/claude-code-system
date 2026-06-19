"""Whale backtest — the first real edge measurement.

Pulls resolved (settled) Kalshi markets, where we know who actually won,
then grades every large trade against that outcome: did the side the whale
bought win, and would copying them have made money after fees?

This is the verification layer from SPEC.md applied to history — the step
that turns the tool from a watcher into something that learns what works.
Honest by construction: P&L is after an approximate Kalshi fee, and every
trade is graded against ground truth (the market's `result`).
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict

from .adapters.kalshi import _iso_to_ms

log = logging.getLogger("whale_engine.backtest")


def _fee(contracts: float, price: float) -> float:
    """Approximate Kalshi trading fee: ~0.07 * C * P * (1-P), in dollars."""
    return 0.07 * contracts * price * (1.0 - price)


def _category(ticker: str) -> str:
    return ticker.split("-", 1)[0] if ticker else "?"


def run(source, days: int = 3, min_dollars: float = 500.0,
        max_markets: int = 150) -> dict:
    """Grade whale trades on markets resolved within the last `days`.
    Returns a report dict. Kalshi-only (needs settled markets + trade history)."""
    if not hasattr(source, "settled_real_tickers"):
        return {"error": "backtest needs the Kalshi source"}

    cutoff = int(time.time() * 1000) - days * 86_400_000
    tickers = source.settled_real_tickers()
    log.info("backtest: %d candidate resolved tickers", len(tickers))
    raw = source.fetch_markets_raw(tickers)

    markets = []
    for m in raw:
        if m.get("result") not in ("yes", "no"):
            continue  # void / undetermined — no ground truth
        settled = _iso_to_ms(m.get("settlement_ts") or m.get("close_time") or "")
        if settled and settled < cutoff:
            continue
        markets.append(m)
    markets = markets[:max_markets]
    log.info("backtest: grading %d resolved markets from the last %dd", len(markets), days)

    graded = []
    for i, m in enumerate(markets, 1):
        ticker, result = m["ticker"], m["result"]
        try:
            trades = source.fetch_all_trades(ticker)
        except Exception:
            log.debug("trade fetch failed for %s", ticker, exc_info=True)
            continue
        for t in trades:
            if t.count <= 0 or t.taker_side not in ("yes", "no"):
                continue
            # money the taker staked, and what they paid per contract
            paid = t.price if t.taker_side == "yes" else (1.0 - t.price)
            cost = t.count * paid
            if cost < min_dollars:
                continue  # not a whale
            won = t.taker_side == result
            payout = t.count if won else 0.0
            pnl = payout - cost - _fee(t.count, paid)
            graded.append({"category": _category(ticker), "cost": cost,
                           "pnl": pnl, "won": won, "paid": paid})
        if i % 25 == 0:
            log.info("backtest: %d/%d markets, %d whale trades so far",
                     i, len(markets), len(graded))

    return _summarize(graded, markets, days, min_dollars)


def _agg(rows: list) -> dict:
    n = len(rows)
    cost = sum(r["cost"] for r in rows)
    pnl = sum(r["pnl"] for r in rows)
    wins = sum(1 for r in rows if r["won"])
    return {
        "trades": n,
        "win_rate": (wins / n) if n else 0.0,
        "staked": cost,
        "pnl": pnl,
        "roi": (pnl / cost) if cost else 0.0,
        "avg_price_paid": (sum(r["paid"] for r in rows) / n) if n else 0.0,
    }


def _summarize(graded, markets, days, min_dollars) -> dict:
    by_cat = defaultdict(list)
    for r in graded:
        by_cat[r["category"]].append(r)
    cats = {c: _agg(rows) for c, rows in by_cat.items()}
    # rank categories by absolute staked $ (most-traded first)
    cats = dict(sorted(cats.items(), key=lambda kv: kv[1]["staked"], reverse=True))
    return {
        "days": days,
        "min_dollars": min_dollars,
        "markets": len(markets),
        "overall": _agg(graded),
        "by_category": cats,
    }
