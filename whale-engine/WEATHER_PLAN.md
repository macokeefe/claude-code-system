# Weather Analyzer — Implementation Plan

The first edge with a **computable fair value**. Kalshi runs ~100+ daily
high-temperature and rain markets per day across ~10 US cities, all resolving
on official **National Weather Service** data. Unlike the geopolitics analyst
(which guesses and is overconfident on drama), here the fair value is a
*calculation*: take the NWS forecast, model the forecast-error distribution,
and read off the probability. The edge is **market price vs. forecast-implied
probability**, and because these resolve **daily**, we get a real forward
scorecard in days — not months.

Runs entirely through the plan / local machine (NWS API is free + keyless;
Kalshi works on the residential IP). **No metered Anthropic API needed.**

---

## Architecture at a glance

```
NWS api.weather.gov ─┐
                     ├─> weather.py: forecast + P(condition)  ─┐
Kalshi weather series ┘   (forecast high, σ(lead), normal CDF) ├─> divergence
                                                               │   vs market price
Kalshi market price ───────────────────────────────────────────┘        │
                                                                         ▼
                                          storage: recommendations + predictions
                                                                         │
                                              dashboard (existing) ──> paper book
                                                                         │
                                          daily resolution ──> scorecard (Brier vs market)
```

**Reused, unchanged:** `storage.add_recommendation` / `recommendations` table /
`paper_open` / `insert_snapshot`; the dashboard's Recommended-trades section,
paper book, and take-profit; `KalshiSource._get` (authenticated).

**New:** `weather.py` (NWS client + probability model), a weather scan in
`scan.py`, a `weather` CLI command, a `predictions` table + grader, and a
dashboard hook.

---

## Context required (for any executor)

- `whale_engine/` is **stdlib-only** (`urllib`, `sqlite3`, `re`, `json`). No deps.
- Kalshi weather markets: series `KXHIGH<CITY>` (e.g. `KXHIGHNY`, `KXHIGHCHI`,
  `KXHIGHMIA`, `KXHIGHLAX`, `KXHIGHAUS`, `KXHIGHDEN`, `KXHIGHPHIL`) and
  `KXRAIN<CITY>`. ~12 high-temp markets per city/day (one per °F threshold).
  Ticker form `KXHIGHNY-26JUN23-T85`; title `"Will the high temp in NYC be >85°
  on Jun 23?"`. Fields: `ticker`, `title`, `last_price_dollars`,
  `yes_bid_dollars`, `yes_ask_dollars`, `close_time`, `result` (when settled).
  Pull via `src._get("markets", {"series_ticker": "KXHIGHNY", "status": "open"})`.
- NWS: `GET https://api.weather.gov/points/{lat},{lon}` → gridpoint + forecast
  URLs; `GET .../gridpoints/{wfo}/{x},{y}/forecast` → daily periods with a
  numeric high `temperature` and a `probabilityOfPrecipitation`. Requires a
  `User-Agent` header. No key.
- Recommendation contract: `add_recommendation(market_id, question, side,
  market_price, model_price, edge, target_exit, reason)` where prices are the
  **side** price (YES = p, NO = 1-p), `target_exit` is the side's fair value.

---

## Phase 1 — Data sources (foundations)

### Goal
Two reliable, independently-testable feeds: the NWS forecast for a city/date,
and the parsed list of open Kalshi weather markets.

### Task 1.1: NWS forecast client
- **Files**: `whale_engine/weather.py` (new)
- **Action**: Add a `CITIES` table mapping each Kalshi weather city → (lat, lon,
  Kalshi code). Implement `forecast(city, date) -> {high_f, pop_pct, lead_days}`:
  resolve the gridpoint via `/points` (cache per city), fetch the daily forecast,
  return the forecast high (°F) and probability-of-precipitation for the target
  date. Stdlib `urllib` with a `User-Agent`; tolerate missing days (return None).
- **Acceptance**: `forecast("NYC", <tomorrow>)` returns a plausible high (e.g.
  60–100°F) and a 0–100 PoP; unknown city/date returns None; no exceptions on a
  network hiccup (logged, returns None).
- **Dependencies**: None.

### Task 1.2: Kalshi weather market loader
- **Files**: `whale_engine/weather.py`
- **Action**: `open_weather_markets(src) -> list[dict]`: iterate the known
  weather series, pull open markets, and parse each into
  `{ticker, city, date, kind('high'|'rain'), threshold, direction('>'|'<'),
  yes_price}`. Parse threshold/direction from the title (`>85°` / `<93°`) with the
  ticker (`-T85`) as fallback; `yes_price` from `last_price_dollars` (fallback to
  mid of bid/ask).
- **Acceptance**: Returns ≥50 parsed markets across cities; every row has a
  numeric `threshold`, a `direction`, a `date`, and `0<yes_price<1`; a unit test
  on 3 hand-built market dicts parses thresholds/directions correctly.
- **Dependencies**: None.

---

## Phase 2 — Probability model + edge engine

### Goal
Turn a forecast into a calibrated probability and convert each market into a
divergence-scored recommendation.

### Task 2.1: Forecast-implied probability
- **Files**: `whale_engine/weather.py`
- **Action**: `prob_high(forecast_high, threshold, direction, lead_days) ->
  p`: model the high as Normal(forecast_high, σ(lead_days)) and return
  P(high > threshold) (or `<`). Start with an empirically reasonable σ curve
  (~2.5°F at lead 0, growing ~+1°F/day, capped) in a `_SIGMA` function so it can
  be calibrated later (Phase 4). For rain markets, use NWS PoP directly as the
  probability. Clamp to [0.01, 0.99].
- **Acceptance**: Pure function, fully unit-tested: threshold far below forecast →
  ~0.99; far above → ~0.01; at the forecast high → ~0.5; wider σ at higher lead
  pulls extreme probs toward 0.5. No I/O.
- **Dependencies**: Task 1.1 (uses the forecast shape).

### Task 2.2: Divergence → recommendation writer
- **Files**: `whale_engine/scan.py` (add `scan_weather`)
- **Action**: For each open weather market: get its forecast (1.1), compute the
  forecast-implied YES prob (2.1), compute `div = model - market`. If
  `|div| >= min_edge`, choose side (YES if model>market else NO), compute side
  entry/target, write a recommendation via `add_recommendation` with a reason
  citing the forecast (`"NWS forecasts a high of 88°F for NYC on Jun 23; P(>85°)
  ≈ 78% vs market 62% — buy YES, target 78¢"`), and `insert_snapshot` so the paper
  book can mark it. Dedup against open recs. Return `{found, considered}`.
- **Acceptance**: Run against live data writes ≥0 recommendations without error;
  with a stubbed forecast that's far from the market price, it writes a
  recommendation with the correct side and a forecast-citing reason; reasons
  contain the numeric forecast and both probabilities.
- **Dependencies**: Task 1.1, Task 1.2, Task 2.1.

---

## Phase 3 — Integration: CLI + dashboard + scorecard

### Goal
Make the scan runnable (CLI + dashboard) and start recording predictions for the
forward scorecard.

### Task 3.1: CLI `weather` command + dashboard hook
- **Files**: `whale_engine/cli.py`, `whale_engine/web.py`
- **Action**: Add `whale_engine.cli weather [--min-edge --db]` that builds the
  Kalshi source and runs `scan.scan_weather`, printing the divergences found.
  In `web.py`, extend the scan trigger so the Scan button (or a new "🌡 Weather
  scan" button) can run `scan_weather` in the background and surface results in
  the existing Recommended-trades section (weather recs get a `Kalshi` venue
  badge automatically via the existing `0x` heuristic — confirm temp tickers are
  treated as Kalshi).
- **Acceptance**: `python -m whale_engine.cli weather --min-edge 0.1` prints a
  ranked divergence list and writes recs; the dashboard button triggers the same
  and the cards appear with the forecast reason + divergence bar.
- **Dependencies**: Task 2.2.

### Task 3.2: Forward scorecard (predictions log + grader)
- **Files**: `whale_engine/storage.py`, `whale_engine/weather.py`
- **Action**: Add a `predictions` table (ts, market_id, question, model_p,
  market_p, resolved INTEGER NULL, outcome INTEGER NULL). Log every weather
  prediction at scan time. Add `grade_predictions(src)`: for predictions whose
  market has settled (`result` in yes/no), record the outcome, then compute
  rolling **Brier(model)** vs **Brier(market)** and calibration. This is the
  real edge test — does the forecast model beat the market price?
- **Acceptance**: Logging inserts a row per prediction; `grade_predictions`
  marks settled ones and returns `{n, brier_model, brier_market, edge}`; a unit
  test with synthetic predictions+outcomes computes the two Briers correctly.
- **Dependencies**: Task 2.2.

---

## Phase 4 — Verification: σ calibration

### Goal
Tune the forecast-error σ so the model is calibrated, and confirm (or kill) the
edge vs the market.

### Task 4.1: σ calibration from collected predictions
- **Files**: `whale_engine/weather.py`, `whale_engine/calibration.py` (reuse)
- **Action**: Once `predictions` has enough graded rows (forward-collected over
  several days), fit `_SIGMA` so the model's reliability curve sits on the
  diagonal (minimize Brier / ECE via a small σ-scale search). Re-run
  `grade_predictions` to report Brier(model) vs Brier(market) post-calibration.
  **Note:** a historical backtest is not possible (NWS doesn't serve past
  forecasts cleanly), so calibration is forward-collected — this task runs after
  a few days of 3.2 data, not immediately.
- **Acceptance**: With ≥100 graded predictions, the σ-scale search lowers ECE vs
  the default; the report states whether Brier(model) < Brier(market) (edge) or
  not (kill). Honest verdict either way.
- **Dependencies**: Task 2.1, Task 3.2 (needs collected data).

---

## Dependency Graph
```
1.1 ─┬─> 2.1 ─┬─> 2.2 ─┬─> 3.1
1.2 ─┘        │        ├─> 3.2 ─┐
              └────────┘        ├─> 4.1
                               (2.1)
```
- 1.1, 1.2 parallel (no deps).
- 2.1 needs 1.1; 2.2 needs 1.1+1.2+2.1.
- 3.1 and 3.2 both need 2.2 (parallel with each other).
- 4.1 needs 2.1 + 3.2's collected data (runs after a few days).

## Verification (whole feature)
1. **Unit**: probability model (2.1), market parsing (1.2), Brier grader (3.2)
   all pass offline tests.
2. **Live**: `weather` CLI pulls real NWS forecasts + Kalshi prices and writes
   sensible recommendations whose reasons cite the forecast; they appear on the
   dashboard and are one-clickable into the paper book.
3. **Edge (the real bar)**: after a week of forward grading, the scorecard shows
   whether **Brier(model) < Brier(market)**. Positive and calibrated = a real,
   computable edge with a fast scorecard. Otherwise = honest kill, documented.

## Rollback
All new code is additive (`weather.py`, a `predictions` table via the existing
migration pattern, additive CLI/web/scan functions). To roll back: drop the
`weather` command + dashboard button and stop scanning; the `predictions` table
and any weather recommendations are inert and can be left or deleted. No changes
to existing market/paper/recommendation behavior.
