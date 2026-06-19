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
    return config


def _cmd_run(args) -> int:
    config = _build_config(args)
    store = Storage(config.db_path)
    source = make_source(config.source, config)
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
            Engine(config, source, store, sink=lambda _s: None).run()
        threading.Thread(target=_watch, daemon=True, name="watcher").start()
        print(f"Background watcher started (source={config.source}, "
              f"interval={config.poll_interval_sec}s).")
    web.serve(config.db_path, host=args.host, port=args.port,
              open_browser=not args.no_open)
    return 0


def _cmd_probe(args) -> int:
    """Dump raw Kalshi market data so we can see the true field names/values."""
    from collections import Counter
    config = _build_config(args)
    config.source = "kalshi"
    src = make_source("kalshi", config)
    print("auth:", "ON (authenticated)" if getattr(src, "auth", None) else "OFF (public)")

    # Scan several pages, splitting multivariate (KXMVE*) from real single markets.
    kxmve = 0
    others: list[dict] = []
    cursor = None
    pages = 0
    for _ in range(8):
        page = src.raw_page({"limit": 1000, "status": "open", "cursor": cursor})
        ms = page.get("markets") or []
        if not ms:
            break
        pages += 1
        for m in ms:
            if m.get("ticker", "").startswith("KXMVE"):
                kxmve += 1
            else:
                others.append(m)
        if len(others) >= 20:
            break
        cursor = page.get("cursor")
        if not cursor:
            break

    print(f"\nscanned {pages} page(s) (~{pages*1000} markets): "
          f"{kxmve} multivariate KXMVE*, {len(others)} real single markets")

    if not others:
        print("\nNo non-KXMVE markets found in the scan — the listing is all "
              "multivariate combos. We'll need to fetch via events/series instead.")
        return 0

    m = others[0]
    print(f"\nfirst REAL market: {m.get('ticker')}  (status={m.get('status')})")
    print("all field names:", sorted(m.keys()))
    print("volume/interest/price-ish fields:")
    for k, v in sorted(m.items()):
        if any(s in k.lower() for s in ("vol", "interest", "price", "liquid")):
            print(f"   {k} = {v!r}")
    print("\nnext few real markets:")
    for x in others[:8]:
        print(f"   {x.get('ticker',''):42} vol={x.get('volume')} "
              f"vol24={x.get('volume_24h')} oi={x.get('open_interest')} "
              f"liq={x.get('liquidity')}")
    print("\nreal-market ticker prefixes:",
          dict(Counter(x.get('ticker', '').split('-')[0] for x in others).most_common(15)))
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
    serve.add_argument("--quiet", action="store_true", help="suppress info logging")
    serve.set_defaults(func=_cmd_serve)

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
