# Whale Engine 🐋

A watch-only signal detector for prediction markets. It ingests market
data, flags whale / smart-money activity, and stores the history so we can
later prove whether those signals had edge.

**Phase 1 (this code): detection only. No money, no trading.**
See [`SPEC.md`](./SPEC.md) for the full vision and roadmap.

## Quick start

No dependencies — stdlib Python 3.10+ only.

### Web dashboard (no terminal-watching needed)

```bash
cd whale-engine

# Start the dashboard + a background watcher, then open the URL in a browser:
python -m whale_engine.cli serve --source synthetic        # offline demo
python -m whale_engine.cli serve --source kalshi            # live public data
#  -> open http://127.0.0.1:8765
```

The page auto-refreshes every few seconds: summary stats, a live feed of
recent signals, and the markets being tracked. `--port`, `--host`, and
`--interval` are configurable; `--no-watch` serves an existing db without
starting a watcher.

### Terminal mode

```bash
# Watch the synthetic simulator and see signals fire (offline, no API):
python -m whale_engine.cli run --source synthetic --cycles 40 --interval 0

# A single live cycle against Kalshi's public API:
python -m whale_engine.cli run --source kalshi --once

# Run continuously against Kalshi (Ctrl-C to stop):
python -m whale_engine.cli run --source kalshi --interval 30
```

Run the tests:

```bash
cd whale-engine
python -m unittest discover -s tests -v
```

## What it detects (v1)

Each detector judges a market against **its own** recent history, so a
"whale" is relative to that market's normal size — not one global number.

| Signal | Icon | Means |
|---|---|---|
| `size_spike`   | 🐋 | One unusually large single trade |
| `volume_surge` | 📈 | A burst of volume in one interval |
| `oi_jump`      | 🧱 | A sharp step up in open interest (new conviction money) |
| `sharp_move`   | ⚡ | Fast repricing within a short window |

Thresholds live in [`config.json`](./config.json) — tune them there.

## How it's wired

```
adapters/ (kalshi, synthetic)  ->  engine (ingest loop)  ->  storage (sqlite)
                                          |
                                          v
                                     detectors  ->  signals  ->  printed + stored
```

- **`models.py`** — normalized schema every adapter maps into.
- **`adapters/`** — `kalshi.py` (live public data), `synthetic.py` (offline demo).
  Polymarket plugs in here in Phase 4.
- **`detectors.py`** — the four v1 detectors, per-market calibrated, with cooldowns.
- **`storage.py`** — SQLite history (snapshots, trades, signals) for backtesting.
- **`engine.py`** — the watch-only poll loop.
- **`web.py`** — the browser dashboard + JSON API (stdlib http.server).
- **`cli.py`** — `python -m whale_engine.cli run|serve ...`

## Notes on Kalshi

- Market & trade reads use the public `trade-api/v2` endpoints and need **no
  API key**. A key is only required for trading, which is out of scope here.
- Prices are normalized from cents (0–100) to implied probability (0.0–1.0).
- Network hiccups degrade gracefully — a failed request logs a warning and the
  loop keeps going.

## What's next (per SPEC.md)

- **Phase 2:** live dashboard ✅ · news enrichment + alerts (next).
- **Phase 3:** paper-trading engine + an edge report graded against real
  market resolutions.
- **Phase 4:** Polymarket adapter for *literal* wallet-level whale tracking.
- **Phase 5+:** live execution — only if the edge is proven first.
