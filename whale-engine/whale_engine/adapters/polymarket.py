"""Polymarket adapter — the attributed-trade venue.

Unlike Kalshi (anonymous flow), every Polymarket trade is tied to a public
wallet, so we can build a real, gradeable track record per trader. This
adapter pulls three things from Polymarket's public APIs (no auth):

  * leaderboard()      -> top wallets by realized P&L      (lb-api)
  * wallet_trades()    -> a wallet's full trade history     (data-api)
  * resolve_markets()  -> outcome of each market, for grading (gamma-api)

Confirmed field shapes (June 2026):
  leaderboard row: proxyWallet, amount (lifetime $ P&L), name, pseudonym
  trade row:       proxyWallet, side(BUY/SELL), conditionId, size(shares),
                   price(0..1), timestamp(unix s), title, outcome, outcomeIndex
  gamma market:    conditionId, question, closed(bool),
                   outcomes (JSON str), outcomePrices (JSON str; "1"=winner)
"""

from __future__ import annotations

import json
import logging
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass

log = logging.getLogger("whale_engine.adapters.polymarket")

DATA_API = "https://data-api.polymarket.com"
LB_API = "https://lb-api.polymarket.com"
GAMMA_API = "https://gamma-api.polymarket.com"
CLOB_API = "https://clob.polymarket.com"
UA = "whale-engine/0.1 (+https://github.com/macokeefe/claude-code-system)"


@dataclass
class PolyTrade:
    """One executed Polymarket trade (attributed to a wallet)."""
    wallet: str
    side: str            # BUY | SELL
    condition_id: str    # the market
    outcome_index: int   # which outcome they took (aligns with market outcomes)
    outcome: str         # human label ("Yes" / candidate name / ...)
    size: float          # shares
    price: float         # 0..1 (USDC paid per share)
    ts: int              # unix seconds
    title: str = ""


@dataclass
class PolyTrader:
    wallet: str
    name: str
    pnl: float           # lifetime realized P&L in USD (per the leaderboard)


def _get(url: str, params: dict | None = None, retries: int = 3):
    """GET JSON with a browser-ish UA and simple backoff. Raises on failure."""
    if params:
        # repeatable params (lists) -> doseq so condition_ids=a&condition_ids=b
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # transient network / rate limit — back off
            last = e
            time.sleep(2 ** attempt)
    raise last


class PolymarketSource:
    """Read-only Polymarket access. No orders, no money."""

    name = "polymarket"

    def leaderboard(self, window: str = "all", limit: int = 20) -> list[PolyTrader]:
        """Top wallets by realized P&L. `window` in {all, month, week, day}."""
        rows = _get(LB_API + "/profit", {"window": window, "limit": limit})
        if isinstance(rows, dict):  # some hosts wrap in {data: [...]}
            rows = rows.get("data") or rows.get("results") or []
        out = []
        for r in rows:
            w = r.get("proxyWallet") or r.get("wallet")
            if not w:
                continue
            out.append(PolyTrader(
                wallet=w,
                name=r.get("name") or r.get("pseudonym") or w[:10],
                pnl=float(r.get("amount", 0) or 0),
            ))
        return out

    def wallet_trades(self, wallet: str, max_trades: int = 2000) -> list[PolyTrade]:
        """A wallet's trade history, newest first, paginated (page size 500)."""
        out: list[PolyTrade] = []
        offset, page = 0, 500
        while len(out) < max_trades:
            rows = _get(DATA_API + "/trades",
                        {"user": wallet, "limit": page, "offset": offset})
            if isinstance(rows, dict):
                rows = rows.get("data") or rows.get("results") or []
            if not rows:
                break
            for r in rows:
                try:
                    out.append(PolyTrade(
                        wallet=r.get("proxyWallet", wallet),
                        side=(r.get("side") or "").upper(),
                        condition_id=r.get("conditionId", ""),
                        outcome_index=int(r.get("outcomeIndex", -1)),
                        outcome=r.get("outcome", ""),
                        size=float(r.get("size", 0) or 0),
                        price=float(r.get("price", 0) or 0),
                        ts=int(r.get("timestamp", 0) or 0),
                        title=r.get("title", ""),
                    ))
                except (TypeError, ValueError):
                    continue
            if len(rows) < page:
                break  # last page
            offset += page
        return out[:max_trades]

    def resolve_markets(self, condition_ids: list[str]) -> dict[str, dict]:
        """Map conditionId -> {question, closed, winning_index} via Gamma.
        winning_index is None unless the market is closed with a clear winner."""
        out: dict[str, dict] = {}
        uniq = [c for c in dict.fromkeys(condition_ids) if c]
        for i in range(0, len(uniq), 20):  # batch to keep URLs sane
            chunk = uniq[i:i + 20]
            try:
                rows = _get(GAMMA_API + "/markets",
                            {"condition_ids": chunk, "closed": "true",
                             "limit": len(chunk)})
            except Exception:
                log.debug("gamma fetch failed for a chunk", exc_info=True)
                continue
            if isinstance(rows, dict):
                rows = rows.get("data") or rows.get("markets") or []
            for m in rows:
                cid = m.get("conditionId")
                if not cid:
                    continue
                out[cid] = {
                    "question": m.get("question", ""),
                    "closed": bool(m.get("closed")),
                    "winning_index": _winning_index(m),
                }
        return out

    def open_markets(self, max_markets: int = 4000) -> list[dict]:
        """All tradeable (open) markets with their current YES price, deadline,
        and liquidity — the raw material for structural-mispricing scans.
        Ordered by liquidity so the most tradeable markets come first."""
        out: list[dict] = []
        offset, page = 0, 100  # Gamma caps page size at 100
        order = {"order": "liquidityNum", "ascending": "false"}
        while len(out) < max_markets:
            params = {"closed": "false", "active": "true",
                      "limit": page, "offset": offset, **order}
            try:
                rows = _get(GAMMA_API + "/markets", params)
            except Exception:
                if order:  # ordering param may be unsupported — retry without it
                    log.debug("gamma open-markets: dropping order param", exc_info=True)
                    order = {}
                    continue
                log.debug("gamma open-markets page failed at offset %d", offset,
                          exc_info=True)
                break
            if isinstance(rows, dict):
                rows = rows.get("data") or rows.get("markets") or []
            if not rows:
                break  # past the last page
            for m in rows:
                rec = _open_record(m)
                if rec:
                    out.append(rec)
            offset += len(rows)
        return out[:max_markets]

    def price_history(self, token_id: str, fidelity_min: int = 60,
                      interval: str = "max") -> list[tuple[int, float]]:
        """The price tape for one CLOB token: list of (unix_seconds, price),
        oldest first. `fidelity_min` is the bar size in minutes."""
        data = _get(CLOB_API + "/prices-history",
                    {"market": token_id, "interval": interval,
                     "fidelity": fidelity_min})
        hist = data.get("history") if isinstance(data, dict) else data
        out = []
        for pt in hist or []:
            try:
                out.append((int(pt["t"]), float(pt["p"])))
            except (TypeError, ValueError, KeyError):
                continue
        out.sort(key=lambda x: x[0])
        return out

    def current_prices(self, condition_ids) -> dict:
        """Map conditionId -> current YES price (mid for open, 1/0 if resolved).
        Used to mark paper positions to live Polymarket prices."""
        out: dict = {}
        uniq = [c for c in dict.fromkeys(condition_ids) if c]
        for i in range(0, len(uniq), 20):
            chunk = uniq[i:i + 20]
            try:
                rows = _get(GAMMA_API + "/markets",
                            {"condition_ids": chunk, "limit": len(chunk)})
            except Exception:
                continue
            if isinstance(rows, dict):
                rows = rows.get("data") or rows.get("markets") or []
            for m in rows:
                cid = m.get("conditionId")
                if not cid:
                    continue
                rec = _open_record(m)
                if rec:
                    out[cid] = rec["yes"]
                    continue
                try:  # resolved/closed: read the settled YES price (1 or 0)
                    prices = m.get("outcomePrices")
                    outs = m.get("outcomes")
                    prices = json.loads(prices) if isinstance(prices, str) else prices
                    outs = json.loads(outs) if isinstance(outs, str) else outs
                    yi = next((j for j, o in enumerate(outs or [])
                               if str(o).strip().lower() == "yes"), None)
                    if yi is not None and prices:
                        out[cid] = float(prices[yi])
                except (TypeError, ValueError, json.JSONDecodeError, IndexError):
                    pass
        return out

    def resolved_markets(self, after_iso: str, max_markets: int = 60,
                         exclude_crypto: bool = True) -> list[dict]:
        """Resolved yes/no markets that closed on/after `after_iso` (e.g.
        "2026-02-01"). Restricting to AFTER the model's knowledge cutoff keeps
        the calibration test honest — the model can't have memorized outcomes.
        `exclude_crypto` drops token-launch/FDV-valuation markets, which dominate
        the recent feed but are near-unforecastable blind and unrepresentative.
        Returns [{question, outcome(1 if YES won else 0), end, condition_id}]."""
        out: list[dict] = []
        offset, page = 0, 100
        order = {"order": "endDate", "ascending": "false"}
        while len(out) < max_markets and offset < 12000:
            params = {"closed": "true", "limit": page, "offset": offset, **order}
            try:
                rows = _get(GAMMA_API + "/markets", params)
            except Exception:
                if order:
                    order = {}
                    continue
                break
            if isinstance(rows, dict):
                rows = rows.get("data") or rows.get("markets") or []
            if not rows:
                break
            for m in rows:
                rec = _resolved_record(m, after_iso)
                if rec and not (exclude_crypto and _is_crypto_launch(rec["question"])):
                    out.append(rec)
            offset += len(rows)
        return out[:max_markets]


def _open_record(m: dict):
    """Normalize a Gamma open-market row to the fields the scanner needs."""
    q, cid = m.get("question"), m.get("conditionId")
    end = m.get("endDate") or m.get("endDateIso")
    if not (q and cid and end):
        return None
    try:
        outcomes = m.get("outcomes")
        prices = m.get("outcomePrices")
        outcomes = json.loads(outcomes) if isinstance(outcomes, str) else outcomes
        prices = json.loads(prices) if isinstance(prices, str) else prices
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    if not outcomes or not prices:
        return None
    yes_i = next((i for i, o in enumerate(outcomes)
                  if str(o).strip().lower() == "yes"), None)
    if yes_i is None:
        return None
    try:
        yes = float(prices[yes_i])
    except (TypeError, ValueError, IndexError):
        return None
    if not (0.0 < yes < 1.0):  # skip resolved-ish / untraded
        return None
    events = m.get("events") or []
    toks = m.get("clobTokenIds")
    try:
        toks = json.loads(toks) if isinstance(toks, str) else toks
    except (TypeError, ValueError, json.JSONDecodeError):
        toks = None
    yes_token = toks[yes_i] if toks and yes_i < len(toks) else ""
    return {
        "condition_id": cid, "question": q, "yes": yes, "end": str(end),
        "yes_token": yes_token,  # CLOB token id for the YES outcome (price history)
        "liquidity": float(m.get("liquidityNum") or 0),
        "volume": float(m.get("volumeNum") or 0),
        "best_bid": float(m.get("bestBid") or 0),
        "best_ask": float(m.get("bestAsk") or 0),
        "slug": m.get("slug", ""),
        "event_slug": events[0].get("slug", "") if events else "",
    }


_CRYPTO_KEYS = ("fdv", "airdrop", "token launch", "one day after launch",
                "market cap one day", "fully diluted")


def _is_crypto_launch(q: str) -> bool:
    """Token-launch / FDV-valuation markets — unforecastable blind, drop them."""
    ql = q.lower()
    if any(k in ql for k in _CRYPTO_KEYS):
        return True
    return ("fdv above" in ql) or ("launch" in ql and "above $" in ql)


def _resolved_record(m: dict, after_iso: str):
    """A resolved yes/no market on/after after_iso, with the YES outcome (0/1)."""
    q = m.get("question")
    end = m.get("endDate") or m.get("endDateIso")
    cid = m.get("conditionId")
    if not (q and end and cid) or str(end) < after_iso:
        return None
    try:
        outcomes = m.get("outcomes")
        outcomes = json.loads(outcomes) if isinstance(outcomes, str) else outcomes
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    labels = [str(o).strip().lower() for o in (outcomes or [])]
    if sorted(labels) != ["no", "yes"]:  # binary yes/no only
        return None
    wi = _winning_index(m)
    if wi is None or wi >= len(labels):
        return None
    return {"question": q, "outcome": 1 if labels[wi] == "yes" else 0,
            "end": str(end)[:10], "condition_id": cid}


def _winning_index(market: dict):
    """Index of the winning outcome (price == 1) for a closed market, else None."""
    if not market.get("closed"):
        return None
    raw = market.get("outcomePrices")
    try:
        prices = json.loads(raw) if isinstance(raw, str) else raw
        for idx, p in enumerate(prices or []):
            if float(p) >= 0.99:
                return idx
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    return None
