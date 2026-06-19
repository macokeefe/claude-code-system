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
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .storage import Storage

log = logging.getLogger("whale_engine.web")

_ICON = {"size_spike": "🐋", "volume_surge": "📈", "oi_jump": "🧱", "sharp_move": "⚡"}


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
        path = self.path.split("?", 1)[0]
        if path == "/" or path == "/index.html":
            self._send(200, _PAGE.encode("utf-8"), "text/html; charset=utf-8")
        elif path == "/api/state":
            try:
                body = json.dumps(_state(self.db_path)).encode("utf-8")
                self._send(200, body, "application/json")
            except Exception as exc:  # never 500 the page; report cleanly
                log.exception("state failed")
                self._send(500, json.dumps({"error": str(exc)}).encode(), "application/json")
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

  <h2>Recent signals</h2>
  <table>
    <thead><tr><th>Time</th><th>Type</th><th>Market</th><th>Price</th>
      <th>Severity</th><th>Why</th></tr></thead>
    <tbody id="signals"><tr><td class="empty" colspan="6">waiting for data…</td></tr></tbody>
  </table>

  <h2>Markets tracked</h2>
  <table>
    <thead><tr><th>Market</th><th>Price</th><th>Volume</th><th>Open interest</th></tr></thead>
    <tbody id="markets"></tbody>
  </table>
</div>
<script>
const fmtTime = ms => new Date(ms).toLocaleTimeString();
const esc = s => (s ?? "").toString().replace(/[&<>]/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

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
      <tr><td>${fmtTime(s.ts)}</td>
      <td><span class="pill">${s.icon} ${esc(s.type)}</span></td>
      <td>${esc(s.market_id)}<div class="q">${esc(s.question)}</div></td>
      <td>${Math.round(s.price*100)}%</td>
      <td class="sev">${s.severity}×</td>
      <td class="q">${esc(s.reason)}</td></tr>`).join('')
      : '<tr><td class="empty" colspan="6">no signals yet — the watcher is collecting baseline data</td></tr>';

    const mk = d.markets || [];
    document.getElementById('markets').innerHTML = mk.map(m => `
      <tr><td>${esc(m.market_id)}<div class="q">${esc(m.question)}</div></td>
      <td>${Math.round(m.yes_price*100)}%</td>
      <td>${(m.volume||0).toLocaleString()}</td>
      <td>${(m.open_interest||0).toLocaleString()}</td></tr>`).join('');
  } catch (e) {
    document.getElementById('live').textContent = '● disconnected';
  }
}
refresh();
setInterval(refresh, 3000);
</script>
</body>
</html>
"""
