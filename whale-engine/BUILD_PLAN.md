# BUILD PLAN — Constructing the Engine

*The engineering plan to build everything in `PLAN.md`. Organized as
workstreams → epics → concrete tasks, each with the modules to write, their
interfaces, the tests that prove them, and the gate that lets the phase close.
Sequenced so independent tracks can run as parallel agents.*

> Read `PLAN.md` first for the **why** and the architecture. This is the **how**
> and the **in-what-order**.

---

## 0. Conventions (apply to every task)

- **Stdlib-only runtime.** `urllib`, `sqlite3`, `http.server`, `argparse`,
  `json`, `re`. `cryptography` optional (Kalshi auth). No other runtime deps.
- **Every module ships with tests** that run offline against fixtures — no
  network in CI. A task is not "done" until its test passes.
- **Every strategy result passes through the verification library** (§W0). No
  strategy reports its own P&L with its own math.
- **Small commits, honest messages, negatives included.** Push to the working
  branch.
- **Definition of done per task:** code + unit test + offline fixture (if data
  needed) + wired into CLI/dashboard + committed.

### Target module tree (✅ exists · 🔨 build · ✳️ extend)

```
whale_engine/
  adapters/
    base.py            ✅  Source protocol
    kalshi.py          ✅  markets/trades/settled/resolutions
    polymarket.py      ✳️  + order book depth, websocket (live)
    venue.py           🔨  unified market identity across venues
  storage.py           ✳️  + paper_orders, fills, equity, calibration tables
  models.py            ✳️  + Order, Fill, Position, Quote
  config.py            ✳️  + risk limits, strategy params, secrets
  verify/              🔨  THE shared verification library (§W0)
    gauntlet.py        🔨  runs all gates, emits a verdict
    gates.py           🔨  oos, entry_lag, cost, capacity, concentration, skew
    report.py          🔨  standard strategy report object + printer
  features/
    drift.py           ✳️  (move drift.py here) sharp-move + lag-aware
    ladders.py         ✳️  (move mispricing.py here)
    wallets.py         ✳️  per-wallet track records
    crossvenue.py      🔨  matched-event spread features
  strategies/          🔨  each: propose(candidates) -> [TradeIntent]
    base.py            🔨  Strategy protocol + registry
    drift_news.py      🔨  intra-hour drift
    crossvenue.py      🔨  divergence capture
    analyst.py         🔨  LLM calibrated-probability disagreement
  ingest/              🔨  public-info feeds (news/filings/official)
    feeds.py           🔨  pollers -> normalized Event stream
    linker.py          🔨  Event -> affected markets
  analyst/             🔨  LLM layer
    prober.py          🔨  pull primary sources per market
    estimator.py       🔨  Claude -> {prob, rationale, sources}
    calibration.py     🔨  reliability curve vs resolved outcomes
  paper/               🔨  paper-trading engine (§W2)
    broker.py          🔨  simulated fills from live quotes
    portfolio.py       🔨  positions, exposure, equity curve
    risk.py            🔨  pre-trade checks, limits, kill switch
    loop.py            🔨  detect->size->route->monitor->exit
  live/                🔨  real execution (§W3), mirrors paper/
    kalshi_exec.py     🔨  signed order placement
    poly_exec.py       🔨  CLOB order placement (wallet)
  scheduler.py         🔨  periodic re-verification + reallocation (§W4)
  web.py               ✳️  + paper/live dashboards, calibration, equity
  cli.py               ✳️  + paper, live, ingest, analyst, schedule cmds
fixtures/              ✳️  captured tapes/books/feeds for offline CI
```

---

## W0. Verification library (foundational — build first)

Everything depends on this. Today the gate logic is scattered across
`backtest.py`, `poly_backtest.py`, `drift.py`. Consolidate into one library so
every strategy is judged identically.

**Modules:** `verify/gates.py`, `verify/gauntlet.py`, `verify/report.py`

**Interfaces:**
```python
@dataclass
class Trade:            # one graded decision
    market: str; venue: str; ts: int; side: str
    entry: float; exit: float; size: float; won: bool|None; cost: float

@dataclass
class Verdict:
    edge: float; net_roi: float; sample: int; oos_delta: float
    capacity_usd: float; top_cluster_share: float; skew: float
    passed: bool; failures: list[str]; notes: str

def run_gauntlet(trades, *, cutoff_ts, cost_model, min_sample,
                 max_cluster, entry_lag) -> Verdict
```

**Gates (each a pure function `list[Trade] -> GateResult`):**
1. `ground_truth` — drop ungraded; require resolution/known exit.
2. `out_of_sample` — split at `cutoff_ts`; compare pre vs post edge.
3. `entry_lag` — recompute exits assuming entry at +`lag` observation.
4. `cost` — subtract spread+fee+slippage via `cost_model(venue, price, size)`.
5. `capacity` — cap fill size to available depth; report $ capacity.
6. `concentration` — `top_cluster_share` by event/category.
7. `skew` — P&L distribution, max drawdown, hit-rate vs mean.

**Tasks**
- [ ] W0.1 Define `Trade`/`Verdict`/`GateResult` dataclasses.
- [ ] W0.2 Implement the seven gates as pure functions.
- [ ] W0.3 `run_gauntlet` orchestrator + standard `report.print(verdict)`.
- [ ] W0.4 Port `poly_backtest` and `drift` to emit `Trade` lists and call it.
- [ ] W0.5 Unit tests: synthetic trade sets that pass/fail each gate exactly.

**Exit gate:** existing whale + drift backtests reproduce their numbers through
the shared library; each gate has a test proving it flips on the boundary.

---

## W1. Phase 1 — Find one capturable edge

Goal: produce **one** strategy with a positive verdict that survives the full
gauntlet, or a trusted negative for each candidate.

### Epic 1A — Minute-resolution drift (your thesis)
**Depends on:** minute fixture (`fixtures/poly_1min.json`), W0.
- [ ] 1A.1 Capture minute tapes (human `--dump`, once) + commit.
- [ ] 1A.2 `features/drift.py`: parameterize bar size; sweep
  jump × hold × **entry-lag** at 1-min resolution.
- [ ] 1A.3 Test intra-hour continuation: after an N-minute move, measure the
  next K minutes **at lag≥1**.
- [ ] 1A.4 Run through W0 gauntlet; produce verdict + heatmap (params → net edge).
- [ ] 1A.5 Decision: capturable edge → 1A.6; else log trusted negative.
- [ ] 1A.6 Wrap surviving params as `strategies/drift_news.py`.

**Exit gate:** a verdict with net-of-cost edge > 0 at realistic lag/capacity, or
a documented kill.

### Epic 1B — Cross-venue spread
**Depends on:** W0, `adapters/venue.py`.
- [ ] 1B.1 `adapters/venue.py`: normalized market identity (resolution-source,
  underlying, deadline) so a Kalshi market and a Polymarket market can be
  declared "the same event."
- [ ] 1B.2 `features/crossvenue.py`: pull both venues, **match** events
  (rules + fuzzy + LLM-assist for the hard ones), compute YES-price spread.
- [ ] 1B.3 Critical guard: **resolution-criteria equivalence check** — a spread
  is only arbitrage if both sides truly pay on the identical condition.
- [ ] 1B.4 Capture a paired fixture; run spreads through W0 (cost = both
  venues' fees + crypto on/off-ramp + spread).
- [ ] 1B.5 `cli arb --cross-venue`; rank capturable spreads.

**Exit gate:** report of real, resolution-matched spreads with net edge after
two-sided frictions — or proof they don't clear costs.

### Epic 1C — Wallet features cleanup (low priority)
- [ ] 1C.1 Move wallet logic to `features/wallets.py`; expose as features, not a
  standalone backtest. (Whale-copying already killed; keep as a feature input
  for the analyst, not a strategy.)

**Phase 1 exit:** ≥1 strategy module with a positive gauntlet verdict, OR a
documented decision that structural/drift edges don't clear costs and we pivot
weight to the analyst (W4).

---

## W2. Phase 2 — Paper-trading engine

Goal: run surviving strategies forward against **live prices, zero money**, and
prove the edge persists out-of-sample in real time.

**Modules:** `paper/broker.py`, `paper/portfolio.py`, `paper/risk.py`,
`paper/loop.py`; schema: `paper_orders`, `fills`, `equity`.

**Interfaces:**
```python
class Strategy(Protocol):
    name: str
    def propose(self, snapshot) -> list[TradeIntent]: ...

@dataclass
class TradeIntent:
    market: str; venue: str; side: str; target_size: float
    edge: float; reason: str; max_price: float

class PaperBroker:
    def quote(self, market) -> Quote          # live bid/ask/depth
    def fill(self, intent, quote) -> Fill|None # simulate against real book
```

**Tasks**
- [ ] W2.1 Schema migration: orders, fills, equity, per-strategy tagging.
- [ ] W2.2 `models.py`: `Order`, `Fill`, `Position`, `Quote`, `TradeIntent`.
- [ ] W2.3 `paper/broker.py`: pull live quote; simulate fill at the price a
  taker would actually get (walk the book), honor `max_price`.
- [ ] W2.4 `paper/portfolio.py`: positions, mark-to-market, realized/unrealized,
  equity curve, mark on resolution.
- [ ] W2.5 `paper/risk.py`: per-market cap, total exposure cap, max drawdown
  halt, duplicate-position guard, **live re-check of the entry-lag/spread gates**.
- [ ] W2.6 `paper/loop.py`: ingest → strategy.propose → risk → broker.fill →
  record → monitor → exit (time/target/resolution).
- [ ] W2.7 `strategies/base.py` registry; wire surviving Phase-1 strategy.
- [ ] W2.8 `web.py`: paper dashboard — equity curve, open positions, per-trade
  log, per-strategy edge realized vs backtest.
- [ ] W2.9 `cli paper --strategy drift_news` (runs the loop; daemonizable).

**Exit gate:** a strategy paper-trades for a defined window (e.g. ≥150 trades /
≥3 weeks) with realized net edge > 0 and live fills tracking backtest within
tolerance. Decay → retire.

---

## W3. Phase 3 — Live trading (small, capped)

Goal: smallest real capital that makes the test real; measure the
backtest→paper→live reality gap.

**Modules:** `live/kalshi_exec.py`, `live/poly_exec.py` (mirror `paper/broker`
interface so the loop is unchanged).

**Tasks**
- [ ] W3.1 `live/kalshi_exec.py`: signed order place/cancel/status (reuse
  `auth.py`); idempotency keys; reconcile fills.
- [ ] W3.2 `live/poly_exec.py`: CLOB order signing via wallet; allowance/funding
  checks.
- [ ] W3.3 Execution-mode switch in `paper/loop.py` (paper ↔ live) — identical
  logic, different broker.
- [ ] W3.4 Hard global limits in `risk.py`: max live capital, per-trade cap,
  daily loss kill switch, manual arm/disarm.
- [ ] W3.5 Live-vs-paper reconciliation report (slippage, miss rate, fill rate).
- [ ] W3.6 Dry-run mode that places + immediately cancels to validate plumbing
  with ~no risk.

**Exit gate:** N live trades with net edge > 0 after *actual* fills, slippage
within modeled bounds, no limit breaches. Only then is scaling discussed.

---

## W4. Phase 4 — AI analyst + self-improvement

Goal: the scalable edge — calibrated probabilities across many markets from
public info — and a system that re-verifies and reallocates itself.

### Epic 4A — Public-info ingestion
- [ ] 4A.1 `ingest/feeds.py`: pollers for official/public sources (gov data,
  filings, releases, reputable news) → normalized `Event{ts, source, text, url}`.
  Per-source latency + reliability metadata.
- [ ] 4A.2 `ingest/linker.py`: map an `Event` to affected markets (keyword +
  embedding + LLM-assist).
- [ ] 4A.3 Latency budget: measure publish-time → ingest-time per source.

### Epic 4B — LLM estimator (per `claude-api` skill)
- [ ] 4B.1 `analyst/prober.py`: for a market, gather the relevant **public**
  primary sources.
- [ ] 4B.2 `analyst/estimator.py`: Claude (`claude-opus-4-8`, override via
  `ANTHROPIC_MODEL`) → `{prob, confidence, rationale, sources}` via stdlib
  `urllib` to the Messages API.
- [ ] 4B.3 `analyst/calibration.py`: log every estimate; when markets resolve,
  build the reliability curve (predicted vs realized). **The estimator does not
  trade until calibrated.**
- [ ] 4B.4 `strategies/analyst.py`: trade where calibrated prob disagrees with
  market price beyond a threshold; route through W0 + paper before live.

### Epic 4C — Self-improvement loop
- [ ] 4C.1 `scheduler.py`: periodically re-run the gauntlet on every live
  strategy against fresh data; auto-retire decayed edges, promote new survivors.
- [ ] 4C.2 Capital reallocation by recent risk-adjusted, costed edge.
- [ ] 4C.3 Coverage expansion: add markets/venues as adapters mature.

**Exit gate:** estimator demonstrably calibrated (reliability curve near
diagonal) on out-of-sample resolved markets before any analyst trade goes live.

---

## W5. Cross-cutting foundations (in parallel from day one)

- [ ] W5.1 `config.py`: typed config + secrets loading + risk-limit block;
  unknown-key tolerance (already a pattern).
- [ ] W5.2 `storage.py`: migration framework already exists — extend with the
  new tables; add a `schema_version`.
- [ ] W5.3 Test harness + fixtures convention; a `make test` equivalent that
  runs everything offline. SessionStart hook to ensure it runs on web sessions.
- [ ] W5.4 Observability: structured run logs, a `runs` table, and a daily
  digest (what fired, what filled, edge realized).
- [ ] W5.5 Secrets/keys handling doc + `.env` template for Kalshi/Polymarket/
  Anthropic.

---

## W6. Agent orchestration (how we parallelize)

After **W0** lands (shared contracts), these tracks are largely independent and
run as concurrent sub-agents against committed fixtures:

| Track | Agent focus | Depends on | Touches |
|---|---|---|---|
| A | W1 drift minute analysis | W0 + minute fixture | `features/drift.py` |
| B | W1 cross-venue matcher | W0 + `venue.py` | `adapters/`, `features/crossvenue.py` |
| C | W2 paper engine | W0, models, schema | `paper/*` |
| D | W4A ingestion feeds | none (own fixtures) | `ingest/*` |
| E | W5 foundations/tests | none | `config.py`, `storage.py`, tests |

**Merge protocol:** each agent owns a module subtree, writes tests, commits to
the working branch; the coordinator (me) integrates, resolves interface drift,
and keeps `W0` contracts stable. Human is pinged only for (a) fresh live-data
captures and (b) capital authorization.

---

## W7. Milestones & global exit gates

- **M0 — Verification library** (W0): all existing backtests run through it.
- **M1 — First edge** (W1): one positive verdict or four trusted negatives +
  pivot decision.
- **M2 — Paper proof** (W2): forward net edge > 0 over the defined window.
- **M3 — Live proof** (W3): small real capital, edge survives real fills.
- **M4 — Analyst calibrated** (W4B): reliability curve proven OOS.
- **M5 — Self-funding loop** (W4C): scheduler reallocates; coverage widens;
  realized P&L funds expansion.

Each milestone has explicit **kill criteria**; failing them retires the
strategy, not the system. The system's success metric is *correct decisions*,
not green charts.

---

## W8. Risk register

| Risk | Mitigation |
|---|---|
| Backtest overfit | W0 out-of-sample + entry-lag + paper before live |
| Illusory edge (untradeable price) | entry-lag gate, live spread re-check |
| Capacity mirage | depth-aware fill sim; capacity gate |
| Resolution mismatch (cross-venue) | equivalence check before any spread trade |
| LLM overconfidence | calibration curve gate; no trade until calibrated |
| Venue/API change | adapters isolate schema; fixtures pin shapes; tests catch drift |
| Capital loss | caps, daily kill switch, paper→small→scale only on proof |
| Legal | public info only; never MNPI; paper-first; documented guardrails |

---

## W9. First ten tasks (do in this order)

1. **W0.1–W0.3** — verification library skeleton + gates + report.
2. **W0.4–W0.5** — port drift/whale backtests onto it; gate boundary tests.
3. **W5.2** — schema additions (orders/fills/equity/calibration) + version.
4. **1A.1** — capture & commit the minute fixture (human).
5. **1A.2–1A.4** — minute drift sweep through the gauntlet → verdict.
6. **1B.1** — `venue.py` market-identity model.
7. **1B.2–1B.4** — cross-venue matcher + spread report through gauntlet.
8. **W2.1–W2.4** — paper schema, models, broker, portfolio.
9. **W2.5–W2.6** — risk checks + paper loop.
10. **W2.8–W2.9** — paper dashboard + `cli paper`.

> Items 5 and 7 are the fork in the road: they tell us whether a tradeable edge
> exists in drift or cross-venue. If both die, weight shifts to W4 (the analyst)
> — and the paper engine (W2) is reused unchanged, because every strategy speaks
> the same `TradeIntent` → gauntlet → paper → live contract.
