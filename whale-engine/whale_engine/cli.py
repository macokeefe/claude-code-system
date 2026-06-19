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
                       max_markets=args.max_markets, max_price=args.max_price)
    if rep.get("error"):
        print("error:", rep["error"])
        return 1

    o = rep["overall"]
    print("=" * 64)
    print(f"RESOLVED MARKETS GRADED: {rep['markets']}   "
          f"(excluding trades above {args.max_price*100:.0f}c)")
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
    bt.add_argument("--quiet", action="store_true")
    bt.set_defaults(func=_cmd_backtest)

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
