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

    # Kalshi auto-generates tens of thousands of dead "cross category" parlay
    # combos. They have no liquidity and just bury the real markets — skip them.
    EXCLUDE_PREFIXES = ("KXMVECROSSCATEGORY",)

    def __init__(self, base_url: str, market_limit: int, timeout: int = 30,
                 auth=None, scan_pages: int = 120, active_only: bool = True,
                 discovery_every: int = 40) -> None:
        self.base_url = base_url.rstrip("/")
        self.market_limit = market_limit
        self.timeout = timeout
        self.auth = auth  # optional KalshiAuth; None = unauthenticated public access
        self.scan_pages = scan_pages
        self.active_only = active_only
        self.discovery_every = discovery_every
        self._liquid: list[MarketSnapshot] = []   # cached most-liquid markets
        self._cycle = 0

    def _get(self, path: str, params: dict) -> dict:
        qs = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
        url = f"{self.base_url}/{path.lstrip('/')}"
        # Kalshi signs the path only (no query string), e.g. /trade-api/v2/markets
        sign_path = urllib.parse.urlsplit(url).path
        if qs:
            url += f"?{qs}"
        headers = {"Accept": "application/json"}
        if self.auth is not None:
            headers.update(self.auth.headers("GET", sign_path))
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            hint = (" — check KALSHI_API_KEY_ID / private key" if exc.code in (401, 403)
                    else "")
            log.warning("Kalshi request failed (%s): HTTP %s%s", path, exc.code, hint)
            return {}
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            log.warning("Kalshi request failed (%s): %s", path, exc)
            return {}

    def raw_page(self, params: dict) -> dict:
        """Fetch one raw /markets page (diagnostics)."""
        return self._get("markets", params)

    def fetch_markets(self) -> list[MarketSnapshot]:
        # Expensive full scan to *discover* the liquid markets, then cheap
        # refreshes of just those until it's time to rediscover.
        self._cycle += 1
        if not self._liquid or self._cycle % self.discovery_every == 0:
            discovered = self._discover_liquid()
            if discovered:
                self._liquid = discovered
            return self._liquid

        refreshed = self._fetch_by_tickers([s.market_id for s in self._liquid])
        if refreshed:
            self._liquid = refreshed
            return self._liquid
        # Refresh came back empty (e.g. the `tickers` filter isn't honored) —
        # fall back to a full rediscovery so we never go stale or blank.
        discovered = self._discover_liquid()
        if discovered:
            self._liquid = discovered
        return self._liquid

    def _discover_liquid(self) -> list[MarketSnapshot]:
        """Page through open markets, skip parlay junk, keep ones with real
        volume/open-interest, and return the most-liquid `market_limit`."""
        found: list[MarketSnapshot] = []
        scanned = 0
        pages = 0
        cursor = None
        for _ in range(self.scan_pages):
            page = self._get("markets", {"limit": 1000, "status": "open",
                                         "cursor": cursor})
            markets = page.get("markets") or []
            if not markets:
                break
            pages += 1
            scanned += len(markets)
            for m in markets:
                if m.get("ticker", "").startswith(self.EXCLUDE_PREFIXES):
                    continue
                snap = self._to_snapshot(m)
                if not self.active_only or snap.volume > 0 or snap.open_interest > 0:
                    found.append(snap)
            if len(found) >= self.market_limit * 3:  # plenty to rank from
                break
            cursor = page.get("cursor")
            if not cursor:
                break
        found.sort(key=lambda s: s.volume, reverse=True)
        top = found[: self.market_limit]
        log.info("Kalshi discovery: scanned %d markets over %d pages, kept %d active; "
                 "top: %s", scanned, pages, len(top),
                 ", ".join(f"{s.market_id}({s.volume})" for s in top[:5]) or "none")
        return top

    def _fetch_by_tickers(self, tickers: list[str]) -> list[MarketSnapshot]:
        out: list[MarketSnapshot] = []
        for i in range(0, len(tickers), 100):
            batch = tickers[i:i + 100]
            page = self._get("markets", {"tickers": ",".join(batch), "limit": 1000})
            for m in page.get("markets") or []:
                out.append(self._to_snapshot(m))
        out.sort(key=lambda s: s.volume, reverse=True)
        return out

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
