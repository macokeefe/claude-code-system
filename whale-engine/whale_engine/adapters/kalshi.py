"""Kalshi adapter — public market data, read-only.

Uses Kalshi's public trade-api v2 endpoints. Market/trade reads work
without authentication; an API key would only be needed for trading
(out of scope in Phase 1). Stdlib urllib only — no third-party HTTP dep.

Kalshi quotes prices in cents (0-100); we normalize to implied
probability (0.0-1.0). Network/parse failures degrade gracefully to an
empty list with a logged warning, so one bad cycle never kills the loop.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from ..models import MarketSnapshot, TradeEvent

log = logging.getLogger("whale_engine.kalshi")


def _iso_to_ms(iso: str) -> int:
    if not iso:
        return 0
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return int(dt.timestamp() * 1000)
    except ValueError:
        return 0


class KalshiSource:
    name = "kalshi"

    def __init__(self, base_url: str, market_limit: int, timeout: int = 15) -> None:
        self.base_url = base_url.rstrip("/")
        self.market_limit = market_limit
        self.timeout = timeout

    def _get(self, path: str, params: dict) -> dict:
        qs = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
        url = f"{self.base_url}/{path.lstrip('/')}"
        if qs:
            url += f"?{qs}"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            log.warning("Kalshi request failed (%s): %s", path, exc)
            return {}

    def fetch_markets(self) -> list[MarketSnapshot]:
        out: list[MarketSnapshot] = []
        cursor = None
        while len(out) < self.market_limit:
            page = self._get("markets", {
                "limit": min(1000, self.market_limit - len(out)),
                "status": "open",
                "cursor": cursor,
            })
            markets = page.get("markets") or []
            if not markets:
                break
            for m in markets:
                out.append(self._to_snapshot(m))
            cursor = page.get("cursor")
            if not cursor:
                break
        return out[: self.market_limit]

    def _to_snapshot(self, m: dict) -> MarketSnapshot:
        # Prefer the bid/ask midpoint; fall back to last price. All in cents.
        yes_bid = m.get("yes_bid")
        yes_ask = m.get("yes_ask")
        if yes_bid is not None and yes_ask is not None and (yes_bid or yes_ask):
            yes_cents = (yes_bid + yes_ask) / 2
        else:
            yes_cents = m.get("last_price") or 0
        title = m.get("title") or m.get("subtitle") or m.get("ticker", "")
        return MarketSnapshot(
            platform=self.name,
            market_id=m.get("ticker", ""),
            question=title,
            status=m.get("status", ""),
            ts=int(datetime.now(timezone.utc).timestamp() * 1000),
            yes_price=max(0.0, min(1.0, yes_cents / 100.0)),
            volume=int(m.get("volume") or 0),
            open_interest=int(m.get("open_interest") or 0),
            liquidity=float(m.get("liquidity") or 0),
        )

    def fetch_trades(self, market_id: str, since_ms: int) -> list[TradeEvent]:
        page = self._get("markets/trades", {"ticker": market_id, "limit": 100})
        trades = page.get("trades") or []
        out: list[TradeEvent] = []
        for t in trades:
            ts = _iso_to_ms(t.get("created_time", ""))
            if since_ms and ts <= since_ms:
                continue
            yes_cents = t.get("yes_price") or 0
            out.append(TradeEvent(
                platform=self.name,
                market_id=market_id,
                ts=ts,
                price=max(0.0, min(1.0, yes_cents / 100.0)),
                count=int(t.get("count") or 0),
                taker_side=t.get("taker_side", "") or "",
                trade_id=str(t.get("trade_id") or f"{market_id}:{ts}:{t.get('count')}"),
            ))
        return out
