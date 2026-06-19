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


def _cmd_probe(args) -> int:
    """Dump a raw Kalshi TRADE so we can fix count/price field parsing."""
    import json as _json
    config = _build_config(args)
    config.source = "kalshi"
    src = make_source("kalshi", config)
    print("auth:", "ON (authenticated)" if getattr(src, "auth", None) else "OFF (public)")

    # Find a liquid market via events -> batch fetch -> highest volume.
    ev = src._get("events", {"limit": 200, "status": "open",
                             "with_nested_markets": "true"})
    tickers = [m.get("ticker") for e in (ev.get("events") or [])
               if not e.get("event_ticker", "").startswith("KXMVE")
               for m in (e.get("markets") or []) if m.get("ticker")]
    full = (src._get("markets", {"tickers": ",".join(tickers[:100]),
                                 "limit": 1000}).get("markets") or [])
    full.sort(key=lambda m: src._num(m, "volume_fp", "volume"), reverse=True)
    if not full:
        print("no markets found")
        return 0

    # Probe trades for the few most-liquid markets until one has trades.
    for m in full[:5]:
        ticker = m.get("ticker")
        page = src._get("markets/trades", {"ticker": ticker, "limit": 10})
        trades = page.get("trades") or []
        print(f"\n{ticker}: {len(trades)} trades "
              f"(market volume_fp={m.get('volume_fp')})")
        if trades:
            print("FULL first trade:")
            print(_json.dumps(trades[0], indent=2))
            print("trade field names:", sorted(trades[0].keys()))
            return 0
    print("\nNo trades found on the top markets right now (quiet period). "
          "Re-run during active trading.")
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
