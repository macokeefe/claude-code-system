"""Source adapter interface.

Phase 4 (Polymarket) implements this same protocol so wallet-level whale
data flows through the identical pipeline.
"""

from __future__ import annotations

from typing import Protocol

from ..models import MarketSnapshot, TradeEvent


class Source(Protocol):
    name: str

    def fetch_markets(self) -> list[MarketSnapshot]:
        """Current snapshot for each tracked market."""
        ...

    def fetch_trades(self, market_id: str, since_ms: int) -> list[TradeEvent]:
        """Trades for a market since the given epoch-ms timestamp."""
        ...
