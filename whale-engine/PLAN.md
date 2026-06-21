# PLAN — How This Machine Works (Properly)

*A prediction-market research-and-trading engine that proves edge before it
risks a dollar. Status doc: what it is, how the pieces fit, and the path from
"interesting idea" to "money we trust."*

---

## 0. The one-sentence thesis

Build an honest, automated engine that ingests public information across
hundreds of prediction markets, measures candidate edges against ground truth
out-of-sample and after real execution frictions, paper-trades only the edges
that survive, and graduates to real capital — narrowly — on the rare ones that
keep working.

The product is **not** a trading bot. The product is the **verification
machine**. The bot is what's left after the machine has killed everything that
doesn't survive.

---

## 1. The core principle: measure first, believe last

Almost every "edge" in this space is an illusion produced by looking at the
data the wrong way. This session alone, honest measurement killed four:

| Hypothesis | Why it looked real | Why it's dead |
|---|---|---|
| Copy the top whales | $22M wallets, 97% win rates | −45% ROI **out of sample**; survivorship + held-winners bias |
| Fade longshots like the pros | Walls of green "Won" | Negative skew — one loss eats 40 wins (denizz: −$63K in a day) |
| Time-ladder arbitrage | "By March" should be ≤ "by June" | 0 violations — liquid markets are already consistent |
| Momentum / fade on spikes | +13c reversion on 20c spikes | **Vanishes at realistic entry lag** — not capturable |

That table *is* the methodology. A negative result you can trust is worth more
than a positive one you can't. Every new idea enters as a suspect and has to
survive the gauntlet (§4) before it earns a dollar.

**Open lead:** intra-hour drift after news (your original idea). Untested —
needs minute-resolution data. Everything below is built so that test, and every
test after it, is honest by construction.

---

## 2. Architecture — seven layers

```
  (7) SELF-IMPROVEMENT   re-run the gauntlet on a schedule; retire decayed edges,
                         promote new ones, widen coverage
        ▲
  (6) ACTION             paper-trade → (only after proof) live, with sizing,
                         limits, and a kill switch
        ▲
  (5) STRATEGIES         hypothesis modules: each proposes trades from features
                         (drift, cross-venue, AI-analyst, …)
        ▲
  (4) VERIFICATION       the gauntlet — out-of-sample, entry-lag, cost, capacity,
                         concentration. The heart of the system.
        ▲
  (3) FEATURES           derived signals: sharp moves, price ladders, wallet
                         track records, cross-venue spreads, AI probabilities
        ▲
  (2) MEMORY             SQLite + fixtures: snapshots, trades, resolved outcomes,
                         captured price tapes (ground truth, replayable offline)
        ▲
  (1) SENSES             venue adapters: Kalshi + Polymarket (markets, trades,
                         price history, resolutions) and public-info feeds
```

Mapping to what already exists:

- **(1) Senses** — `adapters/kalshi.py`, `adapters/polymarket.py`
  (leaderboard, wallet trades, `open_markets`, `price_history`, Gamma
  resolution).
- **(2) Memory** — `storage.py` (SQLite) + `fixtures/*.json` (captured tapes,
  the thing that lets analysis run offline).
- **(3) Features** — `mispricing.py` (ladders), `drift.py` (sharp moves),
  wallet aggregation in `poly_backtest.py`.
- **(4) Verification** — `backtest.py`, `poly_backtest.py` (out-of-sample
  forward test), `drift.py` (entry-lag gate). **This is the most important
  layer and gets the most engineering.**
- **(5) Strategies** — today: drift, ladder, whale, cross-venue (next).
- **(6) Action** — not built yet. Paper-trading harness comes first.
- **(7) Self-improvement** — not built yet. Scheduled re-verification.

---

## 3. Data layer & the offline workflow

**Venues.** Kalshi (`api.elections.kalshi.com`, US-regulated, anonymous flow)
and Polymarket (`gamma-api` / `data-api` / `clob` / `lb-api`, offshore,
**attributed** per-wallet flow). Polymarket is primary because attribution and
public price history make honest measurement possible.

**Ground truth.** Resolved markets (`result` / Gamma `outcomePrices`) and the
historical price tape (`/prices-history`). Strategies are always graded against
these, never against their own assumptions.

**The fixtures workflow (how we move fast).** The build sandbox is geo-blocked
from both venues, so:

1. A human runs one `--dump` command (live API → JSON fixture in the repo).
2. The fixture is committed.
3. All analysis/iteration runs `--from-file`, fully offline, indefinitely,
   with no further API calls — including parallel sub-agents.

This converts "ping the human every step" into "human captures data once, the
machine grinds." Live calls are needed only for (a) fresh data capture and
(b) eventual live trading.

---

## 4. The verification gauntlet (the heart)

Every strategy must pass **all** gates, in order. Failing any one kills it.

1. **Ground-truth grading.** Trades scored against actual resolutions / the
   real tape. No moral victories.
2. **Out-of-sample.** Qualify the signal on data *before* a cutoff; measure it
   on data *after*. (Killed naive whale-copying.)
3. **Executability / entry lag.** Re-price assuming you act at the *next*
   observable bar, not the untradeable signal price. (Killed the spike fade.)
4. **Cost model.** Subtract realistic spread + fees + slippage. An edge smaller
   than its frictions is not an edge.
5. **Capacity.** Can you get filled at size, given the market's liquidity right
   when the signal fires? A 1c edge on $500 of depth is a hobby.
6. **Concentration.** Is the result spread across many markets/events, or one
   lucky cluster? (The LA-mayor cluster that faked +5.6% on Kalshi.)
7. **Skew & drawdown.** High win rate with negative skew (denizz) is a
   steamroller. Report P&L distribution, not just the mean.

Output of the gauntlet per strategy: **EDGE** (win% − price paid), **net ROI
after costs**, **capacity**, **sample size**, **out-of-sample delta**, and a
plain-English verdict. Anything that survives goes to paper trading; everything
else is logged as a trusted negative so we never re-chase it.

---

## 5. Strategy pipeline (idea → money)

```
  idea ─▶ backtest (historical, gauntlet §4) ─▶ PAPER (forward, live prices,
        no money) ─▶ LIVE (small, capped) ─▶ SCALE (only on sustained edge)
                         │                          │
                         └── kill on any gate ◀──────┘  re-verify on schedule
```

- **Kill criteria are defined up front** for every stage (e.g. "paper edge must
  stay > costs over N trades and M weeks, max drawdown < X"). If it decays, it's
  retired automatically.
- **Paper before real, always.** Paper trading runs the *exact* live logic
  against real-time prices and records fills it would have gotten — the final
  honesty check before capital.
- **Small and capped before scale.** First real money is the smallest size that
  makes the test real, with a hard per-market and total exposure limit.

### Current strategy slate
- **Intra-hour drift** *(testing next, minute data)* — does price keep moving
  for minutes after a news-driven move, before you could be front-run?
- **Cross-venue spread** *(next to build)* — same real-world event, two
  independent order books (Kalshi vs Polymarket); flag and (if frictions allow)
  capture divergences. Detection is cheap and informative even if capture is hard.
- **AI-analyst** *(the long game)* — for many markets, auto-pull public primary
  sources, have an LLM produce a *calibrated* probability + rationale, trade
  where it disagrees with the market — **but only after** its calibration is
  proven against resolved markets the same way every other edge is. This is the
  scalable version of what specialists like denizz do by hand in one domain.

---

## 6. The live loop (once something graduates)

```
  ingest ─▶ compute features ─▶ strategy fires a candidate ─▶ size it
     ▲                                                          │
     │                                                          ▼
  monitor/exit ◀── record fill (paper or real) ◀── pre-trade checks
                   (liquidity, spread, exposure limits, kill switch)
```

- **Sizing** is edge- and confidence-scaled, hard-capped per market and overall.
- **Pre-trade checks** reject the trade if the live spread/liquidity has erased
  the edge the backtest assumed (the §4.3/§4.5 gates, enforced in real time).
- **Kill switch** halts all trading on anomaly (data gap, drawdown breach, venue
  error). The watcher already survives bad cycles without dying; the trader
  inherits that discipline.

---

## 7. Operating model (how it gets built)

- **Human-in-the-loop only for two things:** capturing fresh live data, and
  authorizing real capital. Everything else is autonomous.
- **Agents for breadth.** Independent build/analysis tracks (param sweeps, a new
  venue adapter, the news-trigger layer, test hardening) run as parallel
  sub-agents against the committed fixtures, supervised and merged centrally.
- **Spec-first, commit often.** Every change is small, tested, and pushed to the
  working branch with an honest message — including the negative results.

---

## 8. Roadmap

**Phase 0 — Foundations (done).** Adapters, storage, honest backtests, the
fixtures workflow, the verification gauntlet, four edges tested and killed.

**Phase 1 — Find one capturable edge (now).**
- [ ] Minute-resolution drift test (your thesis) with the entry-lag gate.
- [ ] Cross-venue spread detector (Kalshi ↔ Polymarket matching + gaps).
- [ ] Whichever survives → define paper-trade kill criteria.

**Phase 2 — Paper trading.** Real-time loop, simulated fills, live P&L
dashboard, multi-week forward proof at zero risk.

**Phase 3 — Small live.** Capped capital on a proven edge; compare live fills to
paper to measure the reality gap; scale only on sustained, costed edge.

**Phase 4 — The analysis machine.** LLM-analyst across many markets +
public-data feeds, each calibrated and verified before it trades; coverage
widens; the system re-verifies itself on a schedule and reallocates to what
still works.

---

## 9. Guardrails (non-negotiable)

- **Public information only.** Edge comes from speed and breadth of reasoning
  over *public* data + prediction. Never material non-public information. The
  legal line is bright and we stay well inside it.
- **Paper before real. Small before large. Capped always.**
- **Honesty over hope.** Report failures with the numbers. A strategy that
  hasn't passed the gauntlet does not trade, no matter how green its chart looks.
- **The machine's job is to not fool us.** Everything above exists to make
  self-deception expensive and the truth cheap.
