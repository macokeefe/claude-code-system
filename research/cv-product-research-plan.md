# Research Plan: High-Impact Computer Vision Product Opportunities

**Status:** Ready to execute
**Owner:** Mac O'Keefe
**Executor:** Any capable research model/agent-orchestrator (this document is the full spec — no prior context required)
**Date authored:** 2026-07-15

---

## 1. Mission

Identify **5–10 concrete, creative product concepts** that use computer vision to (a) genuinely improve the world and (b) have the potential to be extremely commercially valuable — then rank them and make one clear recommendation, backed by verified evidence.

### Definitions (use these consistently)

- **"Genuinely improves the world"** — measurable positive effect on human health, safety, access, environment, or economic opportunity for underserved populations. Must be articulable as "X people affected, Y outcome improved," not vibes.
- **"Extremely valuable"** — a credible path to $100M+ annual revenue OR a defensible position in a $1B+ market. Show the math.
- **"Feasible"** — buildable to a first version by a small team (1–5 people) within 12 months using 2026-era CV capability, without requiring a proprietary breakthrough.

### Success criteria for this research

The research is **done** when all of the following are true:

1. At least 10 domains have been surveyed (see §4, Phase 2).
2. At least 15 candidate concepts were generated; 5–10 survive scoring and verification.
3. Every surviving concept has a completed one-pager (template in §7.2) with **every claim cited** to a source, and every load-bearing claim adversarially verified (protocol in §6).
4. Concepts are ranked with the rubric in §5, scores shown, and a single top recommendation is argued for explicitly.
5. The final report passes the quality gates in §8.

---

## 2. Primary Research Questions

**RQ1 — Capability:** What can computer vision do *now* (mid-2026) that it could not do 2–3 years ago, and at what cost? Focus: vision-language models, video understanding, edge/on-device inference, 3D reconstruction, low-cost sensing (thermal, hyperspectral, event cameras), few-shot/zero-shot adaptation.

**RQ2 — Need:** Which high-impact domains have severe, expensive, *unsolved* problems where "seeing" is the bottleneck? Candidate domains listed in §4 Phase 2 — but scouts should add domains if evidence warrants.

**RQ3 — Market:** Where do impact and willingness-to-pay overlap? Who is the buyer, what do they pay today for the problem (status quo cost), and what's the market size (bottom-up, not just analyst TAM quotes)?

**RQ4 — Competition & graveyard:** Which spaces are crowded and why? Which well-funded CV startups failed or stalled (2018–2026), and what killed them? What patterns should new entrants avoid?

**RQ5 — Timing:** What changed in 2025–2026 (model releases, hardware cost curves, regulation, reimbursement codes, procurement policy) that opens a window *now*?

**RQ6 — Synthesis:** Given RQ1–RQ5, what are the best 5–10 product concepts, ranked by impact × value × feasibility, and which one should be built first?

---

## 3. Operating Principles & Anti-Goals

**Principles**

- **Contrarian bias.** Prefer ideas that are non-obvious, in unglamorous domains, or that exploit a recent capability shift. If an idea appears in every "AI startup ideas" listicle, it needs a specific untapped angle or it's out.
- **Bottom-up evidence.** Market sizes must be reconstructed from unit economics (number of buyers × price × frequency), then sanity-checked against analyst figures — never quoted alone.
- **Distribution-first thinking.** For each concept, the "how do the first 10 customers hear about this" question must have a real answer.
- **Steelman the graveyard.** Every concept must be checked against prior failures in the same space; "they were too early" requires evidence of what specifically changed.
- **Honest uncertainty.** Confidence labels (High/Medium/Low) on every major claim. An honest "Low confidence" beats a confident fabrication.

**Anti-goals (automatic disqualifiers for concepts)**

- Generic radiology/pathology AI with no specific untapped angle (crowded, regulated, long sales cycles).
- Surveillance products whose primary value is monitoring people without consent (misaligned with "improves the world").
- Concepts requiring a research breakthrough that doesn't exist yet.
- Concepts where the CV component is decorative (the real product is something else).
- Pure hardware plays requiring $10M+ before first revenue.

---

## 4. Phase Plan

Execute phases in order. Phases 1–2 run their agents **in parallel internally**. Do not start Phase 4 until Phase 3's gate passes.

### Phase 0 — Setup (orchestrator, no agents)

1. Read this document fully.
2. Create a working directory for intermediate outputs: one file per agent, named `phase<N>-<agent-name>.md` (or equivalent structured storage).
3. Confirm web search + fetch tools are available. If not, stop and report — this research cannot run from memory alone.

### Phase 1 — Capability Landscape (answers RQ1)

**Agents: 3, parallel.**

| Agent | Charge |
|---|---|
| `cap-models` | State of vision-language & video models as of mid-2026: what's SOTA, what's open-source, benchmark deltas vs. 2023–24, API pricing per image/minute of video. |
| `cap-edge` | On-device/edge inference: what runs on a phone, a $50 board, a $500 camera; latency/power/cost numbers; what became possible in 2025–26. |
| `cap-sensing` | Beyond RGB: thermal, hyperspectral, event cameras, depth, satellite imagery — current unit costs, cost trend, and what each modality uniquely enables. |

**Output per agent:** ≤1,500 words. Structure: (1) capability inventory with dates and citations, (2) "newly feasible" list — things that crossed a feasibility or cost threshold in the last 24 months, (3) cost table.

**Gate:** Combined output must name ≥10 concrete "newly feasible" capabilities with dates/evidence. If fewer, spawn one follow-up agent targeting the gaps.

### Phase 2 — Domain Sweep (answers RQ2, RQ3 partially)

**Agents: 10, parallel — one scout per domain.**

Domains: (1) healthcare & diagnostics beyond radiology, (2) accessibility for blind/low-vision users, (3) agriculture & food security, (4) climate & environmental monitoring, (5) infrastructure inspection (bridges, roads, grid, pipelines), (6) elder care & aging in place, (7) disaster response & resilience, (8) wildlife conservation & biodiversity, (9) industrial & worker safety, (10) education & child development. Scouts may propose an 11th domain if they hit strong evidence for one (e.g., maritime, waste/recycling, housing).

**Scout prompt template** (fill in `{DOMAIN}`):

> You are a domain scout researching `{DOMAIN}` for computer vision product opportunities, as of mid-2026. Using web search, answer:
> 1. What are the 3–5 most expensive/painful unsolved problems in this domain where visual perception is the bottleneck? Quantify the pain (deaths, dollars, hours, people affected) with citations.
> 2. Who currently pays to mitigate each problem, how much, and via what clunky status-quo method?
> 3. What CV products/startups already operate here? Funding, traction, and — critically — what they *don't* cover.
> 4. Any notable failures/shutdowns in this domain and why.
> 5. Regulatory or procurement realities (FDA class, HIPAA, CE, government tender cycles, insurance/reimbursement codes).
> 6. Your 1–3 most promising *specific* product wedges, favoring non-obvious angles.
> Output ≤1,800 words, every factual claim cited with URL, confidence-labeled (High/Med/Low). Return raw findings, not a polished essay.

**Gate:** Each scout returns ≥3 quantified pain points and ≥1 product wedge. Re-run any scout that returns thin or uncited output (max 1 retry each).

### Phase 3 — Market, Graveyard & Timing (answers RQ3, RQ4, RQ5)

**Agents: 3, parallel** (start as soon as Phase 1 completes; can overlap with Phase 2).

| Agent | Charge |
|---|---|
| `market-funding` | CV startup funding trends 2023–2026: totals, hot categories, notable rounds, exits/acquisitions. Which categories are over-funded relative to revenue? |
| `graveyard` | 10+ case studies of failed/stalled CV companies (e.g., agtech CV, retail checkout CV, autonomous trucking, consumer camera AI). For each: what killed it — tech, distribution, unit economics, timing, regulation? Extract 5–8 reusable failure patterns. |
| `timing` | 2025–2026 window-openers: model releases, hardware price drops, new regulations creating compliance demand, new reimbursement/insurance codes, government programs (infrastructure bills, climate funds), platform shifts (smart glasses, drones-as-a-service). |

**Output per agent:** ≤1,800 words, cited, confidence-labeled.

**Gate before Phase 4:** Orchestrator writes a 1-page synthesis memo: top 10 capability shifts, top 15 pain points across domains, failure patterns, timing windows. This memo is the *only* context passed to ideation agents (plus this plan's §1, §3, §5).

### Phase 4 — Concept Generation

**Agents: 3 ideators, parallel, each with a different lens** (diversity beats redundancy):

- `ideator-contrarian` — instructed to find ideas in unglamorous/overlooked wedges; explicitly forbidden from proposing anything on a provided "crowded list" (compiled from Phase 2/3: e.g., generic radiology AI, retail analytics, dashcam driver monitoring, generic drone inspection).
- `ideator-capability` — starts from Phase 1's "newly feasible" list and works forward: "this just became possible — who desperately needs it?"
- `ideator-pain` — starts from the top pain points and works backward: "this problem costs $X/year — what's the minimal CV product that dents it?"

Each ideator produces **7 concepts** in this fixed schema (≤200 words each): *Problem (quantified) · Product (one sentence) · Who pays & how much · Why now · Why a small team can win · Biggest risk.*

**Dedup & cut (orchestrator):** Merge semantic duplicates across the ~21 concepts. Kill anything hitting an anti-goal (§3). Target: 12–15 survivors advance.

### Phase 5 — Scoring & Deep Dives

**Step 5a — Panel scoring.** 3 judge agents independently score all surviving concepts with the rubric in §5. Average the scores; flag any concept where judges disagree by ≥3 points on a criterion for a tie-break discussion (one extra agent reads both rationales and rules).

**Step 5b — Deep dives.** Take the **top 8** by score. One deep-dive agent per concept, parallel, filling the one-pager template (§7.2) completely, with fresh targeted searches on: named competitors, bottom-up market math, regulatory path, and a concrete 12-month build plan.

### Phase 6 — Adversarial Verification (protocol in §6)

Extract every **load-bearing claim** from the 8 one-pagers (market sizes, competitor status, regulatory assertions, capability assertions, cost figures). Verify each per §6. Update or strike claims that fail. If a concept loses a load-bearing claim it depends on, demote or drop it and promote the next-ranked concept (run its deep dive).

### Phase 7 — Synthesis & Final Report

One synthesis agent (or the orchestrator) produces the final report per §7.1. Then one **completeness critic** agent reviews it against §8's quality gates and lists deficiencies; fix them before delivery.

---

## 5. Scoring Rubric

Score each criterion 1–10. **Weighted total = 0.35·Impact + 0.35·Commercial + 0.30·Feasibility.**

| Criterion | Weight | 2 (poor) | 6 (good) | 9–10 (exceptional) |
|---|---|---|---|---|
| **World impact** | 0.35 | Marginal convenience; affected population small or benefit unmeasurable | Clearly improves health/safety/access/environment for 100K+ people, measurably | Plausibly saves lives, restores capability, or protects environment at scale of millions; impact per user is large and demonstrable |
| **Commercial value** | 0.35 | Unclear buyer; <$100M market; weak willingness to pay | Identified buyer already spending on the problem; credible $1B+ market; sane unit economics | Urgent budgeted pain, bottom-up path to $100M+ ARR, structural moat (data flywheel, workflow lock-in, regulatory approval as barrier) |
| **Small-team feasibility** | 0.30 | Needs breakthrough research, heavy hardware, or 3+ years to first revenue | Buildable to sellable v1 in ≤12 months on existing models/hardware; first customers reachable without enterprise sales army | v1 in ≤6 months; obvious wedge customer; capability shift makes incumbents' approach obsolete |

Judges must justify each score in 1–2 sentences. No score without a rationale.

---

## 6. Evidence & Verification Standards

**Citation rules**

- Every quantitative claim carries an inline source URL and access date.
- Source tiers: **T1** peer-reviewed / government statistics / regulator filings · **T2** reputable industry press, company primary sources (pricing pages, S-1s, funding announcements) · **T3** analyst reports, blogs, secondary aggregators. Market sizes need T1/T2 or bottom-up math; T3 alone is insufficient.
- Recency: prefer sources ≤18 months old for market/capability claims; older is fine for structural facts (disease prevalence, infrastructure counts).

**Adversarial verification protocol (Phase 6)**

For each load-bearing claim, spawn **3 independent verifier agents**, each prompted to *refute* the claim via fresh searches ("Try to prove this is false, outdated, or exaggerated; default to 'refuted' if you cannot find support"). Decision rule:

- 0–1 of 3 refute → claim stands (label **Verified**).
- 2–3 of 3 refute → claim is struck or corrected; the one-pager is updated and the concept re-scored.
- Verifiers disagree with new evidence → record both, label **Contested**, and say so in the report.

**Confidence labels** — High: multiple independent T1/T2 sources. Medium: single good source or consistent T3s. Low: inference/extrapolation, clearly marked.

---

## 7. Deliverables

### 7.1 Final report structure (single document, ~4,000–6,000 words + appendices)

1. **Executive summary** — the ranked list in one table + the single top recommendation and why (≤400 words).
2. **What changed** — the 2025–2026 capability and timing shifts that drive the whole thesis (1 page).
3. **The ranked concepts** — 5–10 one-pagers (template below), in rank order, scores shown.
4. **The graveyard** — failure patterns and how each recommended concept avoids them.
5. **Recommendation & first 90 days** — for the #1 concept: concrete next steps (customer interviews to run, prototype to build, dataset to acquire).
6. **Appendix A** — full scoring matrix with all judges' scores.
7. **Appendix B** — verification log: every load-bearing claim, its verdict, and sources.
8. **Appendix C** — discarded concepts and one-line reasons (so good ideas aren't silently lost).

### 7.2 Concept one-pager template (mandatory fields)

```
## <Concept name> — Rank #N (score X.X/10)

**One-liner:** <product in one sentence>
**The problem:** <quantified pain, cited>
**The product:** <what it does, what the user experiences, where CV is the core>
**Why now:** <specific 2025–26 capability/timing shift, cited>
**Customer & business model:** <who pays, how much, pricing logic, bottom-up market math>
**Competition:** <named competitors + the specific gap this exploits>
**Moat:** <data flywheel / workflow / regulatory / distribution — be honest if thin>
**Regulatory path:** <e.g., FDA class II 510(k) ~12–18 mo, or "none — non-clinical">
**Impact case:** <who is better off, by how much, how you'd measure it>
**Main risks:** <top 3, with the single most likely kill-shot flagged>
**Path to v1 (12 months):** <quarter-by-quarter: prototype → pilot → first revenue>
**Scores:** Impact X · Commercial X · Feasibility X → Weighted X.X
**Confidence:** <High/Med/Low + why>
```

---

## 8. Quality Gates (final report must pass ALL)

- [ ] ≥10 domains surveyed; evidence in appendices or intermediate files.
- [ ] ≥15 concepts generated; discard reasons logged (Appendix C).
- [ ] 5–10 concepts fully one-pagered; **zero** empty template fields.
- [ ] Every market size shown with bottom-up math, not just an analyst quote.
- [ ] Every load-bearing claim in the verification log with a verdict.
- [ ] Every concept checked against the graveyard's failure patterns explicitly.
- [ ] At least 3 of the final concepts are non-obvious (would not appear on a generic "AI startup ideas" list — the critic agent judges this).
- [ ] A single #1 recommendation is argued, including why it beats #2 and #3.
- [ ] No anti-goal (§3) violations.
- [ ] All numbers have citations; all confidence labels present.

## 9. Budget & Scale Guidance

- Total agent count: ~30–35 (3 capability + 10 scouts + 3 market + 3 ideators + 3 judges + 8 deep dives + ~3×N verifiers + 1 critic). Parallelize within phases.
- If constrained, cut in this order: verifier votes 3→2, deep dives 8→6, scouts merge related domains (7+9, 3+8). **Never** cut the verification phase entirely or the graveyard agent — they are what makes the output trustworthy.
- If a search tool fails repeatedly, note the gap explicitly in the report rather than filling it from model memory.
