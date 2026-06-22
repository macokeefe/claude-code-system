"""Phase 2 web dashboard — a browser view of the live signal feed.

Stdlib only (http.server). Reads from the same SQLite DB the engine
writes to and serves:
  GET /            -> the dashboard page (auto-refreshes itself)
  GET /api/state   -> JSON: totals, signal counts, recent signals, markets

Each request opens its own short-lived SQLite connection, so it is safe
to run alongside the engine writing from another thread.
"""

from __future__ import annotations

import json
import logging
import time
import urllib.parse
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import explain
from .storage import Storage

log = logging.getLogger("whale_engine.web")

_ICON = {"size_spike": "🐋", "volume_surge": "📈", "oi_jump": "🧱", "sharp_move": "⚡"}
_EXPLAIN_CACHE: dict[str, str] = {}  # AI rundowns, keyed by signal, so re-clicks are free
_ACTIVITY_CACHE: dict = {"ts": 0.0, "data": None}  # short-lived cache for /api/activity


def _state(db_path: str) -> dict:
    store = Storage(db_path)
    try:
        signals = [dict(r) for r in store.recent_signals(60)]
        for s in signals:
            s["icon"] = _ICON.get(s["type"], "•")
        markets = [dict(r) for r in store.latest_markets(50)]
        return {
            "totals": store.totals(),
            "counts": store.signal_counts(),
            "signals": signals,
            "markets": markets,
        }
    finally:
        store.close()


def _activity(db_path: str) -> dict:
    """What the engine is observing right now — even when nothing is a whale:
    a live trade feed, the biggest recent trades, and the top movers. Cached
    a few seconds so multiple browser polls don't hammer the DB."""
    now = time.time()
    if _ACTIVITY_CACHE["data"] is not None and now - _ACTIVITY_CACHE["ts"] < 4:
        return _ACTIVITY_CACHE["data"]

    store = Storage(db_path)
    try:
        markets = [dict(r) for r in store.latest_markets(80)]
        qmap = {m["market_id"]: m.get("question") for m in markets}

        window_ms = 30 * 60 * 1000
        movers = []
        for m in markets:
            rows = store.recent_snapshots(m["market_id"], 40)  # newest-first
            if len(rows) < 2:
                continue
            cur = rows[0]
            past = next((r for r in rows if cur["ts"] - r["ts"] >= window_ms), rows[-1])
            movers.append({
                "market_id": m["market_id"], "question": m.get("question"),
                "price": cur["yes_price"],
                "dprice": cur["yes_price"] - past["yes_price"],
                "dvol": max(cur["volume"] - past["volume"], 0),
            })
        top_movers = sorted(movers, key=lambda x: abs(x["dprice"]), reverse=True)[:8]
        most_active = sorted(movers, key=lambda x: x["dvol"], reverse=True)[:8]

        since = int(now * 1000) - 24 * 3600 * 1000
        biggest = [dict(r) for r in store.biggest_trades(since, 40)]
        recent = [dict(r) for r in store.recent_trades_all(15)]

        # global-feed trades are in markets we don't track — pull their titles
        trade_tickers = {t["market_id"] for t in biggest + recent}
        titles = store.title_map(trade_tickers)

        def dollars(t: dict) -> float:
            # money the taker put up: 'no' trades pay (1 - yes_price)
            p = t.get("price") or 0.0
            c = t.get("count") or 0
            return c * (1 - p) if t.get("taker_side") == "no" else c * p

        for t in biggest + recent:
            t["question"] = (qmap.get(t["market_id"]) or titles.get(t["market_id"])
                             or t["market_id"])
            t["dollars"] = round(dollars(t))
        # rank the candidate pool by actual dollars, keep the real top 10
        biggest.sort(key=lambda t: t["dollars"], reverse=True)
        biggest = biggest[:10]

        data = {
            "top_movers": top_movers,
            "most_active": [m for m in most_active if m["dvol"] > 0],
            "biggest_trades": biggest,
            "recent_trades": recent,
        }
    finally:
        store.close()
    _ACTIVITY_CACHE.update(ts=now, data=data)
    return data


def _explain(db_path: str, market_id: str, ts: int, sig_type: str) -> dict:
    cache_key = f"{market_id}:{ts}:{sig_type}"
    if cache_key in _EXPLAIN_CACHE:
        return {"text": _EXPLAIN_CACHE[cache_key], "cached": True}
    store = Storage(db_path)
    try:
        row = store.get_signal(market_id, ts, sig_type)
        if row is None:
            return {"text": "Signal not found (it may have scrolled out of the recent window)."}
        snaps = [dict(r) for r in store.recent_snapshots(market_id, 12)]
    finally:
        store.close()
    text = explain.explain(dict(row), snaps)
    _EXPLAIN_CACHE[cache_key] = text
    return {"text": text}


PAPER_BANKROLL = 100_000.0  # starting paper cash


def _side_price(yes_price: float, side: str) -> float:
    """Price per contract of the side being bought (YES = p, NO = 1-p)."""
    return yes_price if side == "yes" else 1.0 - yes_price


def _portfolio(store: Storage) -> dict:
    """Mark the whole paper book to live prices: cash, open cash-out value, equity.
    Cash-out value = what you'd get selling every open position now at its current
    price. Equity (estimated value) = cash left + that cash-out value."""
    opens = [dict(r) for r in store.paper_rows("open")]
    closed = [dict(r) for r in store.paper_rows("closed")]
    realized = unrealized = open_cost = open_value = 0.0
    for t in opens:
        yp = store.latest_price(t["market_id"])
        cur = _side_price(yp, t["side"]) if yp is not None else t["entry_price"]
        t["current"] = cur
        t["cost"] = t["contracts"] * t["entry_price"]
        t["value"] = t["contracts"] * cur          # cash-out value now
        t["pnl"] = t["value"] - t["cost"]
        unrealized += t["pnl"]
        open_cost += t["cost"]
        open_value += t["value"]
    for t in closed:
        t["cost"] = t["contracts"] * t["entry_price"]
        exit_p = t["exit_price"] if t["exit_price"] is not None else t["entry_price"]
        t["pnl"] = t["contracts"] * exit_p - t["cost"]
        realized += t["pnl"]
    cash = PAPER_BANKROLL - open_cost + realized
    return {
        "open": opens, "closed": closed,
        "totals": {
            "bankroll": PAPER_BANKROLL, "cash": cash, "open_value": open_value,
            "equity": cash + open_value, "realized": realized,
            "unrealized": unrealized, "total": realized + unrealized,
            "staked": open_cost, "open_count": len(opens),
        },
    }


def process_take_profits(store: Storage) -> int:
    """Auto-close any open position whose side price reached its target_exit
    (the take-profit / 'sell at price' level). Returns how many closed."""
    closed = 0
    for r in store.paper_rows("open"):
        target = r["target_exit"]
        if target is None:
            continue
        yp = store.latest_price(r["market_id"])
        if yp is None:
            continue
        side_now = _side_price(yp, r["side"])
        if side_now >= float(target) - 1e-9:
            store.paper_close(r["id"], side_now)
            closed += 1
    return closed


def _paper_state(db_path: str) -> dict:
    store = Storage(db_path)
    try:
        process_take_profits(store)   # honor take-profits before reporting
        return _portfolio(store)
    finally:
        store.close()


def _paper_open(db_path: str, body: dict) -> dict:
    market_id = (body.get("market_id") or "").strip()
    side = (body.get("side") or "yes").strip().lower()
    contracts = float(body.get("contracts") or 0)
    if not market_id or side not in ("yes", "no") or contracts <= 0:
        return {"error": "need market_id, side (yes/no), and contracts > 0"}
    store = Storage(db_path)
    try:
        yp = store.latest_price(market_id)
        price = body.get("price")
        entry = float(price) if price not in (None, "") else (
            _side_price(yp, side) if yp is not None else None)
        if entry is None or not (0.0 < entry < 1.0):
            return {"error": "no current price for that market — pick a tracked one"}
        cost = contracts * entry
        cash = _portfolio(store)["totals"]["cash"]
        if cost > cash + 1e-6:
            return {"error": f"insufficient cash: need ${cost:,.0f}, have ${cash:,.0f}"}
        target = body.get("target_exit")
        try:
            target = float(target) if target not in (None, "") else None
        except (TypeError, ValueError):
            target = None
        if target is not None and not (entry < target <= 1.0):
            return {"error": f"sell-at price must be above your entry of {entry*100:.0f}¢"}
        tid = store.paper_open(market_id, body.get("question") or market_id,
                               side, contracts, entry, target)
        return {"ok": True, "id": tid, "entry_price": entry, "cash_left": cash - cost}
    finally:
        store.close()


def _paper_close(db_path: str, body: dict) -> dict:
    try:
        tid = int(body.get("id"))
    except (TypeError, ValueError):
        return {"error": "need a numeric trade id"}
    store = Storage(db_path)
    try:
        row = store.paper_one(tid)
        if row is None or row["status"] != "open":
            return {"error": "trade not found or already closed"}
        yp = store.latest_price(row["market_id"])
        exit_p = _side_price(yp, row["side"]) if yp is not None else row["entry_price"]
        store.paper_close(tid, exit_p)
        return {"ok": True, "exit_price": exit_p}
    finally:
        store.close()


def _recommendations(db_path: str) -> dict:
    store = Storage(db_path)
    try:
        return {"recs": [dict(r) for r in store.recommendations("open")]}
    finally:
        store.close()


def _rec_take(db_path: str, body: dict) -> dict:
    """Open the recommended trade as a paper position (with its target exit)."""
    try:
        rid = int(body.get("id"))
    except (TypeError, ValueError):
        return {"error": "need a numeric recommendation id"}
    size = float(body.get("size") or 3000.0)
    store = Storage(db_path)
    try:
        r = store.rec_one(rid)
        if r is None or r["status"] != "open":
            return {"error": "recommendation not found or already actioned"}
        yp = store.latest_price(r["market_id"])
        entry = _side_price(yp, r["side"]) if yp is not None else r["market_price"]
        if entry is None or not (0.0 < entry < 1.0):
            return {"error": "no live price for that market right now"}
        cost = size  # size is in dollars; contracts = size/entry
        cash = _portfolio(store)["totals"]["cash"]
        if cost > cash + 1e-6:
            return {"error": f"insufficient cash: need ${cost:,.0f}, have ${cash:,.0f}"}
        target = r["target_exit"] if (r["target_exit"] and r["target_exit"] > entry) else None
        store.paper_open(r["market_id"], r["question"], r["side"],
                         round(size / entry), entry, target)
        store.set_rec_status(rid, "taken")
        return {"ok": True}
    finally:
        store.close()


def _rec_dismiss(db_path: str, body: dict) -> dict:
    try:
        rid = int(body.get("id"))
    except (TypeError, ValueError):
        return {"error": "need a numeric recommendation id"}
    store = Storage(db_path)
    try:
        store.set_rec_status(rid, "dismissed")
        return {"ok": True}
    finally:
        store.close()


_SCAN = {"running": False, "found": None, "considered": 0, "error": None}


def _scan_start(db_path: str, body: dict) -> dict:
    """Kick off a news-driven trade scan in the background (it takes a minute)."""
    if _SCAN["running"]:
        return {"running": True, "note": "a scan is already in progress"}
    import threading
    from . import scan

    def _go() -> None:
        _SCAN.update(running=True, found=None, error=None)
        try:
            res = scan.find_trades(db_path, limit=int(body.get("limit") or 25),
                                   min_edge=float(body.get("min_edge") or 0.12))
            _SCAN.update(found=res["found"], considered=res["considered"])
        except Exception as exc:
            log.exception("scan failed")
            _SCAN.update(error=str(exc)[:200])
        finally:
            _SCAN["running"] = False

    threading.Thread(target=_go, daemon=True, name="scan").start()
    return {"started": True}


class _Handler(BaseHTTPRequestHandler):
    db_path: str = "whales.db"

    def log_message(self, *_args) -> None:  # quiet default access logging
        pass

    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parts = urllib.parse.urlsplit(self.path)
        path = parts.path
        if path == "/" or path == "/index.html":
            self._send(200, _PAGE.encode("utf-8"), "text/html; charset=utf-8")
        elif path == "/api/state":
            try:
                body = json.dumps(_state(self.db_path)).encode("utf-8")
                self._send(200, body, "application/json")
            except Exception as exc:  # never 500 the page; report cleanly
                log.exception("state failed")
                self._send(500, json.dumps({"error": str(exc)}).encode(), "application/json")
        elif path == "/api/activity":
            try:
                self._send(200, json.dumps(_activity(self.db_path)).encode("utf-8"),
                           "application/json")
            except Exception as exc:
                log.exception("activity failed")
                self._send(500, json.dumps({"error": str(exc)}).encode(), "application/json")
        elif path == "/api/paper":
            try:
                self._send(200, json.dumps(_paper_state(self.db_path)).encode("utf-8"),
                           "application/json")
            except Exception as exc:
                log.exception("paper state failed")
                self._send(500, json.dumps({"error": str(exc)}).encode(), "application/json")
        elif path == "/api/recommendations":
            try:
                self._send(200, json.dumps(_recommendations(self.db_path)).encode("utf-8"),
                           "application/json")
            except Exception as exc:
                log.exception("recommendations failed")
                self._send(500, json.dumps({"error": str(exc)}).encode(), "application/json")
        elif path == "/api/scan/status":
            self._send(200, json.dumps(_SCAN).encode("utf-8"), "application/json")
        elif path == "/api/explain":
            try:
                q = urllib.parse.parse_qs(parts.query)
                result = _explain(
                    self.db_path,
                    q.get("market_id", [""])[0],
                    int(q.get("ts", ["0"])[0] or 0),
                    q.get("type", [""])[0],
                )
                self._send(200, json.dumps(result).encode("utf-8"), "application/json")
            except Exception as exc:
                log.exception("explain failed")
                self._send(500, json.dumps({"text": f"error: {exc}"}).encode(), "application/json")
        else:
            self._send(404, b"not found", "text/plain")

    def do_POST(self) -> None:
        parts = urllib.parse.urlsplit(self.path)
        try:
            length = int(self.headers.get("Content-Length", "0") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._send(400, json.dumps({"error": "bad JSON"}).encode(), "application/json")
            return
        routes = {
            "/api/paper/open": _paper_open,
            "/api/paper/close": _paper_close,
            "/api/recommendations/take": _rec_take,
            "/api/recommendations/dismiss": _rec_dismiss,
            "/api/scan": _scan_start,
        }
        fn = routes.get(parts.path)
        if fn is None:
            self._send(404, b"not found", "text/plain")
            return
        result = fn(self.db_path, body)
        code = 400 if result.get("error") else 200
        self._send(code, json.dumps(result).encode("utf-8"), "application/json")


def serve(db_path: str, host: str = "127.0.0.1", port: int = 8765,
          open_browser: bool = True) -> None:
    handler = partial(_Handler)
    _Handler.db_path = db_path
    httpd = ThreadingHTTPServer((host, port), handler)
    url = f"http://{host}:{port}"
    print(f"\n{'='*54}\n  Dashboard is running — open this in your browser:\n"
          f"    {url}\n  (this terminal will look idle — that's normal; "
          f"Ctrl-C to stop)\n{'='*54}\n")
    if open_browser:
        # Pop the browser automatically, just after the server starts listening.
        import threading
        import webbrowser
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\ndashboard stopped.")
    finally:
        httpd.server_close()


_PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Whale Engine 🐋</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 -apple-system, system-ui, sans-serif;
         background: #0d1117; color: #e6edf3; }
  header { padding: 16px 24px; border-bottom: 1px solid #21262d;
           display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  h1 { font-size: 18px; margin: 0; }
  .tag { font-size: 12px; color: #8b949e; }
  .live { font-size: 12px; color: #3fb950; }
  .wrap { padding: 20px 24px; max-width: 1100px; margin: 0 auto; }
  .stats { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
  .stat { background: #161b22; border: 1px solid #21262d; border-radius: 8px;
          padding: 10px 16px; min-width: 110px; }
  .stat .n { font-size: 22px; font-weight: 600; }
  .stat .l { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: .04em; }
  h2 { font-size: 14px; color: #8b949e; text-transform: uppercase; letter-spacing: .05em;
       margin: 24px 0 10px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #21262d;
           font-variant-numeric: tabular-nums; }
  th { font-size: 11px; color: #8b949e; text-transform: uppercase; }
  tr:hover td { background: #161b22; }
  .sev { color: #f0883e; font-weight: 600; }
  .q { color: #8b949e; font-size: 12px; }
  .empty { color: #8b949e; padding: 16px 0; }
  .pill { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: #21262d; }
  code { background: #161b22; padding: 1px 5px; border-radius: 4px; }
  .money { font-weight: 600; color: #e6edf3; }
  .side { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
  .side.buy { background: #1b3a26; color: #3fb950; }
  .side.sell { background: #3a1d1d; color: #f85149; }
  .side.flat { background: #21262d; color: #8b949e; }
  .legend { background: #161b22; border: 1px solid #21262d; border-radius: 8px;
            padding: 8px 14px; margin-bottom: 18px; font-size: 13px; }
  .legend summary { cursor: pointer; color: #58a6ff; }
  .legend ul { margin: 10px 0 4px; padding-left: 18px; }
  .legend li { margin: 4px 0; color: #c9d1d9; }
  .cap { font-size: 12px; color: #8b949e; margin: -4px 0 8px; }
  h3 { font-size: 12px; color: #8b949e; text-transform: uppercase; letter-spacing: .05em;
       margin: 18px 0 6px; }
  .act-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  @media (max-width: 820px) { .act-grid { grid-template-columns: 1fr; } }
  .up { color: #3fb950; } .down { color: #f85149; }
  #biggest-trades tr, #recent-trades tr { cursor: pointer; }
  #biggest-trades tr:hover td, #recent-trades tr:hover td { background: #1c2333; }
  .tabs { display: flex; gap: 8px; margin: 8px 0 6px; }
  .tab { background: #161b22; border: 1px solid #21262d; color: #8b949e;
         padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; }
  .tab.active { background: #1f6feb; border-color: #1f6feb; color: #fff; }
  .soon { color: #f0883e; font-weight: 600; }
  #signals tr { cursor: pointer; }
  #signals tr:hover td { background: #1c2333; }
  .ask { font-size: 11px; color: #58a6ff; }
  .modal { position: fixed; inset: 0; background: rgba(0,0,0,.6);
           display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
  .modal.hidden { display: none; }
  .modal-card { background: #161b22; border: 1px solid #30363d; border-radius: 12px;
                max-width: 640px; width: 100%; max-height: 85vh; overflow: auto; }
  .modal-head { display: flex; justify-content: space-between; align-items: flex-start;
                gap: 12px; padding: 16px 18px; border-bottom: 1px solid #21262d; }
  .modal-head b { font-size: 15px; }
  .modal-head button { background: none; border: none; color: #8b949e; font-size: 18px; cursor: pointer; }
  .modal-body { padding: 16px 18px; white-space: pre-wrap; line-height: 1.6; }
  .modal-body.loading { color: #8b949e; }
  .viewnav { display: flex; gap: 6px; }
  .vbtn { background: #161b22; border: 1px solid #21262d; color: #8b949e;
          padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 13px; }
  .vbtn.active { background: #1f6feb; border-color: #1f6feb; color: #fff; }
  .hidden { display: none; }
  .pform { display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
           background: #161b22; border: 1px solid #21262d; border-radius: 10px;
           padding: 14px; margin-bottom: 6px; }
  .pform select, .pform input { background: #0d1117; border: 1px solid #30363d;
           color: #e6edf3; border-radius: 8px; padding: 8px 10px; font: inherit; }
  .pform select { min-width: 280px; max-width: 440px; }
  .pform input { width: 120px; }
  .seg { display: flex; }
  .segbtn { background: #0d1117; border: 1px solid #30363d; color: #8b949e;
            padding: 8px 14px; cursor: pointer; font-weight: 600; }
  .segbtn:first-child { border-radius: 8px 0 0 8px; }
  .segbtn:last-child { border-radius: 0 8px 8px 0; border-left: none; }
  .segbtn.active { background: #1f6feb; border-color: #1f6feb; color: #fff; }
  .phint { color: #8b949e; font-size: 13px; }
  button.primary { background: #238636; border: 1px solid #2ea043; color: #fff;
            padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; }
  button.primary:hover { background: #2ea043; }
  .perr { color: #f85149; font-size: 13px; min-height: 18px; margin: 4px 0 10px; }
  .closebtn { background: #21262d; border: 1px solid #30363d; color: #e6edf3;
            padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }
  .pnl-pos { color: #3fb950; font-weight: 600; }
  .pnl-neg { color: #f85149; font-weight: 600; }
  .rec { background: #161b22; border: 1px solid #21262d; border-left: 3px solid #1f6feb;
         border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
  .rec .top { display: flex; justify-content: space-between; align-items: flex-start;
              gap: 12px; flex-wrap: wrap; }
  .rec .act { font-weight: 700; }
  .rec .edge { font-size: 12px; color: #3fb950; font-weight: 600; white-space: nowrap; }
  .rec .why { color: #c9d1d9; font-size: 13px; margin: 8px 0; line-height: 1.5; }
  .rec .meta { font-size: 12px; color: #8b949e; margin-top: 2px; }
  .rec .btns { display: flex; gap: 8px; margin-top: 10px; }
  .rec .take { background: #238636; border: 1px solid #2ea043; color: #fff;
               padding: 6px 12px; border-radius: 7px; cursor: pointer; font-weight: 600; }
  .rec .take:hover { background: #2ea043; }
  .rec .dismiss { background: #21262d; border: 1px solid #30363d; color: #8b949e;
                  padding: 6px 12px; border-radius: 7px; cursor: pointer; }
  /* divergence bar: where the market prices it vs the grounded fair value */
  .divbar { position: relative; height: 30px; background: #0d1117;
            border: 1px solid #30363d; border-radius: 6px; margin: 10px 0 4px; }
  .divbar .fill { position: absolute; top: 0; bottom: 0; background: rgba(63,185,80,.22); }
  .divbar .mk { position: absolute; top: -3px; bottom: -3px; width: 2px; background: #8b949e; }
  .divbar .fv { position: absolute; top: -3px; bottom: -3px; width: 2px; background: #3fb950; }
  .divbar .lbl { position: absolute; top: 50%; transform: translate(-50%,-50%);
                 font-size: 10px; white-space: nowrap; padding: 1px 4px; border-radius: 4px;
                 background: #161b22; }
  .divbar .lbl.fvl { color: #3fb950; } .divbar .lbl.mkl { color: #c9d1d9; }
  .plive { background: #161b22; border: 1px solid #21262d; border-radius: 8px;
           padding: 8px 12px; margin: 4px 0 8px; font-size: 13px; }
  .plive .px { font-weight: 600; } .plive .live-dot { color: #3fb950; font-size: 11px; }
  .scanbtn { background: #1f6feb; border: 1px solid #1f6feb; color: #fff;
             padding: 5px 12px; border-radius: 7px; cursor: pointer; font-size: 13px;
             margin-left: 8px; text-transform: none; letter-spacing: 0; }
  .scanbtn:disabled { opacity: .6; cursor: default; }
  .scanstatus { font-size: 12px; color: #8b949e; margin-left: 8px; text-transform: none; }
  .venue { font-size: 10px; padding: 1px 6px; border-radius: 8px; margin-left: 6px;
           vertical-align: middle; }
  .venue.poly { background: #2b2150; color: #b39cff; }
  .venue.kalshi { background: #103a2a; color: #56d4a0; }
</style>
</head>
<body>
<header>
  <h1>Whale Engine 🐋</h1>
  <span class="tag">paper only · no real money</span>
  <nav class="viewnav">
    <button class="vbtn active" data-view="monitor">📊 Monitor</button>
    <button class="vbtn" data-view="paper">📝 Paper trading</button>
  </nav>
  <span class="live" id="live">● connecting…</span>
</header>
<div class="wrap" id="view-monitor">
  <div class="stats" id="stats"></div>

  <h2>Recommended trades
    <button class="scanbtn" id="scanbtn" onclick="runScan()">🔎 Scan for trades</button>
    <span class="scanstatus" id="scanstatus"></span></h2>
  <div class="cap">Each is the analyst's news-grounded read diverging from the market price.
    Hit <b>Scan</b> to search breaking articles for fresh mispricings. Review the evidence and
    target, then one-click into the $100k paper book. (Hypotheses graded forward — not guarantees.)</div>
  <div id="recs"><div class="empty">no live recommendations yet — run the prototype scan to generate some</div></div>

  <details class="legend">
    <summary>What am I looking at?</summary>
    <ul>
      <li>🐋 <b>Big single trade</b> — one large order hit a market.</li>
      <li>📈 <b>Volume spike</b> — a burst of trading in a short window.</li>
      <li>🧱 <b>New positions</b> — open interest jumped: fresh money entered (not just reshuffling).</li>
      <li>⚡ <b>Price jump</b> — the odds moved sharply within minutes.</li>
      <li><b>$ Size</b> — approximate money involved (contracts × price). Each contract pays $1 if it happens.</li>
      <li><b>Open interest</b> — how many live positions are held in a market right now.</li>
      <li><b>vs normal</b> — how much bigger than that market's usual activity (3× = three times normal).</li>
    </ul>
  </details>

  <h2>Live activity <span class="ask">— what the engine is recording right now</span></h2>
  <div class="cap">Even when nothing crosses the whale bar, this is the flow it's measuring and storing.</div>
  <div class="act-grid">
    <div>
      <h3>Recent trades</h3>
      <table><thead><tr><th>Time</th><th>Market</th><th>Side</th><th>$</th></tr></thead>
        <tbody id="recent-trades"><tr><td class="empty" colspan="4">…</td></tr></tbody></table>
    </div>
    <div>
      <h3>Biggest trades (this session, by $)</h3>
      <table><thead><tr><th>Market</th><th>Side</th><th>Price</th><th>$</th><th>Contracts</th></tr></thead>
        <tbody id="biggest-trades"><tr><td class="empty" colspan="5">…</td></tr></tbody></table>
    </div>
  </div>
  <h3>Top movers (last ~30 min)</h3>
  <table><thead><tr><th>Market</th><th>Chance</th><th>Δ price</th><th>Δ volume</th></tr></thead>
    <tbody id="top-movers"><tr><td class="empty" colspan="4">…</td></tr></tbody></table>

  <h2>Recent signals <span class="ask">— click any row for an AI rundown</span></h2>
  <table>
    <thead><tr><th>Time</th><th>Signal</th><th>Market</th><th>Side</th>
      <th>$ Size</th><th>vs normal</th><th>Detail</th></tr></thead>
    <tbody id="signals"><tr><td class="empty" colspan="7">waiting for data…</td></tr></tbody>
  </table>

  <h2>Markets tracked</h2>
  <div class="tabs">
    <button class="tab active" data-tab="all" id="tab-all">All markets</button>
    <button class="tab" data-tab="soon" id="tab-soon">Closing soon</button>
  </div>
  <div class="cap">Chance = market's estimated probability · Volume = total contracts ever
    traded · Open interest = live positions held now · Closes = time until the market resolves</div>
  <table>
    <thead><tr><th>Market</th><th>Chance</th><th>Volume</th>
      <th>Open interest</th><th>Closes</th></tr></thead>
    <tbody id="markets"></tbody>
  </table>
</div>

<div class="wrap hidden" id="view-paper">
  <h2>Paper trading <span class="ask">— practice positions, no real money</span></h2>
  <div class="cap">Open at the market's current price; positions mark to the live price as it moves.
    This is where a strategy runs once it's proven — before any real capital.</div>
  <div class="stats" id="paper-stats"></div>
  <div class="pform">
    <select id="p-market"><option>loading markets…</option></select>
    <div class="seg">
      <button id="p-yes" class="segbtn active" type="button" onclick="setSide('yes')">YES</button>
      <button id="p-no" class="segbtn" type="button" onclick="setSide('no')">NO</button>
    </div>
    <input id="p-contracts" type="number" min="1" step="1" value="100" title="contracts">
    <input id="p-target" type="number" min="1" max="99" step="1" placeholder="sell at ¢ (optional)"
           title="auto-close when this side reaches this price">
    <span class="phint" id="p-hint">—</span>
    <button class="primary" type="button" onclick="openPaper()">Open paper trade</button>
  </div>
  <div class="plive" id="p-live">select a market to see its live price</div>
  <div class="perr" id="p-err"></div>
  <h3>Open positions</h3>
  <table><thead><tr><th>Market</th><th>Side</th><th>Contracts</th><th>Entry</th>
    <th>Now</th><th>Sell at</th><th>P&amp;L</th><th></th></tr></thead>
    <tbody id="paper-open"><tr><td class="empty" colspan="8">no open positions</td></tr></tbody></table>
  <h3>Closed</h3>
  <table><thead><tr><th>Market</th><th>Side</th><th>Contracts</th><th>Entry</th>
    <th>Exit</th><th>P&amp;L</th></tr></thead>
    <tbody id="paper-closed"><tr><td class="empty" colspan="6">none yet</td></tr></tbody></table>
</div>

<div id="modal" class="modal hidden" onclick="if(event.target===this)closeModal()">
  <div class="modal-card">
    <div class="modal-head">
      <b id="modal-title"></b>
      <button onclick="closeModal()" aria-label="close">✕</button>
    </div>
    <div id="modal-body" class="modal-body"></div>
  </div>
</div>
<script>
const fmtTime = ms => new Date(ms).toLocaleTimeString();
const esc = s => (s ?? "").toString().replace(/[&<>]/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const LABEL = {size_spike:'🐋 Big trade', volume_surge:'📈 Volume spike',
               oi_jump:'🧱 New positions', sharp_move:'⚡ Price jump'};
const money = n => n ? '$' + Math.round(n).toLocaleString() : '—';
function sideBadge(side) {
  if (!side) return '';
  const buy = ['yes','added','up'], sell = ['no','closed','down'];
  const cls = buy.includes(side) ? 'buy' : sell.includes(side) ? 'sell' : 'flat';
  return `<span class="side ${cls}">${esc(side)}</span>`;
}
function fmtCloses(ms) {
  if (!ms) return '<span class="q">—</span>';
  const d = ms - Date.now();
  if (d <= 0) return '<span class="soon">closing</span>';
  const h = d / 3600000;
  let txt = h < 1 ? 'in ' + Math.round(d/60000) + 'm'
          : h < 48 ? 'in ' + Math.round(h) + 'h'
          : 'in ' + Math.round(h/24) + 'd';
  return h < 72 ? `<span class="soon">${txt}</span>` : `<span class="q">${txt}</span>`;
}

let MARKETS = [], TAB = 'all';
function renderMarkets() {
  let rows = MARKETS.slice();
  if (TAB === 'soon') {
    const horizon = Date.now() + 7 * 86400000;
    rows = rows.filter(m => m.close_ts > 0 && m.close_ts <= horizon)
               .sort((a, b) => a.close_ts - b.close_ts);
  }
  document.getElementById('markets').innerHTML = rows.length ? rows.map(m => `
    <tr><td><b>${esc(m.question || m.market_id)}</b><div class="q">${esc(m.market_id)}</div></td>
    <td>${Math.round(m.yes_price*100)}%</td>
    <td>${(m.volume||0).toLocaleString()}</td>
    <td>${(m.open_interest||0).toLocaleString()}</td>
    <td>${fmtCloses(m.close_ts)}</td></tr>`).join('')
    : `<tr><td class="empty" colspan="5">${TAB === 'soon'
        ? 'no tracked markets close within 7 days yet'
        : 'no markets yet'}</td></tr>`;
}
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  TAB = b.dataset.tab;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
  renderMarkets();
});

async function refresh() {
  try {
    const r = await fetch('/api/state');
    const d = await r.json();
    document.getElementById('live').textContent = '● live · ' + new Date().toLocaleTimeString();

    const t = d.totals || {}, c = d.counts || {};
    document.getElementById('stats').innerHTML = [
      ['Markets', t.markets||0], ['Trades', t.trades||0], ['Signals', t.signals||0],
      ['🐋 size', c.size_spike||0], ['📈 volume', c.volume_surge||0],
      ['🧱 OI', c.oi_jump||0], ['⚡ move', c.sharp_move||0],
    ].map(([l,n]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');

    const sig = d.signals || [];
    document.getElementById('signals').innerHTML = sig.length ? sig.map(s => `
      <tr data-market="${esc(s.market_id)}" data-ts="${s.ts}" data-type="${esc(s.type)}"
          data-q="${esc(s.question || s.market_id)}" onclick="explainSignal(this)"><td>${fmtTime(s.ts)}</td>
      <td>${LABEL[s.type] || esc(s.type)}</td>
      <td><b>${esc(s.question || s.market_id)}</b>
          <div class="q">${esc(s.market_id)} · ${Math.round(s.price*100)}% chance</div></td>
      <td>${sideBadge(s.side)}</td>
      <td class="money">${money(s.notional)}${s.contracts ?
          `<div class="q">${Math.round(s.contracts).toLocaleString()} contracts</div>` : ''}</td>
      <td class="sev">${s.severity ? s.severity + '×' : '—'}</td>
      <td class="q">${esc(s.reason)}</td></tr>`).join('')
      : '<tr><td class="empty" colspan="7">no signals yet — the watcher is learning each market\\'s normal first</td></tr>';

    MARKETS = d.markets || [];
    const soonCount = MARKETS.filter(m =>
      m.close_ts > 0 && m.close_ts <= Date.now() + 7*86400000).length;
    document.getElementById('tab-soon').textContent = `Closing soon (${soonCount})`;
    renderMarkets();
  } catch (e) {
    document.getElementById('live').textContent = '● disconnected';
  }
}
function pts(d) {
  const v = Math.round((d || 0) * 100);
  if (v === 0) return '0';
  return `<span class="${v > 0 ? 'up' : 'down'}">${v > 0 ? '+' : ''}${v} pts</span>`;
}
function tradeDollars(t) { return money(t.dollars || 0); }
function execPrice(t) { const p = t.price || 0; return t.taker_side === 'no' ? 1 - p : p; }

let ACT = {};
function showTrade(list, i) {
  const t = (ACT[list] || [])[i];
  if (!t) return;
  const side = t.taker_side === 'no' ? 'NO' : (t.taker_side === 'yes' ? 'YES' : '?');
  document.getElementById('modal-title').textContent = t.question || t.market_id;
  const b = document.getElementById('modal-body');
  b.className = 'modal-body';
  b.innerHTML = `
    <div style="font-size:16px;margin-bottom:10px;"><b>Bought ${side}</b>
      @ ${Math.round(execPrice(t) * 100)}¢ per contract</div>
    <div>Size: <b>${(t.count || 0).toLocaleString()}</b> contracts (~${money(t.dollars || 0)})</div>
    <div>Time: ${new Date(t.ts).toLocaleString()}</div>
    <div class="q" style="margin-top:10px;">Market ticker: ${esc(t.market_id)}</div>
    <div class="q">Market's YES price at the time: ${Math.round((t.price || 0) * 100)}%</div>`;
  document.getElementById('modal').classList.remove('hidden');
}

async function refreshActivity() {
  try {
    const d = await (await fetch('/api/activity')).json();
    ACT = d;
    const rt = d.recent_trades || [];
    document.getElementById('recent-trades').innerHTML = rt.length ? rt.map((t, i) => `
      <tr onclick="showTrade('recent_trades', ${i})"><td>${fmtTime(t.ts)}</td>
      <td>${esc(t.question || t.market_id)}</td>
      <td>${sideBadge(t.taker_side)}</td>
      <td class="money">${tradeDollars(t)}</td></tr>`).join('')
      : '<tr><td class="empty" colspan="4">no trades recorded yet</td></tr>';

    const bt = d.biggest_trades || [];
    document.getElementById('biggest-trades').innerHTML = bt.length ? bt.map((t, i) => `
      <tr onclick="showTrade('biggest_trades', ${i})"><td>${esc(t.question || t.market_id)}</td>
      <td>${sideBadge(t.taker_side)}</td>
      <td>${Math.round(execPrice(t) * 100)}¢</td>
      <td class="money">${tradeDollars(t)}</td>
      <td>${(t.count || 0).toLocaleString()}</td></tr>`).join('')
      : '<tr><td class="empty" colspan="5">—</td></tr>';

    const tm = d.top_movers || [];
    document.getElementById('top-movers').innerHTML = tm.length ? tm.map(m => `
      <tr><td><b>${esc(m.question || m.market_id)}</b><div class="q">${esc(m.market_id)}</div></td>
      <td>${Math.round(m.price * 100)}%</td>
      <td>${pts(m.dprice)}</td>
      <td>${(m.dvol || 0).toLocaleString()}</td></tr>`).join('')
      : '<tr><td class="empty" colspan="4">building history…</td></tr>';
  } catch (e) { /* leave last values on screen */ }
}

function closeModal() { document.getElementById('modal').classList.add('hidden'); }

async function explainSignal(row) {
  const m = row.dataset.market, ts = row.dataset.ts, type = row.dataset.type;
  document.getElementById('modal-title').textContent = row.dataset.q;
  const body = document.getElementById('modal-body');
  body.className = 'modal-body loading';
  body.textContent = 'Analyzing this signal…';
  document.getElementById('modal').classList.remove('hidden');
  try {
    const r = await fetch(`/api/explain?market_id=${encodeURIComponent(m)}`
      + `&ts=${encodeURIComponent(ts)}&type=${encodeURIComponent(type)}`);
    const d = await r.json();
    body.className = 'modal-body';
    body.textContent = d.text || '(no explanation)';
  } catch (e) {
    body.className = 'modal-body';
    body.textContent = 'Could not load explanation: ' + e;
  }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ---- paper trading ----
let SIDE = 'yes';
const pnlCls = v => v >= 0 ? 'pnl-pos' : 'pnl-neg';
const signed = v => (v >= 0 ? '+' : '−') + '$' + Math.abs(Math.round(v)).toLocaleString();
function paperVisible() { return !document.getElementById('view-paper').classList.contains('hidden'); }
function selectedMarket() {
  const id = document.getElementById('p-market').value;
  return MARKETS.find(x => x.market_id === id) || null;
}
function setSide(s) {
  SIDE = s;
  document.getElementById('p-yes').classList.toggle('active', s === 'yes');
  document.getElementById('p-no').classList.toggle('active', s === 'no');
  updatePaperLive();
}
const venue = id => String(id).startsWith('0x') ? 'Polymarket' : 'Kalshi';
const venueBadge = id => `<span class="venue ${venue(id) === 'Polymarket' ? 'poly' : 'kalshi'}">${venue(id)}</span>`;
async function runScan() {
  const btn = document.getElementById('scanbtn'), st = document.getElementById('scanstatus');
  btn.disabled = true; st.textContent = 'scanning breaking news… (~1 min)';
  try {
    await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 25 }) });
  } catch (e) {}
  pollScan();
}
async function pollScan() {
  const btn = document.getElementById('scanbtn'), st = document.getElementById('scanstatus');
  try {
    const s = await (await fetch('/api/scan/status')).json();
    if (s.running) { st.textContent = 'scanning breaking news…'; btn.disabled = true;
      setTimeout(pollScan, 2000); return; }
    btn.disabled = false;
    st.textContent = s.error ? ('scan error: ' + s.error)
      : (s.found != null ? `found ${s.found} of ${s.considered} markets with a news edge` : '');
    refreshRecs();
  } catch (e) { btn.disabled = false; }
}
function divBar(mkt, fair) {
  const lo = Math.min(mkt, fair) * 100, hi = Math.max(mkt, fair) * 100;
  return `<div class="divbar">
    <div class="fill" style="left:${lo}%;width:${hi - lo}%"></div>
    <div class="mk" style="left:${mkt * 100}%"></div>
    <div class="fv" style="left:${fair * 100}%"></div>
    <div class="lbl mkl" style="left:${Math.max(8, mkt * 100)}%">mkt ${Math.round(mkt * 100)}¢</div>
    <div class="lbl fvl" style="left:${Math.min(92, fair * 100)}%">fair ${Math.round(fair * 100)}¢</div>
  </div>`;
}
function updateHint() {
  const m = selectedMarket();
  const c = parseFloat(document.getElementById('p-contracts').value || '0');
  const hint = document.getElementById('p-hint');
  if (!m) { hint.textContent = '—'; return; }
  const sp = SIDE === 'yes' ? m.yes_price : 1 - m.yes_price;
  hint.textContent = `buy ${SIDE.toUpperCase()} @ ${Math.round(sp * 100)}¢ · cost ≈ ${money(c * sp)}`;
}
function updatePaperLive() {
  const m = selectedMarket(), live = document.getElementById('p-live');
  if (!m) { live.textContent = 'select a market to see its live price'; updateHint(); return; }
  const yes = Math.round(m.yes_price * 100);
  live.innerHTML = `<b>${esc((m.question || m.market_id)).slice(0, 76)}</b>${venueBadge(m.market_id)}<br>`
    + `YES <span class="px">${yes}¢</span> &nbsp; NO <span class="px">${100 - yes}¢</span> `
    + `&nbsp;<span class="live-dot">● live</span>`;
  updateHint();
}
function populateMarketSelect() {
  const sel = document.getElementById('p-market'), prev = sel.value;
  sel.innerHTML = (MARKETS || []).map(m =>
    `<option value="${esc(m.market_id)}">${esc((m.question || m.market_id)).slice(0, 90)}</option>`
  ).join('') || '<option>no markets yet</option>';
  if (prev) sel.value = prev;
  updatePaperLive();
}
async function openPaper() {
  const m = selectedMarket();
  const contracts = parseFloat(document.getElementById('p-contracts').value || '0');
  const tv = parseFloat(document.getElementById('p-target').value || '0');
  const target = tv > 0 ? tv / 100 : null;   // ¢ -> side price
  const err = document.getElementById('p-err'); err.textContent = '';
  if (!m || contracts <= 0) { err.textContent = 'pick a market and enter contracts'; return; }
  const r = await fetch('/api/paper/open', { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ market_id: m.market_id, question: m.question, side: SIDE,
                           contracts, target_exit: target }) });
  const d = await r.json();
  if (d.error) { err.textContent = d.error; return; }
  document.getElementById('p-target').value = '';
  refreshPaper();
}
async function refreshRecs() {
  try {
    const recs = ((await (await fetch('/api/recommendations')).json()).recs) || [];
    document.getElementById('recs').innerHTML = recs.length ? recs.map(r => `
      <div class="rec">
        <div class="top">
          <div><span class="act ${r.side === 'yes' ? 'up' : 'down'}">BUY ${esc(r.side.toUpperCase())}</span>
            ${venueBadge(r.market_id)}&nbsp;${esc(r.question)}</div>
          <div class="edge">edge ${Math.round(r.edge * 100)} pts</div>
        </div>
        <div class="meta">market ${Math.round(r.market_price * 100)}¢ · fair value
          ${Math.round(r.model_price * 100)}¢ · target cash-out
          <b>${Math.round(r.target_exit * 100)}¢</b></div>
        ${divBar(r.market_price, r.model_price)}
        <div class="why">${esc(r.reason)}</div>
        <div class="btns">
          <button class="take" onclick="takeRec(${r.id})">Paper trade this ($3k)</button>
          <button class="dismiss" onclick="dismissRec(${r.id})">Dismiss</button>
        </div>
      </div>`).join('')
      : '<div class="empty">no live recommendations yet — run the prototype scan to generate some</div>';
  } catch (e) { /* keep last */ }
}
async function takeRec(id) {
  await fetch('/api/recommendations/take', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, size: 3000 }) });
  refreshRecs(); refreshPaper();
}
async function dismissRec(id) {
  await fetch('/api/recommendations/dismiss', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
  refreshRecs();
}
async function closePaper(tid) {
  await fetch('/api/paper/close', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: tid }) });
  refreshPaper();
}
async function refreshPaper() {
  try {
    const d = await (await fetch('/api/paper')).json();
    const t = d.totals || {};
    const eqCls = (t.equity || 0) >= (t.bankroll || 100000) ? 'pnl-pos' : 'pnl-neg';
    document.getElementById('paper-stats').innerHTML = [
      ['Estimated value', money(t.equity || 0), eqCls],
      ['Cash available', money(t.cash || 0), ''],
      ['Open positions value', money(t.open_value || 0), ''],
      ['Open positions', (t.open_count || 0), ''],
      ['Total P&L', signed(t.total || 0), pnlCls(t.total || 0)],
    ].map(([l, n, cls]) => `<div class="stat"><div class="n ${cls}">${n}</div><div class="l">${l}</div></div>`).join('');
    const op = d.open || [];
    document.getElementById('paper-open').innerHTML = op.length ? op.map(t => `
      <tr><td><b>${esc(t.question || t.market_id)}</b>${venueBadge(t.market_id)}<div class="q">${esc(t.market_id)}</div></td>
      <td>${sideBadge(t.side)}</td><td>${Math.round(t.contracts).toLocaleString()}</td>
      <td>${Math.round(t.entry_price * 100)}¢</td><td>${Math.round(t.current * 100)}¢</td>
      <td>${t.target_exit != null ? '<span class="up">' + Math.round(t.target_exit * 100) + '¢</span>' : '<span class="q">—</span>'}</td>
      <td class="${pnlCls(t.pnl)}">${signed(t.pnl)}</td>
      <td><button class="closebtn" onclick="closePaper(${t.id})">Close</button></td></tr>`).join('')
      : '<tr><td class="empty" colspan="8">no open positions — open one above</td></tr>';
    const cl = d.closed || [];
    document.getElementById('paper-closed').innerHTML = cl.length ? cl.map(t => `
      <tr><td><b>${esc(t.question || t.market_id)}</b><div class="q">${esc(t.market_id)}</div></td>
      <td>${sideBadge(t.side)}</td><td>${Math.round(t.contracts).toLocaleString()}</td>
      <td>${Math.round(t.entry_price * 100)}¢</td>
      <td>${t.exit_price != null ? Math.round(t.exit_price * 100) + '¢' : '—'}</td>
      <td class="${pnlCls(t.pnl)}">${signed(t.pnl)}</td></tr>`).join('')
      : '<tr><td class="empty" colspan="6">none yet</td></tr>';
  } catch (e) { /* keep last values */ }
}
document.querySelectorAll('.vbtn').forEach(b => b.onclick = () => {
  const v = b.dataset.view;
  document.querySelectorAll('.vbtn').forEach(x => x.classList.toggle('active', x === b));
  document.getElementById('view-monitor').classList.toggle('hidden', v !== 'monitor');
  document.getElementById('view-paper').classList.toggle('hidden', v !== 'paper');
  if (v === 'paper') { populateMarketSelect(); refreshPaper(); }
});
document.getElementById('p-contracts').addEventListener('input', updateHint);
document.getElementById('p-market').addEventListener('change', updatePaperLive);
setInterval(() => { if (paperVisible()) updatePaperLive(); }, 2000);

refresh();
setInterval(refresh, 3000);
refreshActivity();
setInterval(refreshActivity, 5000);
refreshRecs();
setInterval(refreshRecs, 6000);
pollScan();
setInterval(() => { if (paperVisible()) refreshPaper(); }, 2000);
</script>
</body>
</html>
"""
