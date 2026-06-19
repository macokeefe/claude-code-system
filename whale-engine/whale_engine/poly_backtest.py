"""Per-wallet edge grader for Polymarket — the verification layer, attributed.

The Kalshi backtest could only grade anonymous flow, so skill washed out
into noise. Here we grade a *named* wallet: pull its full history, resolve
every market it touched, and ask the only question that matters — when this
wallet bought an outcome, how often did that outcome win, and would copying
its entries have made money?

EDGE = win% - avg price paid. Positive, persistent edge across many distinct
markets = a wallet worth following. Polymarket charges ~no trading fee, so
P&L here is gross of the tiny gas/relayer costs (noted, not modeled).
"""

from __future__ import annotations

import logging
from collections import defaultdict

log = logging.getLogger("whale_engine.poly_backtest")


def grade_wallet(pm, wallet: str, name: str = "", max_trades: int = 2000,
                 min_dollars: float = 100.0) -> dict:
    """Grade one wallet's BUY entries against resolved-market outcomes."""
    trades = pm.wallet_trades(wallet, max_trades=max_trades)
    cids = [t.condition_id for t in trades]
    resolved = pm.resolve_markets(cids)

    graded = []
    for t in trades:
        if t.side != "BUY" or t.outcome_index < 0:
            continue
        m = resolved.get(t.condition_id)
        if not m or m["winning_index"] is None:
            continue  # market not resolved yet — can't grade
        cost = t.size * t.price
        if cost < min_dollars:
            continue
        won = (t.outcome_index == m["winning_index"])
        pnl = (t.size if won else 0.0) - cost
        graded.append({"market": t.condition_id, "title": t.title or m["question"],
                       "cost": cost, "pnl": pnl, "won": won, "paid": t.price})

    rep = _agg(graded)
    rep.update({
        "wallet": wallet,
        "name": name or wallet[:10],
        "total_trades": len(trades),
        "resolved_markets": sum(1 for v in resolved.values()
                                if v["winning_index"] is not None),
        "distinct_markets_graded": len({g["market"] for g in graded}),
        "by_price_band": _bands(graded),
    })
    return rep


def grade_top(pm, top: int = 10, window: str = "all", max_trades: int = 2000,
              min_dollars: float = 100.0) -> dict:
    """Grade the top-N leaderboard wallets and rank them by measured edge."""
    traders = pm.leaderboard(window=window, limit=top)
    log.info("poly: grading %d leaderboard wallets", len(traders))
    wallets = []
    for i, tr in enumerate(traders, 1):
        log.info("poly: [%d/%d] %s (lifetime $%.0f)", i, len(traders), tr.name, tr.pnl)
        try:
            rep = grade_wallet(pm, tr.wallet, tr.name, max_trades, min_dollars)
        except Exception:
            log.debug("grading failed for %s", tr.wallet, exc_info=True)
            continue
        rep["lifetime_pnl"] = tr.pnl
        wallets.append(rep)
    wallets.sort(key=lambda r: r["edge"], reverse=True)
    return {"window": window, "min_dollars": min_dollars, "wallets": wallets}


def _agg(rows: list) -> dict:
    n = len(rows)
    cost = sum(r["cost"] for r in rows)
    pnl = sum(r["pnl"] for r in rows)
    wins = sum(1 for r in rows if r["won"])
    avg_price = (sum(r["paid"] for r in rows) / n) if n else 0.0
    return {
        "graded_trades": n,
        "win_rate": (wins / n) if n else 0.0,
        "staked": cost,
        "pnl": pnl,
        "roi": (pnl / cost) if cost else 0.0,
        "avg_price_paid": avg_price,
        "edge": ((wins / n) if n else 0.0) - avg_price,
    }


def _bands(rows: list) -> dict:
    bands = {"0-30c": [], "30-50c": [], "50-70c": [], "70-90c": [], "90c+": []}
    for r in rows:
        p = r["paid"]
        key = ("0-30c" if p < .30 else "30-50c" if p < .50 else
               "50-70c" if p < .70 else "70-90c" if p < .90 else "90c+")
        bands[key].append(r)
    return {b: _agg(rs) for b, rs in bands.items() if rs}
