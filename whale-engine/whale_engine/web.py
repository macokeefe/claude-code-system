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
</style>
</head>
<body>
<header>
  <h1>Whale Engine 🐋</h1>
  <span class="tag">watch-only · no trading</span>
  <span class="live" id="live">● connecting…</span>
</header>
<div class="wrap">
  <div class="stats" id="stats"></div>

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
      <table><thead><tr><th>Market</th><th>Side</th><th>$</th><th>Contracts</th></tr></thead>
        <tbody id="biggest-trades"><tr><td class="empty" colspan="4">…</td></tr></tbody></table>
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

async function refreshActivity() {
  try {
    const d = await (await fetch('/api/activity')).json();
    const rt = d.recent_trades || [];
    document.getElementById('recent-trades').innerHTML = rt.length ? rt.map(t => `
      <tr><td>${fmtTime(t.ts)}</td>
      <td>${esc(t.question || t.market_id)}</td>
      <td>${sideBadge(t.taker_side)}</td>
      <td class="money">${tradeDollars(t)}</td></tr>`).join('')
      : '<tr><td class="empty" colspan="4">no trades recorded yet</td></tr>';

    const bt = d.biggest_trades || [];
    document.getElementById('biggest-trades').innerHTML = bt.length ? bt.map(t => `
      <tr><td>${esc(t.question || t.market_id)}</td>
      <td>${sideBadge(t.taker_side)}</td>
      <td class="money">${tradeDollars(t)}</td>
      <td>${(t.count || 0).toLocaleString()}</td></tr>`).join('')
      : '<tr><td class="empty" colspan="4">—</td></tr>';

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

refresh();
setInterval(refresh, 3000);
refreshActivity();
setInterval(refreshActivity, 5000);
</script>
</body>
</html>
"""
