"""Command-line entry point.

  python -m whale_engine.cli run                 # synthetic demo, runs forever
  python -m whale_engine.cli run --once          # a single cycle
  python -m whale_engine.cli run --source kalshi # live Kalshi public data
  python -m whale_engine.cli run --cycles 20 --interval 2

  python -m whale_engine.cli serve               # web dashboard + background watcher
  python -m whale_engine.cli serve --port 8765 --source kalshi
"""

from __future__ import annotations

import argparse
import logging
import threading
import os
from datetime import datetime, timezone

from .adapters import make_source
from .config import Config
from .engine import Engine
from .models import Signal
from .storage import Storage
from . import web


def _load_dotenv(path: str = ".env") -> None:
    """Minimal .env loader (no dependency). Loads simple KEY=VALUE lines into
    the environment without overriding values already set. Use the
    KALSHI_PRIVATE_KEY_PATH approach for the key (single-line, parses cleanly)."""
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key, val = key.strip(), val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val


_ICON = {
    "size_spike": "🐋",
    "volume_surge": "📈",
    "oi_jump": "🧱",
    "sharp_move": "⚡",
}


def _print_signal(sig: Signal) -> None:
    ts = datetime.fromtimestamp(sig.ts / 1000, tz=timezone.utc).strftime("%H:%M:%S")
    icon = _ICON.get(sig.type, "•")
    print(f"{icon}  [{ts}] {sig.type:<12} {sig.market_id:<16} "
          f"p={sig.price*100:4.0f}%  sev={sig.severity:<5}  {sig.reason}")
    if sig.question:
        print(f"      ↳ {sig.question}")


def _build_config(args) -> Config:
    config = Config.load(args.config)
    if getattr(args, "source", None):
        config.source = args.source
    if getattr(args, "db", None):
        config.db_path = args.db
    if getattr(args, "interval", None) is not None:
        config.poll_interval_sec = args.interval
    if getattr(args, "closing_soon", None):
        config.max_close_days = args.closing_soon
    return config


def _cmd_run(args) -> int:
    config = _build_config(args)
    store = Storage(config.db_path)
    source = make_source(config.source, config)
    if getattr(args, "backfill", 0) > 0:
        from .backfill import backfill
        backfill(source, store, args.backfill)
    engine = Engine(config, source, store, sink=_print_signal)

    cycles = 1 if args.once else args.cycles
    print(f"Whale Engine — watching '{config.source}' "
          f"(db={config.db_path}, interval={config.poll_interval_sec}s). "
          f"Watch-only, no trading.\n")
    try:
        engine.run(max_cycles=cycles)
    except KeyboardInterrupt:
        print("\nstopped.")
    finally:
        store.close()
    return 0


def _cmd_serve(args) -> int:
    config = _build_config(args)
    print(f"Whale Engine — serving dashboard for '{config.source}'. "
          f"Watch-only, no trading.")
    if not args.no_watch:
        # Run the watcher in a daemon thread (its own Storage/connection) so the
        # dashboard updates live while the web server runs in the foreground.
        def _watch() -> None:
            store = Storage(config.db_path)
            source = make_source(config.source, config)
            if args.backfill > 0:
                from .backfill import backfill
                backfill(source, store, args.backfill)
            Engine(config, source, store, sink=lambda _s: None).run()
        threading.Thread(target=_watch, daemon=True, name="watcher").start()
        print(f"Background watcher started (source={config.source}, "
              f"interval={config.poll_interval_sec}s"
              f"{', backfilling ' + str(args.backfill) + 'h' if args.backfill else ''}).")
    web.serve(config.db_path, host=args.host, port=args.port,
              open_browser=not args.no_open)
    return 0


def _cmd_backfill(args) -> int:
    """Seed the DB with recent history, then exit (diagnostics/one-off)."""
    from .backfill import backfill
    config = _build_config(args)
    store = Storage(config.db_path)
    source = make_source(config.source, config)
    print(f"Backfilling {args.hours}h of history for '{config.source}' "
          f"into {config.db_path}…")
    n = backfill(source, store, args.hours)
    print(f"done — inserted {n} historical snapshots.")
    store.close()
    return 0


def _cmd_backtest(args) -> int:
    """Grade whale trades on recently-resolved markets and print a scoreboard."""
    from . import backtest
    config = _build_config(args)
    config.source = "kalshi"
    src = make_source("kalshi", config)
    print(f"\nBacktesting whale trades on markets resolved in the last {args.days}d "
          f"(min ${args.min_dollars:,.0f} staked)…\n"
          f"This pulls trade history per market — give it a few minutes.\n")
    rep = backtest.run(src, days=args.days, min_dollars=args.min_dollars,
                       max_markets=args.max_markets, max_price=args.max_price,
                       max_per_event=args.max_per_event)
    if rep.get("error"):
        print("error:", rep["error"])
        return 1

    o = rep["overall"]
    print("=" * 64)
    print(f"RESOLVED MARKETS GRADED: {rep['markets']}   "
          f"(<{args.max_price*100:.0f}c; dropped {rep.get('excluded_multi', 0)} "
          f"multi-candidate legs)")
    print(f"WHALE TRADES (>= ${rep['min_dollars']:,.0f}): {o['trades']:,}")
    if not o["trades"]:
        print("\nNo whale trades found in scope. Try --days 14, a lower "
              "--min-dollars, or a higher --max-price.")
        return 0
    print(f"\nIf you had copied every whale trade:")
    print(f"  Win rate:        {o['win_rate']*100:5.1f}%")
    print(f"  Avg price paid:  {o['avg_price_paid']*100:5.1f}c  (= break-even win rate)")
    print(f"  EDGE:            {o['edge']*100:+5.1f} pts  <- won this much more often than priced")
    print(f"  Total staked:    ${o['staked']:,.0f}")
    print(f"  Net P&L (a/fees):${o['pnl']:,.0f}")
    print(f"  ROI:             {o['roi']*100:+.1f}%")

    print(f"\nConcentration: {o['trades']:,} trades across "
          f"{rep['distinct_markets_traded']} distinct markets; "
          f"top category = {rep['top_category_share']*100:.0f}% of trades.")
    if rep["top_category_share"] > 0.5:
        print("  WARNING: one event dominates the sample — treat the overall")
        print("  number as noise, not a conclusion. Look at the breakdowns below.")

    print(f"\nBy price band (where is the edge?):")
    print(f"  {'band':<10}{'trades':>7}{'win%':>6}{'edge':>7}{'ROI%':>7}")
    for band in ("0-30c", "30-50c", "50-70c", "70-90c", "90c+"):
        a = rep["by_price_band"].get(band)
        if a:
            print(f"  {band:<10}{a['trades']:>7}{a['win_rate']*100:>5.0f}%"
                  f"{a['edge']*100:>+6.0f}{a['roi']*100:>+6.0f}%")

    print(f"\nBy category (most-traded first):")
    print(f"  {'category':<24}{'trades':>7}{'win%':>6}{'price':>7}{'edge':>7}{'ROI%':>7}")
    for cat, a in list(rep["by_category"].items())[:15]:
        if a["trades"] >= 3:
            print(f"  {cat[:24]:<24}{a['trades']:>7}{a['win_rate']*100:>5.0f}%"
                  f"{a['avg_price_paid']*100:>6.0f}c{a['edge']*100:>+6.0f}{a['roi']*100:>+6.0f}%")
    print("=" * 64)
    print("EDGE is the real number: win% minus price paid. Near-zero edge = just")
    print("buying favorites. P&L is after an approximate fee & ignores slippage.")
    return 0


def _cmd_poly(args) -> int:
    """Grade Polymarket wallets by REAL edge (attributed, gradeable history).
    Either one --wallet, or the top-N leaderboard wallets."""
    from .adapters.polymarket import PolymarketSource
    from . import poly_backtest as pb

    pm = PolymarketSource()
    if getattr(args, "forward", 0):
        print(f"\nFORWARD TEST — qualify wallets on edge BEFORE {args.forward}d ago,\n"
              f"then grade what copying their LATER entries would return\n"
              f"(slippage {args.slippage*100:.0f}c, min ${args.min_dollars:,.0f}/trade, "
              f"top {args.top} wallets). This pulls a lot of history — be patient.\n")
        rep = pb.forward_test(pm, top=args.top, window=args.window,
                              cutoff_days=args.forward, min_dollars=args.min_dollars,
                              slippage=args.slippage, max_trades=args.max_trades)
        f = rep["followed"]
        print("=" * 78)
        print(f"{'WALLET':<16}{'pre-edge':>9}{'pre-n':>7}{'qual?':>6}"
              f"{'post-n':>7}{'post-edge':>10}{'post-ROI%':>10}")
        print("-" * 78)
        for w in rep["wallets"]:
            if w["pre"]["graded_trades"] == 0 and w["post"]["graded_trades"] == 0:
                continue
            print(f"{w['name'][:15]:<16}{w['pre']['edge']*100:>+8.0f}"
                  f"{w['pre']['graded_trades']:>7}{'yes' if w['qualified'] else 'no':>6}"
                  f"{w['post']['graded_trades']:>7}{w['post']['edge']*100:>+9.0f}"
                  f"{w['post']['roi']*100:>+9.0f}%")
        print("=" * 78)
        print(f"FOLLOWING THE {rep['qualified_wallets']} QUALIFIED WALLETS "
              f"(of {rep['candidate_wallets']}), copying every entry they made "
              f"in the last {args.forward}d:")
        if f["graded_trades"]:
            print(f"  Copied trades:   {f['graded_trades']:,}")
            print(f"  Win rate:        {f['win_rate']*100:5.1f}%")
            print(f"  Avg price paid:  {f['avg_price_paid']*100:5.1f}c  (incl. slippage)")
            print(f"  EDGE:            {f['edge']*100:+5.1f} pts")
            print(f"  Total staked:    ${f['staked']:,.0f}")
            print(f"  Net P&L:         ${f['pnl']:,.0f}")
            print(f"  ROI:             {f['roi']*100:+.1f}%")
            print("\nThis is the real number: out-of-sample, priced as a copier, losers")
            print("included. Positive here = a followable edge. ~0 or negative = the")
            print("track record was survivorship, and copying forward doesn't pay.")
        else:
            print("  No qualified wallets with gradeable forward trades. Try a longer")
            print("  --forward window, lower --min-dollars, or loosen --min-pre-trades.")
        return 0
    if args.wallet:
        print(f"\nGrading wallet {args.wallet} (min ${args.min_dollars:,.0f} "
              f"per trade, up to {args.max_trades} trades)…\n")
        rep = pb.grade_wallet(pm, args.wallet, max_trades=args.max_trades,
                              min_dollars=args.min_dollars)
        _print_wallet(rep, detailed=True)
        return 0

    print(f"\nGrading the top {args.top} Polymarket wallets by lifetime P&L "
          f"({args.window}); min ${args.min_dollars:,.0f}/trade.\n"
          f"This pulls each wallet's history + resolves their markets — "
          f"give it a few minutes.\n")
    rep = pb.grade_top(pm, top=args.top, window=args.window,
                       max_trades=args.max_trades, min_dollars=args.min_dollars)
    print("=" * 78)
    print(f"{'WALLET':<16}{'lifetime$':>12}{'graded':>7}{'win%':>6}"
          f"{'price':>7}{'EDGE':>7}{'ROI%':>8}")
    print("-" * 78)
    for w in rep["wallets"]:
        if w["graded_trades"] == 0:
            continue
        print(f"{w['name'][:15]:<16}{w['lifetime_pnl']:>12,.0f}"
              f"{w['graded_trades']:>7}{w['win_rate']*100:>5.0f}%"
              f"{w['avg_price_paid']*100:>6.0f}c{w['edge']*100:>+6.0f}{w['roi']*100:>+7.0f}%")
    print("=" * 78)
    print("EDGE = win% - avg price paid. Positive edge across many graded trades")
    print("= a wallet whose ENTRIES beat the market price. That's who to follow.")
    print("(Polymarket charges ~no trading fee; P&L is gross of tiny gas costs.)")
    return 0


def _print_wallet(w: dict, detailed: bool = False) -> None:
    print("=" * 64)
    print(f"WALLET: {w['name']}  ({w['wallet']})")
    print(f"  history pulled:   {w['total_trades']:,} trades "
          f"({w['resolved_markets']} resolved markets)")
    print(f"  graded entries:   {w['graded_trades']:,} BUYs across "
          f"{w['distinct_markets_graded']} distinct markets")
    if not w["graded_trades"]:
        print("\n  Nothing to grade (no resolved markets above the $ threshold).")
        print("  Try a lower --min-dollars or a higher --max-trades.")
        return
    print(f"\n  Win rate:        {w['win_rate']*100:5.1f}%")
    print(f"  Avg price paid:  {w['avg_price_paid']*100:5.1f}c  (= break-even)")
    print(f"  EDGE:            {w['edge']*100:+5.1f} pts")
    print(f"  Total staked:    ${w['staked']:,.0f}")
    print(f"  Net P&L:         ${w['pnl']:,.0f}")
    print(f"  ROI:             {w['roi']*100:+.1f}%")
    if detailed and w.get("by_price_band"):
        print(f"\n  By price band:")
        print(f"  {'band':<10}{'trades':>7}{'win%':>6}{'edge':>7}{'ROI%':>7}")
        for band in ("0-30c", "30-50c", "50-70c", "70-90c", "90c+"):
            a = w["by_price_band"].get(band)
            if a:
                print(f"  {band:<10}{a['graded_trades']:>7}{a['win_rate']*100:>5.0f}%"
                      f"{a['edge']*100:>+6.0f}{a['roi']*100:>+6.0f}%")
    print("=" * 64)


def _cmd_arb(args) -> int:
    """Scan open Polymarket markets for structural mispricings (time-ladders):
    earlier-deadline rungs priced above later ones — a locked gap, no view
    on the world required."""
    from .adapters.polymarket import PolymarketSource
    from . import mispricing

    pm = PolymarketSource()
    print(f"\nPulling open Polymarket markets (up to {args.max_markets})…")
    markets = pm.open_markets(max_markets=args.max_markets)
    print(f"got {len(markets)} priced open markets. Scanning time-ladders "
          f"(min gap {args.min_gap*100:.0f}c, min liquidity ${args.min_liquidity:,.0f})…\n")
    rep = mispricing.find_ladders(markets, min_gap=args.min_gap,
                                  min_liquidity=args.min_liquidity)
    vs = rep["violations"]
    print("=" * 78)
    print(f"scanned {rep['scanned']} markets · {rep.get('eligible', 0)} cumulative "
          f"'by-date' · {rep['ladder_groups']} time-ladders · {len(vs)} mispricings")
    print("=" * 78)
    if not vs:
        print("No ladder violations above thresholds. Try --min-gap 0.01 or a lower")
        print("--min-liquidity. Use --show-ladders to inspect how markets grouped.")
    for v in vs[:args.limit]:
        e, l = v["early"], v["late"]
        print(f"\n  LOCKED GAP {v['gap']*100:.1f}c   (min liquidity ${v['liquidity']:,.0f})")
        print(f"    {e['question']}")
        print(f"      deadline {e['end'][:10]}  YES {e['yes']*100:.0f}c   <- SELL (overpriced)")
        print(f"    {l['question']}")
        print(f"      deadline {l['end'][:10]}  YES {l['yes']*100:.0f}c   <- BUY  (underpriced)")
        print(f"    trade: buy YES@later {l['yes']*100:.0f}c + buy NO@earlier "
              f"{(1-e['yes'])*100:.0f}c  ->  lock ~{v['gap']*100:.1f}c, can't lose")

    if args.show_ladders:
        print("\n" + "-" * 78)
        print("LADDER GROUPS (for tuning the grouping heuristic):")
        for key, ms in rep["ladders"][:args.limit]:
            print(f"\n  [{key}]  ({len(ms)} rungs)")
            for m in ms:
                print(f"    {m['end'][:10]}  YES {m['yes']*100:4.0f}c  "
                      f"liq ${m['liquidity']:>8,.0f}  {m['question'][:60]}")
    print("\n" + "=" * 78)
    print("Detection is on the mid price; before trading, confirm the gap survives")
    print("the bid/ask spread and Polymarket fees. No event prediction needed —")
    print("this only flags prices that violate arithmetic the market must obey.")
    return 0


def _cmd_drift(args) -> int:
    """Measure post-move drift on Polymarket's price tape: after a sharp move,
    does price keep going (tradeable) or snap back? --dump captures real series
    to a file once; --from-file replays them offline (no API)."""
    from . import drift

    if getattr(args, "probe_history", False):
        from .adapters.polymarket import PolymarketSource
        pm = PolymarketSource()
        mks = [m for m in pm.open_markets(max_markets=400)
               if m.get("yes_token") and m["liquidity"] >= 10000]
        if not mks:
            print("no liquid market with a token found")
            return 1
        tok = mks[0]["yes_token"]
        print(f"\nprobing price-history combos on: {mks[0]['question'][:60]}")
        print(f"{'interval':>8}{'fidelity':>10}   result")
        for interval, fid in (("max", 60), ("1w", 60), ("1w", 10), ("1w", 5),
                              ("1w", 1), ("1d", 1), ("1d", 5), ("6h", 1),
                              ("max", 5), ("max", 1)):
            try:
                s = pm.price_history(tok, fidelity_min=fid, interval=interval)
                if s:
                    span_h = (s[-1][0] - s[0][0]) / 3600
                    print(f"{interval:>8}{fid:>10}   {len(s):>5} pts, {span_h:.0f}h span")
                else:
                    print(f"{interval:>8}{fid:>10}   EMPTY")
            except Exception as e:
                print(f"{interval:>8}{fid:>10}   ERR {str(e)[:40]}")
        return 0

    if args.from_file:
        print(f"\nLoading price series from {args.from_file}…")
        series_set = drift.load(args.from_file)
        print(f"loaded {len(series_set)} series.")
    else:
        from .adapters.polymarket import PolymarketSource
        pm = PolymarketSource()
        print(f"\nPulling open markets (scan {args.scan})…")
        markets = [m for m in pm.open_markets(max_markets=args.scan)
                   if m["liquidity"] >= args.min_liquidity and m.get("yes_token")]
        markets = markets[:args.markets]
        print(f"fetching price history for {len(markets)} liquid markets "
              f"(fidelity {args.fidelity}m)…")
        series_set = []
        for i, m in enumerate(markets, 1):
            try:
                s = pm.price_history(m["yes_token"], fidelity_min=args.fidelity,
                                     interval=args.interval)
            except Exception:
                continue
            if len(s) > args.lookback + args.horizon + 2:
                series_set.append({"question": m["question"],
                                   "token": m["yes_token"],
                                   "liquidity": m.get("liquidity", 0),
                                   "slug": m.get("slug", ""),
                                   "category": drift.category(m["question"]),
                                   "series": s})
            if i % 25 == 0:
                print(f"  {i}/{len(markets)} pulled…")
        if args.dump:
            drift.save(args.dump, series_set)
            print(f"\nsaved {len(series_set)} series to {args.dump} — commit it and "
                  f"I can iterate the backtest offline.")
            return 0

    if args.profile:
        prof = drift.profile(series_set, jump=args.jump, lag=args.lag,
                             back=args.lookback)
        hs = prof["horizons"]
        print("=" * 78)
        print(f"REPRICING-SPEED PROFILE · move {args.jump*100:.0f}c · enter +{args.lag} bar "
              f"· bar={args.fidelity}m")
        print("mean continuation (c) by bars-after-entry — rising = slow repricing "
              "= a window")
        print("=" * 78)
        print(f"  {'category':<13}{'events':>7}   " + "".join(f"+{h}b".rjust(8) for h in hs))
        rows = sorted(prof["by_category"].items(),
                      key=lambda kv: kv[1]["events"], reverse=True)
        for cat, b in rows:
            if not b["events"]:
                continue
            curve = "".join(f"{b['curve'][h]*100:>+7.1f}c" for h in hs)
            print(f"  {cat:<13}{b['events']:>7}   {curve}")
        print("=" * 78)
        print("flat/negative curve = repricing already done (no edge); a curve that")
        print("keeps rising over the first bars = a real window to ride after detection.")
        return 0

    rep = drift.run(series_set, jump=args.jump, back=args.lookback,
                    fwd=args.horizon, cost=args.cost, lag=args.lag)
    o = rep
    print("=" * 70)
    print(f"DRIFT TEST · {rep['series']} markets · sharp move = "
          f"{args.jump*100:.0f}c over {args.lookback} bar(s) · enter +{args.lag} bar · "
          f"hold {args.horizon} bar(s) · bar={args.fidelity}m")
    print("=" * 70)
    if not o["events"]:
        print("No sharp moves found. Lower --jump or pull more markets/history.")
        return 0
    print(f"  sharp-move events:  {o['events']:,}")
    print(f"  mean continuation:  {o['mean_cont']*100:+.2f}c  "
          f"(forward move in the trade's direction)")
    print(f"  hit rate:           {o['hit_rate']*100:.1f}%  (continued at all)")
    print(f"  net of {args.cost*100:.0f}c cost:    {o['net']*100:+.2f}c per trade")
    print(f"\n  by move size:")
    print(f"  {'band':<8}{'events':>8}{'mean_cont':>11}{'hit%':>7}{'net':>8}")
    for b in ("5-10c", "10-20c", "20c+"):
        a = rep["by_band"].get(b)
        if a:
            print(f"  {b:<8}{a['events']:>8}{a['mean_cont']*100:>+10.2f}c"
                  f"{a['hit_rate']*100:>6.0f}%{a['net']*100:>+7.2f}c")
    print("=" * 70)
    print("mean continuation > 0 (and > cost) = the tape under-reacts and drifts:")
    print("a real wave to surf. <= 0 = moves reverse or are random; thesis dead.")
    return 0


def _cmd_probe(args) -> int:
    """Confirm we can backtest whales on RESOLVED markets: settled-market list,
    the `result` field, and per-market trade-history depth."""
    config = _build_config(args)
    config.source = "kalshi"
    src = make_source("kalshi", config)
    print("auth:", "ON (authenticated)" if getattr(src, "auth", None) else "OFF (public)")

    page = src._get("markets", {"status": "settled", "limit": 100})
    ms = page.get("markets") or []
    print(f"\nsettled markets returned: {len(ms)}  more_pages={'yes' if page.get('cursor') else 'no'}")
    if not ms:
        print("No settled markets via status=settled — may need a different status value.")
        return 0

    m = ms[0]
    print("\nsettled-market fields:", sorted(m.keys()))
    print("result / settlement-ish fields:")
    for k in sorted(m):
        if any(s in k.lower() for s in ("result", "settle", "close", "determin")):
            print(f"   {k} = {m[k]!r}")

    # how many settled markets are 'real' (non-parlay) and have a result?
    real = [x for x in ms if not x.get("ticker", "").startswith("KXMVE")]
    print(f"\nnon-KXMVE settled markets on this page: {len(real)}")

    target = next((x for x in real if x.get("result")), real[0] if real else m)
    tk = target.get("ticker")
    print(f"\nsample resolved market: {tk}  result={target.get('result')!r}  "
          f"title={target.get('title')!r}")
    tp = src._get("markets/trades", {"ticker": tk, "limit": 1000})
    tr = tp.get("trades") or []
    print(f"trade history for it: {len(tr)} trades  more_pages={'yes' if tp.get('cursor') else 'no'}")
    if tr:
        times = sorted(t.get("created_time", "") for t in tr)
        print(f"trade time range: {times[0]}  ->  {times[-1]}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="whale_engine", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    run = sub.add_parser("run", help="run the watch-only detection loop")
    run.add_argument("--source", choices=["synthetic", "kalshi"], default=None)
    run.add_argument("--db", default=None, help="sqlite path (default: config or whales.db)")
    run.add_argument("--config", default="config.json", help="config JSON path")
    run.add_argument("--interval", type=int, default=None, help="poll interval seconds")
    run.add_argument("--cycles", type=int, default=None, help="stop after N cycles")
    run.add_argument("--once", action="store_true", help="run a single cycle and exit")
    run.add_argument("--backfill", type=int, default=0,
                     help="seed N hours of history before watching (Kalshi only)")
    run.add_argument("--closing-soon", type=int, default=0, dest="closing_soon",
                     help="only watch markets closing within N days")
    run.add_argument("--quiet", action="store_true", help="suppress info logging")
    run.set_defaults(func=_cmd_run)

    serve = sub.add_parser("serve", help="run the web dashboard (+ background watcher)")
    serve.add_argument("--source", choices=["synthetic", "kalshi"], default=None)
    serve.add_argument("--db", default=None, help="sqlite path (default: config or whales.db)")
    serve.add_argument("--config", default="config.json", help="config JSON path")
    serve.add_argument("--interval", type=int, default=None, help="poll interval seconds")
    serve.add_argument("--host", default="127.0.0.1", help="bind host")
    serve.add_argument("--port", type=int, default=8765, help="bind port")
    serve.add_argument("--no-watch", action="store_true",
                       help="serve only; don't start the background watcher")
    serve.add_argument("--no-open", action="store_true",
                       help="don't auto-open the browser")
    serve.add_argument("--backfill", type=int, default=0,
                       help="seed N hours of history before watching (Kalshi only)")
    serve.add_argument("--closing-soon", type=int, default=0, dest="closing_soon",
                       help="only watch markets closing within N days")
    serve.add_argument("--quiet", action="store_true", help="suppress info logging")
    serve.set_defaults(func=_cmd_serve)

    bf = sub.add_parser("backfill", help="seed the DB with recent history, then exit")
    bf.add_argument("--source", choices=["synthetic", "kalshi"], default="kalshi")
    bf.add_argument("--db", default=None, help="sqlite path")
    bf.add_argument("--config", default="config.json", help="config JSON path")
    bf.add_argument("--hours", type=int, default=6, help="hours of history to pull")
    bf.add_argument("--quiet", action="store_true")
    bf.set_defaults(func=_cmd_backfill)

    bt = sub.add_parser("backtest", help="grade whale trades on resolved markets")
    bt.add_argument("--config", default="config.json", help="config JSON path")
    bt.add_argument("--days", type=int, default=3, help="resolved within the last N days")
    bt.add_argument("--min-dollars", type=float, default=500.0, dest="min_dollars",
                    help="minimum $ staked to count as a whale trade")
    bt.add_argument("--max-markets", type=int, default=150, dest="max_markets",
                    help="cap markets analyzed (bounds API calls)")
    bt.add_argument("--max-price", type=float, default=1.0, dest="max_price",
                    help="exclude trades above this price (e.g. 0.9 drops near-locks)")
    bt.add_argument("--max-per-event", type=int, default=3, dest="max_per_event",
                    help="drop events with more than N markets (multi-candidate fields)")
    bt.add_argument("--quiet", action="store_true")
    bt.set_defaults(func=_cmd_backtest)

    poly = sub.add_parser("poly", help="grade Polymarket wallets by real edge")
    poly.add_argument("--config", default="config.json", help="config JSON path")
    poly.add_argument("--wallet", default=None,
                      help="grade one wallet (0x...) instead of the leaderboard")
    poly.add_argument("--top", type=int, default=10,
                      help="grade the top-N leaderboard wallets")
    poly.add_argument("--window", default="all",
                      choices=["all", "month", "week", "day"],
                      help="leaderboard time window")
    poly.add_argument("--min-dollars", type=float, default=100.0, dest="min_dollars",
                      help="minimum $ staked per trade to grade")
    poly.add_argument("--max-trades", type=int, default=2000, dest="max_trades",
                      help="cap trades pulled per wallet")
    poly.add_argument("--forward", type=int, default=0,
                      help="out-of-sample test: qualify wallets on edge before "
                           "N days ago, grade copying their entries since")
    poly.add_argument("--slippage", type=float, default=0.02,
                      help="price haircut a copier pays vs the whale's fill")
    poly.add_argument("--quiet", action="store_true")
    poly.set_defaults(func=_cmd_poly)

    arb = sub.add_parser("arb", help="scan open markets for structural mispricings")
    arb.add_argument("--config", default="config.json", help="config JSON path")
    arb.add_argument("--max-markets", type=int, default=4000, dest="max_markets",
                     help="cap open markets pulled")
    arb.add_argument("--min-gap", type=float, default=0.03, dest="min_gap",
                     help="minimum locked gap to flag (e.g. 0.03 = 3c)")
    arb.add_argument("--min-liquidity", type=float, default=500.0,
                     dest="min_liquidity", help="minimum per-rung liquidity ($)")
    arb.add_argument("--limit", type=int, default=25, help="max rows to print")
    arb.add_argument("--show-ladders", action="store_true",
                     help="also print the ladder groups (to tune grouping)")
    arb.add_argument("--quiet", action="store_true")
    arb.set_defaults(func=_cmd_arb)

    drift = sub.add_parser("drift", help="measure post-move price drift (trading thesis)")
    drift.add_argument("--config", default="config.json", help="config JSON path")
    drift.add_argument("--scan", type=int, default=1500, help="open markets to scan")
    drift.add_argument("--markets", type=int, default=300,
                       help="liquid markets to pull price history for")
    drift.add_argument("--min-liquidity", type=float, default=10000.0,
                       dest="min_liquidity", help="min market liquidity ($)")
    drift.add_argument("--fidelity", type=int, default=60,
                       help="price bar size in minutes")
    drift.add_argument("--interval", default="max",
                       help="history window: max | 1m | 1w | 1d | 6h | 1h")
    drift.add_argument("--jump", type=float, default=0.05,
                       help="sharp-move threshold (e.g. 0.05 = 5c)")
    drift.add_argument("--lookback", type=int, default=1,
                       help="bars over which the sharp move is measured")
    drift.add_argument("--horizon", type=int, default=1,
                       help="bars forward to measure continuation")
    drift.add_argument("--lag", type=int, default=1,
                       help="entry delay in bars (>=1 realistic; 0 = untradeable spike price)")
    drift.add_argument("--profile", action="store_true",
                       help="repricing-speed profile by market category (find the slow buckets)")
    drift.add_argument("--probe-history", action="store_true", dest="probe_history",
                       help="diagnose which interval/fidelity combos the CLOB returns")
    drift.add_argument("--cost", type=float, default=0.01,
                       help="assumed round-trip friction subtracted from edge")
    drift.add_argument("--dump", default=None,
                       help="save fetched price series to this file and exit")
    drift.add_argument("--from-file", default=None, dest="from_file",
                       help="replay price series from a saved file (offline)")
    drift.add_argument("--quiet", action="store_true")
    drift.set_defaults(func=_cmd_drift)

    probe = sub.add_parser("probe", help="dump raw Kalshi market data (diagnostics)")
    probe.add_argument("--config", default="config.json", help="config JSON path")
    probe.add_argument("--quiet", action="store_true")
    probe.set_defaults(func=_cmd_probe)

    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.WARNING if args.quiet else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    _load_dotenv()  # pick up Kalshi credentials from a local .env if present
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
