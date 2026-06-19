"""Command-line entry point.

  python -m whale_engine.cli run                 # synthetic demo, runs forever
  python -m whale_engine.cli run --once          # a single cycle
  python -m whale_engine.cli run --source kalshi # live Kalshi public data
  python -m whale_engine.cli run --cycles 20 --interval 2
"""

from __future__ import annotations

import argparse
import logging
from datetime import datetime, timezone

from .adapters import make_source
from .config import Config
from .engine import Engine
from .models import Signal
from .storage import Storage

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

    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.WARNING if args.quiet else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    config = Config.load(args.config)
    if args.source:
        config.source = args.source
    if args.db:
        config.db_path = args.db
    if args.interval is not None:
        config.poll_interval_sec = args.interval

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


if __name__ == "__main__":
    raise SystemExit(main())
