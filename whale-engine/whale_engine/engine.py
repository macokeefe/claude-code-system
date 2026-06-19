"""The watch-only loop: ingest -> store -> detect -> emit.

No money, no orders. Each cycle pulls market snapshots and recent trades,
persists them, runs the detectors, and hands any signals to a callback
(the CLI prints them; later phases can route to alerts / paper trading).
"""

from __future__ import annotations

import logging
import time
from typing import Callable

from .adapters.base import Source
from .config import Config
from .detectors import Detectors
from .models import MarketSnapshot, Signal
from .storage import Storage

log = logging.getLogger("whale_engine.engine")

SignalSink = Callable[[Signal], None]


def _sanitize(snap: MarketSnapshot) -> bool:
    """Clamp/repair a snapshot in place; return False to drop garbage.

    Defends the DB and detectors from malformed venue data: missing ids,
    out-of-range probabilities, negative counts, or completely empty rows.
    """
    if not snap.market_id:
        return False
    try:
        snap.yes_price = min(1.0, max(0.0, float(snap.yes_price)))
        snap.volume = max(0, int(snap.volume))
        snap.open_interest = max(0, int(snap.open_interest))
        snap.liquidity = max(0.0, float(snap.liquidity))
    except (TypeError, ValueError):
        return False
    # a row with no price, no volume, and no open interest carries no signal
    if snap.yes_price <= 0 and snap.volume <= 0 and snap.open_interest <= 0:
        return False
    return True


class Engine:
    def __init__(self, config: Config, source: Source, store: Storage,
                 sink: SignalSink) -> None:
        self.config = config
        self.source = source
        self.store = store
        self.sink = sink
        self.detectors = Detectors(store, config.thresholds)
        self._last_trade_ts: dict[str, int] = {}

    def run_once(self) -> int:
        """One ingest+detect cycle. Returns the number of signals emitted."""
        emitted = 0
        markets = self.source.fetch_markets()
        log.info("fetched %d markets from %s", len(markets), self.source.name)

        dropped = 0
        for snap in markets:
            if not _sanitize(snap):
                dropped += 1
                continue
            self.store.insert_snapshot(snap)

            for sig in self.detectors.on_snapshot(snap):
                self._emit(sig)
                emitted += 1

            since = self._last_trade_ts.get(snap.market_id, 0)
            trades = self.source.fetch_trades(snap.market_id, since)
            if trades:
                self.store.insert_trades(trades)
                self._last_trade_ts[snap.market_id] = max(t.ts for t in trades)
                for sig in self.detectors.on_trades(snap, trades):
                    self._emit(sig)
                    emitted += 1

        if dropped:
            log.info("dropped %d malformed market snapshots this cycle", dropped)
        return emitted

    def run(self, max_cycles: int | None = None) -> None:
        """Poll forever (or for max_cycles), sleeping between cycles."""
        cycle = 0
        while max_cycles is None or cycle < max_cycles:
            start = time.time()
            try:
                self.run_once()
            except Exception:  # one bad cycle must not kill the watcher
                log.exception("cycle failed; continuing")
            cycle += 1
            if max_cycles is not None and cycle >= max_cycles:
                break
            elapsed = time.time() - start
            time.sleep(max(0.0, self.config.poll_interval_sec - elapsed))

    def _emit(self, sig: Signal) -> None:
        self.store.insert_signal(sig)
        self.sink(sig)
