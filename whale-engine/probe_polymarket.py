#!/usr/bin/env python3
"""Polymarket data-shape probe — stdlib only, zero integration.

The whole point of Polymarket (vs Kalshi) is that trades are *attributed*:
every wallet is a stable, public identity with a full, gradeable history.
This script proves that out before we build anything around it. It:

  1. pulls the public profit leaderboard (top wallets by realized P&L),
  2. takes the #1 wallet and pulls its full trade history, current
     positions, and total portfolio value,

and prints the field shapes + a few sample rows so we can see exactly what
we'd be modeling. Nothing is stored; nothing is traded. Just look.

Run:  python3 probe_polymarket.py
      python3 probe_polymarket.py --wallet 0xabc...   # probe a specific wallet
      python3 probe_polymarket.py --limit 25
"""

from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.parse
import urllib.request

DATA_API = "https://data-api.polymarket.com"
# the leaderboard moved hosts over time; try the known surfaces in order
LEADERBOARD_CANDIDATES = [
    (DATA_API + "/leaderboard", {"window": "all", "type": "pnl"}),
    ("https://lb-api.polymarket.com/profit", {"window": "all"}),
    ("https://lb-api.polymarket.com/leaderboard", {"window": "all", "type": "pnl"}),
]

UA = "whale-engine-probe/0.1 (+https://github.com/macokeefe/claude-code-system)"


def _get(url: str, params: dict | None = None):
    """GET JSON. Returns parsed body or raises with a readable message."""
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                               "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def _rows(payload):
    """Normalize a response into a list of dict rows (APIs differ)."""
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("data", "results", "leaderboard", "traders", "rows"):
            if isinstance(payload.get(key), list):
                return payload[key]
        return [payload]
    return []


def _shape(rows: list, label: str, sample: int = 3) -> None:
    """Print the field shape and a few sample rows of a result set."""
    print(f"\n=== {label} — {len(rows)} rows ===")
    if not rows:
        print("  (empty)")
        return
    keys = rows[0].keys() if isinstance(rows[0], dict) else []
    print("  fields:", ", ".join(keys) if keys else "(non-dict rows)")
    for r in rows[:sample]:
        print("  ", json.dumps(r, default=str)[:300])


def fetch_leaderboard(limit: int):
    for url, params in LEADERBOARD_CANDIDATES:
        try:
            rows = _rows(_get(url, {**params, "limit": limit}))
            if rows:
                print(f"[leaderboard] using {url}")
                return rows
        except Exception as e:  # try the next candidate host
            print(f"[leaderboard] {url} -> {e}")
    return []


def _wallet_of(row: dict) -> str | None:
    for k in ("proxyWallet", "wallet", "user", "address", "proxy_wallet"):
        if row.get(k):
            return row[k]
    return None


def probe_wallet(wallet: str) -> None:
    print(f"\n########## WALLET {wallet} ##########")
    try:
        val = _get(DATA_API + "/value", {"user": wallet})
        print("portfolio value:", json.dumps(val, default=str)[:200])
    except Exception as e:
        print("value ->", e)

    try:
        positions = _rows(_get(DATA_API + "/positions",
                               {"user": wallet, "limit": 100}))
        _shape(positions, "POSITIONS (current open bets)")
    except Exception as e:
        print("positions ->", e)

    try:
        trades = _rows(_get(DATA_API + "/trades",
                            {"user": wallet, "limit": 500}))
        _shape(trades, "TRADES (full history, newest first)")
        print(f"\n  -> pulled {len(trades)} trades for this one wallet "
              f"(paginate with offset for the rest)")
    except Exception as e:
        print("trades ->", e)


def probe_gamma(condition_id: str | None) -> None:
    """Find out how to resolve a market's outcome via the Gamma API.
    The per-wallet grader needs this: given a conditionId, which query param
    returns THAT market with its winning outcome? Tries several spellings."""
    GAMMA = "https://gamma-api.polymarket.com/markets"

    if not condition_id:  # grab a real one from the #1 wallet's latest trade
        lb = fetch_leaderboard(1)
        w = _wallet_of(lb[0]) if lb else None
        if w:
            trades = _rows(_get(DATA_API + "/trades", {"user": w, "limit": 1}))
            if trades:
                condition_id = trades[0].get("conditionId")
    if not condition_id:
        print("no conditionId to test (pass --gamma 0x...)")
        return

    print(f"\n########## GAMMA RESOLUTION for {condition_id} ##########")
    # try the candidate filter params; the right one returns exactly this market
    for param in ("condition_ids", "condition_id", "conditionIds", "conditionId"):
        try:
            rows = _rows(_get(GAMMA, {param: condition_id, "limit": 5}))
        except Exception as e:
            print(f"  {param:<14} -> {e}")
            continue
        match = [m for m in rows if m.get("conditionId") == condition_id]
        tag = "MATCH" if match else f"{len(rows)} rows, none match (param ignored?)"
        print(f"  {param:<14} -> {tag}")
        if match:
            m = match[0]
            keep = {k: m.get(k) for k in
                    ("conditionId", "question", "closed", "active",
                     "outcomes", "outcomePrices", "umaResolutionStatus")}
            print("   ", json.dumps(keep, default=str)[:500])
            return
    print("  none of the tried params returned this market — see field dump:")
    try:
        rows = _rows(_get(GAMMA, {"limit": 1}))
        if rows:
            print("   sample market fields:", ", ".join(rows[0].keys()))
    except Exception as e:
        print("   ", e)


def main() -> None:
    ap = argparse.ArgumentParser(description="Polymarket data-shape probe")
    ap.add_argument("--limit", type=int, default=10,
                    help="leaderboard rows to pull")
    ap.add_argument("--wallet", help="probe this wallet instead of the #1")
    ap.add_argument("--gamma", nargs="?", const="", default=None,
                    help="test Gamma market resolution (optionally pass a conditionId)")
    args = ap.parse_args()

    if args.gamma is not None:
        probe_gamma(args.gamma or None)
        return

    if args.wallet:
        probe_wallet(args.wallet)
        return

    lb = fetch_leaderboard(args.limit)
    _shape(lb, "PROFIT LEADERBOARD", sample=min(args.limit, 10))
    if not lb:
        print("\nCould not reach the leaderboard from here (the offices/CI IP "
              "may be geo-blocked). Run it from your own machine, or pass "
              "--wallet 0x... to probe a known wallet directly.")
        return

    top = _wallet_of(lb[0])
    if top:
        probe_wallet(top)
    else:
        print("\n(couldn't find a wallet field on the top row; see fields above)")


if __name__ == "__main__":
    main()
