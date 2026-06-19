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
        # seed the global trade cursor to the last hour so the first pull is bounded
        self._last_global_ts = 0

    def run_once(self) -> int:
        """One ingest+detect cycle. Returns the number of signals emitted."""
        emitted = 0
        markets = self.source.fetch_markets()
        log.info("fetched %d markets from %s", len(markets), self.source.name)

        dropped = 0
        snap_by_id: dict[str, MarketSnapshot] = {}
        for snap in markets:
            if not _sanitize(snap):
                dropped += 1
                continue
            self.store.insert_snapshot(snap)
            snap_by_id[snap.market_id] = snap
            for sig in self.detectors.on_snapshot(snap):
                self._emit(sig)
                emitted += 1
        if dropped:
            log.info("dropped %d malformed market snapshots this cycle", dropped)

        # remember titles for tracked markets so the activity feed can label them
        self.store.upsert_titles((s.market_id, s.question)
                                 for s in snap_by_id.values() if s.question)

        if hasattr(self.source, "fetch_recent_trades"):
            emitted += self._global_trades(snap_by_id)
        else:  # synthetic / venues without a global feed: per-market polling
            for mid, snap in snap_by_id.items():
                since = self._last_trade_ts.get(mid, 0)
                trades = self.source.fetch_trades(mid, since)
                if trades:
                    self.store.insert_trades(trades)
                    self._last_trade_ts[mid] = max(t.ts for t in trades)
                    for sig in self.detectors.on_trades(snap, trades):
                        self._emit(sig)
                        emitted += 1
        return emitted

    def _global_trades(self, snap_by_id: dict) -> int:
        """Pull the platform-wide trade firehose, store it, run size-spike on
        tracked markets, and resolve titles for unknown markets in the feed."""
        import time as _t
        if not self._last_global_ts:
            self._last_global_ts = int(_t.time() * 1000) - 3600_000  # last hour
        trades = self.source.fetch_recent_trades(self._last_global_ts)
        if not trades:
            return 0
        self.store.insert_trades(trades)
        self._last_global_ts = max(t.ts for t in trades)

        emitted = 0
        by_market: dict[str, list] = {}
        for t in trades:
            by_market.setdefault(t.market_id, []).append(t)
        # size-spike only where we have a current snapshot (price/OI context)
        for mid, mtrades in by_market.items():
            snap = snap_by_id.get(mid)
            if snap:
                for sig in self.detectors.on_trades(snap, mtrades):
                    self._emit(sig)
                    emitted += 1

        # label markets we don't track but saw trades in
        seen = list(by_market)
        known = self.store.title_map(seen)
        missing = [tk for tk in seen if tk not in known]
        if missing and hasattr(self.source, "resolve_titles"):
            try:
                self.store.upsert_titles(self.source.resolve_titles(missing[:100]).items())
            except Exception:
                log.debug("title resolution failed", exc_info=True)
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
