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
                 discovery_every: int = 40, max_close_days: int = 0) -> None:
        self.base_url = base_url.rstrip("/")
        self.market_limit = market_limit
        self.timeout = timeout
        self.auth = auth  # optional KalshiAuth; None = unauthenticated public access
        self.scan_pages = scan_pages
        self.active_only = active_only
        self.discovery_every = discovery_every
        self.max_close_days = max_close_days
        self._liquid: list[MarketSnapshot] = []   # cached most-liquid markets
        self._cycle = 0
        self._series_of: dict[str, str] = {}      # market ticker -> series ticker
        self._logged_candle = False

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

    def _discover_real_tickers(self) -> list[str]:
        """Enumerate real (non-KXMVE) market tickers via the events endpoint.
        The plain /markets listing is flooded with KXMVE parlay combos; events
        give us the genuine markets."""
        tickers: list[str] = []
        cap = self.market_limit * 25
        cursor = None
        pages = 0
        for _ in range(self.scan_pages):
            page = self._get("events", {"limit": 200, "status": "open",
                                        "with_nested_markets": "true",
                                        "cursor": cursor})
            events = page.get("events") or []
            if not events:
                break
            pages += 1
            for e in events:
                if e.get("event_ticker", "").startswith("KXMVE"):
                    continue
                if (e.get("series_ticker") or "").startswith("KXMVE"):
                    continue
                series = e.get("series_ticker") or e.get("event_ticker", "").split("-")[0]
                for m in e.get("markets") or []:
                    t = m.get("ticker")
                    if t:
                        tickers.append(t)
                        if series:
                            self._series_of[t] = series
            if len(tickers) >= cap:
                break
            cursor = page.get("cursor")
            if not cursor:
                break
        return tickers[:cap], pages

    def _discover_liquid(self) -> list[MarketSnapshot]:
        """Find real markets via events, fetch their full data (with volume),
        keep the ones with real activity, and return the most-liquid ones."""
        import time as _t
        tickers, ev_pages = self._discover_real_tickers()
        snaps = self._fetch_by_tickers(tickers)
        if self.active_only:
            snaps = [s for s in snaps if s.volume > 0 or s.open_interest > 0]
        snaps.sort(key=lambda s: s.volume, reverse=True)

        if self.max_close_days > 0:
            # Hard focus: only markets closing within the window.
            horizon = int(_t.time() * 1000) + self.max_close_days * 86_400_000
            top = [s for s in snaps if 0 < s.close_ts <= horizon][: self.market_limit]
        else:
            # Top by volume, blended with markets closing within a week so the
            # "closing soon" view always has something (they're rarely the
            # highest-volume markets, so they need to be added explicitly).
            top = snaps[: self.market_limit]
            seen = {s.market_id for s in top}
            week = int(_t.time() * 1000) + 7 * 86_400_000
            soon = [s for s in snaps if 0 < s.close_ts <= week]
            for s in soon[: self.market_limit // 2]:
                if s.market_id not in seen:
                    top.append(s)
                    seen.add(s.market_id)

        log.info("Kalshi discovery: %d real tickers over %d event pages, %d tracked; "
                 "top: %s", len(tickers), ev_pages, len(top),
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

    @staticmethod
    def _num(m: dict, *keys) -> float:
        """First parseable numeric value among keys (Kalshi sends them as strings)."""
        for k in keys:
            v = m.get(k)
            if v is None or v == "":
                continue
            try:
                return float(v)
            except (TypeError, ValueError):
                continue
        return 0.0

    def _to_snapshot(self, m: dict) -> MarketSnapshot:
        # Kalshi's current schema uses `_dollars` (price 0..1) and `_fp` (counts)
        # string fields; older field names are kept as fallbacks.
        yes_bid = self._num(m, "yes_bid_dollars")
        yes_ask = self._num(m, "yes_ask_dollars")
        if yes_bid or yes_ask:
            yes = (yes_bid + yes_ask) / 2.0
        else:
            yes = self._num(m, "last_price_dollars")
            if not yes:  # legacy cents field
                yes = self._num(m, "last_price") / 100.0
        if yes > 1.0:  # safety: a cents value slipped through
            yes /= 100.0
        title = (m.get("title") or m.get("yes_sub_title")
                 or m.get("subtitle") or m.get("ticker", ""))
        return MarketSnapshot(
            platform=self.name,
            market_id=m.get("ticker", ""),
            question=title,
            status=m.get("status", ""),
            ts=int(datetime.now(timezone.utc).timestamp() * 1000),
            yes_price=max(0.0, min(1.0, yes)),
            volume=int(self._num(m, "volume_fp", "volume")),
            open_interest=int(self._num(m, "open_interest_fp", "open_interest")),
            liquidity=self._num(m, "liquidity_dollars", "liquidity"),
            close_ts=_iso_to_ms(m.get("close_time", "")),
        )

    def _to_trade(self, t: dict, market_id: str) -> TradeEvent:
        ts = _iso_to_ms(t.get("created_time", ""))
        price = self._num(t, "yes_price_dollars")
        if not price:  # legacy cents field
            price = self._num(t, "yes_price") / 100.0
        if price > 1.0:
            price /= 100.0
        count = int(self._num(t, "count_fp", "count"))
        return TradeEvent(
            platform=self.name,
            market_id=market_id,
            ts=ts,
            price=max(0.0, min(1.0, price)),
            count=count,
            taker_side=t.get("taker_side", "") or "",
            trade_id=str(t.get("trade_id") or f"{market_id}:{ts}:{count}"),
        )

    def fetch_trades(self, market_id: str, since_ms: int) -> list[TradeEvent]:
        page = self._get("markets/trades", {"ticker": market_id, "limit": 100})
        out = [self._to_trade(t, market_id) for t in (page.get("trades") or [])]
        return [t for t in out if not (since_ms and t.ts <= since_ms)]

    def fetch_recent_trades(self, since_ms: int, max_pages: int = 5) -> list[TradeEvent]:
        """The GLOBAL trade feed: every trade across Kalshi since `since_ms`,
        paginated. This is the whale firehose — not limited to tracked markets."""
        out: list[TradeEvent] = []
        cursor = None
        base = {"limit": 1000}
        if since_ms:
            base["min_ts"] = int(since_ms / 1000)  # Kalshi min_ts is unix seconds
        for _ in range(max_pages):
            params = dict(base)
            if cursor:
                params["cursor"] = cursor
            page = self._get("markets/trades", params)
            trades = page.get("trades") or []
            if not trades:
                break
            for t in trades:
                ticker = t.get("ticker", "")
                if ticker:
                    out.append(self._to_trade(t, ticker))
            cursor = page.get("cursor")
            if not cursor:
                break
        return out

    def fetch_all_trades(self, ticker: str, max_pages: int = 12) -> list[TradeEvent]:
        """Full trade history for one market (paginated) — for backtesting."""
        out: list[TradeEvent] = []
        cursor = None
        for _ in range(max_pages):
            params = {"ticker": ticker, "limit": 1000}
            if cursor:
                params["cursor"] = cursor
            page = self._get("markets/trades", params)
            trades = page.get("trades") or []
            if not trades:
                break
            out.extend(self._to_trade(t, ticker) for t in trades)
            cursor = page.get("cursor")
            if not cursor:
                break
        return out

    def settled_real_tickers(self, event_pages: int = 12, cap: int = 600) -> list[str]:
        """Resolved (non-KXMVE) market tickers, via the events endpoint to
        dodge the parlay flood."""
        tickers: list[str] = []
        cursor = None
        for _ in range(event_pages):
            page = self._get("events", {"limit": 200, "status": "settled",
                                        "with_nested_markets": "true", "cursor": cursor})
            events = page.get("events") or []
            if not events:
                break
            for e in events:
                if e.get("event_ticker", "").startswith("KXMVE"):
                    continue
                if (e.get("series_ticker") or "").startswith("KXMVE"):
                    continue
                for m in e.get("markets") or []:
                    if m.get("ticker"):
                        tickers.append(m["ticker"])
            if len(tickers) >= cap:
                break
            cursor = page.get("cursor")
            if not cursor:
                break
        return tickers[:cap]

    def fetch_markets_raw(self, tickers: list[str]) -> list[dict]:
        """Full raw market dicts for tickers (carries result, settlement_ts, …)."""
        out: list[dict] = []
        for i in range(0, len(tickers), 100):
            page = self._get("markets", {"tickers": ",".join(tickers[i:i + 100]),
                                         "limit": 1000})
            out.extend(page.get("markets") or [])
        return out

    def resolve_titles(self, tickers: list[str]) -> dict:
        """Look up human-readable titles for market tickers (batched)."""
        out: dict = {}
        for i in range(0, len(tickers), 100):
            batch = tickers[i:i + 100]
            page = self._get("markets", {"tickers": ",".join(batch), "limit": 1000})
            for m in page.get("markets") or []:
                tk = m.get("ticker")
                if tk:
                    out[tk] = (m.get("title") or m.get("yes_sub_title")
                               or m.get("subtitle") or tk)
        return out

    def series_of(self, ticker: str) -> str:
        """Series ticker for a market (from discovery, else the ticker prefix)."""
        return self._series_of.get(ticker) or ticker.split("-")[0]

    def _candle_price(self, c: dict) -> float:
        po = c.get("price")
        if isinstance(po, dict):
            v = self._num(po, "close_dollars", "close", "mean_dollars", "mean")
        else:
            v = self._num(c, "close_dollars", "close")
        if v > 1.0:  # legacy cents
            v /= 100.0
        return max(0.0, min(1.0, v))

    def fetch_candlesticks(self, ticker: str, series_ticker: str,
                           start_ts: int, end_ts: int, interval: int = 60) -> list[dict]:
        """Historical OHLC/volume/OI buckets for a market. `interval` is minutes
        (1, 60, or 1440). Returns [{ts, price, vol, oi}] oldest-first."""
        path = f"series/{series_ticker}/markets/{ticker}/candlesticks"
        page = self._get(path, {"start_ts": start_ts, "end_ts": end_ts,
                                "period_interval": interval})
        cs = page.get("candlesticks") or []
        if cs and not self._logged_candle:
            self._logged_candle = True
            log.info("sample candlestick: %s", json.dumps(cs[0])[:400])
        out = []
        for c in cs:
            ts = int(float(c.get("end_period_ts") or 0)) * 1000
            if not ts:
                continue
            out.append({
                "ts": ts,
                "price": self._candle_price(c),
                "vol": self._num(c, "volume_fp", "volume"),
                "oi": int(self._num(c, "open_interest_fp", "open_interest")),
            })
        out.sort(key=lambda p: p["ts"])
        return out
