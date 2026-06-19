# Whale Engine — Spec & Roadmap

> A signal-detection system that watches prediction markets (Kalshi first,
> Polymarket next) for "whale" / smart-money activity, enriches it with news,
> paper-trades the signals to measure edge, and is architected to grow into a
> self-funding research-and-execution engine.

**Status:** Draft v0.1 — planning only, no code yet.
**Decisions locked in:** Both platforms (Kalshi first) · Detect + paper-trade (no real money yet) · Spec before build.

---

## 1. The vision, stated plainly

Start small with a *seed*: a service that detects unusual large-money activity on
Kalshi and tells you about it. That seed is deliberately built as the first
module of a larger flywheel:

```
   data + news  ──►  signal detection  ──►  paper trades  ──►  measured edge
        ▲                                                            │
        │                                                            ▼
   fund more  ◄──  reinvest returns  ◄──  (only once edge is proven) live trading
   data/compute
```

The honest framing: **the infrastructure is buildable and we can start now. The
trading *edge* is the hard, unguaranteed part.** So the system is designed to
*watch and prove* before it ever *risks money*. "Self-funding" is the
end-state, not the starting assumption.

---

## 2. Reality check on "whale tracking"

Different markets expose different things. This shapes the whole design.

| Platform | Whale visibility | What we can actually detect |
|---|---|---|
| **Kalshi** (CFTC-regulated) | Anonymous. No wallets/identities. | *Inferred* whales: large single orders, volume & open-interest spikes vs baseline, order-book imbalance, sharp aggressive price moves. |
| **Polymarket** (on-chain) | Wallets are public. | *Literal* whales: track specific addresses, smart-money leaderboards, copy-trade signals, position changes per wallet. |

**Implication:** On Kalshi, "whale" = behavioral inference from the tape. For
literal wallet-level whale tracking, Polymarket is the better source. The
architecture treats each platform as a pluggable **adapter** feeding a common
signal pipeline, so "who" (Polymarket) and "clean regulated execution" (Kalshi)
can coexist later.

---

## 3. Scope

### In scope (Phase 1–3)
- Kalshi market/trade/order-book ingestion (public API)
- Anomaly/"whale" signal detection
- News enrichment for flagged markets
- Persistent history (so signals can be backtested)
- Paper-trading engine + hypothetical P&L tracking
- Dashboard + alerts
- Polymarket adapter (wallet-level whales) added behind the same pipeline

### Explicitly OUT of scope (for now)
- Any real-money / live trading. Gated behind proven paper-trading edge.
- Anything that violates a platform's API terms of service.
- "Fully autonomous self-improving AI." We build a disciplined pipeline a human
  reviews; autonomy is added incrementally and only where it's earned.

---

## 4. Architecture

```
┌─────────────┐   ┌─────────────┐
│ Kalshi      │   │ Polymarket  │   ← Source Adapters (pluggable)
│ adapter     │   │ adapter     │     normalize to a common schema
└──────┬──────┘   └──────┬──────┘
       └────────┬────────┘
                ▼
        ┌───────────────┐
        │  Ingestion    │  poll/stream → raw events → time-series store
        └───────┬───────┘
                ▼
        ┌───────────────┐      ┌──────────────┐
        │ Signal engine │◄─────│ News enricher │ (news/headlines per market)
        │ (anomaly      │      └──────────────┘
        │  detectors)   │
        └───────┬───────┘
                ▼
        ┌───────────────┐
        │ Paper trader  │  simulate fills, fees, track P&L per signal type
        └───────┬───────┘
                ▼
   ┌────────────┴────────────┐
   ▼                         ▼
┌──────────┐          ┌──────────────┐
│ Dashboard│          │ Alerts        │ (push/email/webhook)
└──────────┘          └──────────────┘
```

### Common event schema (normalized across platforms)
- `market_id`, `platform`, `question`, `outcome`, `timestamp`
- `price` (implied probability), `volume`, `open_interest`
- `order` events: `size`, `side`, `aggressive?`
- optional `wallet` (Polymarket only)

### Signal types (v1 detectors)
1. **Size spike** — single order/trade > N× median recent size.
2. **Volume surge** — rolling volume > X std-devs above baseline.
3. **OI jump** — open interest steps up sharply (new conviction money).
4. **Sharp move** — implied prob moves > Y points in Z minutes.
5. **Cross-market divergence** — Kalshi vs Polymarket odds gap on the same event.
6. **(Polymarket) smart-wallet move** — a tracked high-win-rate wallet takes a position.

Each signal records: trigger reason, market snapshot, and a forward-return
window so we can later score "did this predict the move?"

---

## 5. Tech choices (proposed, open to change)

- **Language:** Python (richest ecosystem for market data + analysis).
- **Storage:** SQLite to start (zero-ops, great for backtesting); migrate to
  Postgres/Timescale if/when volume demands.
- **Scheduler:** simple async poller loop; upgrade to a task queue later.
- **Dashboard:** lightweight — start with a single-page web view or Streamlit.
- **Config:** all thresholds in one config file so tuning is easy.
- **Secrets:** API keys via env vars, never committed.

No dependency is load-bearing yet; this is a starting point, not a commitment.

---

## 6. Phased roadmap

### Phase 0 — Foundations (this spec) ✅
Agree on vision, scope, architecture, and guardrails.

### Phase 1 — Kalshi detector (watch-only)
- Kalshi adapter + ingestion loop
- SQLite history store
- Detectors: size spike, volume surge, OI jump, sharp move
- Console/log output of flagged "whale" events
- **Deliverable:** running poller that prints unusual activity with reasons.

### Phase 2 — Enrichment + dashboard
- News enricher attaches recent headlines to flagged markets
- Web dashboard: live feed of signals, per-market history, charts
- Alerting (push/email/webhook) on high-confidence signals

### Phase 3 — Paper trading + edge measurement
- Paper-trade engine: simulate entries/exits on signals, model fees & slippage
- Track hypothetical P&L per signal type
- Backtest harness over stored history → **edge report**
- **Gate:** this is where we learn whether any signal actually has edge.

### Phase 4 — Polymarket adapter (literal whales)
- Polymarket adapter normalizing to the common schema
- Wallet tracking + smart-money leaderboard ingestion
- Cross-market divergence detector (Kalshi vs Polymarket)
- Copy-trade *paper* signals

### Phase 5 — (Conditional) live execution
- ONLY if Phase 3/4 show statistically real, fee-surviving edge
- Strict risk limits, position caps, kill switch, human approval to start
- Reinvestment logic = the actual "self-funding" flywheel

### Phase 6 — (Conditional) increased autonomy
- Auto-tuning of thresholds, new-detector proposals, self-monitoring
- Each autonomous capability earns its place by beating the human baseline

---

## 7. Guardrails & principles

- **Watch before you wager.** No real money until edge is proven on paper.
- **Respect ToS & law.** Public APIs only; obey rate limits and platform rules.
- **Every signal is falsifiable.** We always log forward returns to grade it.
- **Fees are the enemy.** All edge claims are *after* fees and slippage.
- **Human in the loop** on anything that spends money, until explicitly removed.
- **Small, reversible steps.** Each phase ships something usable on its own.

---

## 8. Open questions (to resolve before/within Phase 1)

1. ~~Kalshi API access: which market categories to start with?~~ **Decided: all
   major categories.** Ingest broadly, but calibrate whale thresholds *per-market
   by liquidity* so a "whale" is relative to that market's own normal size (avoids
   noise from thin markets). Liquid markets get priority in detection/alerting.
2. Polling cadence vs. websocket streaming — what does Kalshi's API support / allow?
3. What's "whale-sized" per market? Thresholds will need per-category calibration.
4. Alerting channel preference (push? email? Discord/Telegram webhook?).
5. Where will this run long-term (your machine, a cheap VPS, a cloud function)?

---

## 9. Next action

With this spec agreed, Phase 1 is the first build: Kalshi adapter + ingestion +
core detectors, watch-only. Say the word and that's what gets scaffolded next.
