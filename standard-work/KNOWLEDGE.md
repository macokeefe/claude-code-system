# Domain knowledge — furniture manufacturing (Standard Work app)

Durable record of facts learned from the engineer and the SWI sheets. Future
sessions: read this before touching seed data or modeling decisions. When new
facts arrive (corrections, new SKUs, Meritage), update BOTH this file and
`shared/seedData.js`.

## The operation

- Furniture manufacturer; the user is a continuous-improvement engineer.
- Photos of the real floor (2026-06): TUUCI-branded plant (outdoor shade /
  furniture). Work cells = pine lumber workbenches with white foam-padded
  tops (blue/red trim), yellow & blue small-parts bins on lower shelves,
  black anti-fatigue mats with yellow edges, benches in two rows facing a
  central aisle marked with yellow floor tape. Worn grey concrete floor,
  white square columns, perimeter pallet racking with cardboard/TUUCI boxes,
  overhead red coiled air-hose drops, HVLS ceiling fans, strip lighting.
  Product on benches: cherry/bronze wood-look aluminum frames with chrome
  cross-bars and slatted panels. Crew wear grey tees. The 3D Floor page is
  modeled on these photos.
- ~8 operators on the line. They have individual skills but should be treated
  as fully flexible (any operator can do any task). Skills are recorded on the
  operator model for later constraint support.
- Typical day's order mix: ~4 Meritage + ~4 Solas + a couple of other pieces.
- Floor organization: cells / build areas today; a physical redesign is in
  progress and the cells-vs-stations question is open — the app's Day Planner
  compares both. They want waste prediction (idle time is the first waste
  metric) and eventually full process optimization + simulation + layout input.
- Work desktop is locked down: no installs, and the network **blocks
  api.anthropic.com** (so the in-app Claude Assistant doesn't work at work).
  The standalone single-file build is the deployment that matters.

## Product families

- **Sola Lounge** (sectional sofa) — configs are combinations of:
  - **Arms**: none / one (left or right — same labor, side is a label) / both
  - **Middle leg**: present or not
  - **Size**: small = 3.5 (also "S LC 3.5 R C"); medium = 4.5, 5.5, 6.5;
    large = 7.5
- **Meritage** ("MeritageSW 3 Seater") — NOW SEEDED (sku_number MERITAGE-3S,
  family "Meritage"). From the no-pictures sheet (2026-06): 12 steps, times in
  MINUTES (sum 264.25 = stated total), stored as seconds. Steps: PPE; Connector
  Prep 19.25; Leg Assembly 8; Arms Assembly 64; Seat Frame Assembly 47; Back
  Frame Assembly 43.5; Attaching Arms 18; Attaching Back Support 5; Leg
  Finishing 8; Seat Support Frame Assembly 32.5; Attaching Seat Frame 18;
  Attach TUUCI Plate 1. Precedence in seedDeps is INFERRED from the step text
  (roots: connector prep, legs, seat-support frame) — NOT engineer-confirmed;
  verify on the Process Map. Existing browser DBs get it via the
  add-missing-seeded-SKUs migration (tracked in state.seededSkuNumbers).

## Sola rules (authoritative, from the engineer)

### Connector count rule
```
connectors = 14 (base) + 2 × (number of arms) + 4 × (middle leg present)
```
- Base (no arms, no middle leg): 14
- Right Arm (1 arm, no middle leg): 16 ✓ matches sheet
- Middle Leg No Arms: 18 (the sheet said 14 — engineer confirmed 14 was wrong)
- Both arms + middle leg would be: 14 + 4 + 4 = 22
- Connector Pre-Assembly ≈ 0:50/connector (shared tag, per-unit).
- Attach Connectors to Leg Pieces ≈ 0:55/connector, ×4 on current configs.

### Rivnut installation rule (per-component breakdown)
- Rear-left leg: 4 × item #14 (40528, 3/8-16). Rear-right leg: 4 × item #14.
  Front legs: none. → 8 leg rivnuts, ~0.531 min (≈0:32) each.
- Front & back beams (item #13, 40462, 1/4-20): per size —
  small 4/beam (8 total), medium 5/beam (10 total), large 6/beam (12 total).
- Totals: 16 / 18 / 20 rivnuts → 8:30 / 9:33 / 10:37 (3.5 / 4.5–6.5 / 7.5)
  at 0.531 min per rivnut.
- ASSUMPTION to verify: beam rivnuts (item #13) take the same 0.531 min as
  item #14 — engineer only gave the rate for #14.
- The Right Arm sheet's rivnut time read "1:36:40/piece" — ambiguous, replaced
  by the rule above.

### Arms modeling decision
- There is **no separate arm labor step** — arms change (a) connector count
  and (b) the frame sub-assembly variant only.
- Frame sub-assembly variants seen: Right Arm = "8:30 (4-leg) + 10:30 (5-leg)"
  = 19:00; No-Arms = "2 × 8:30" = 17:00. The variant rule for both-arms (and
  whether middle leg changes it) is UNKNOWN — needs the both-arms sheet.
- Per-arm/middle-leg work must read as ONE step to operators (like the
  connector step: one row, quantity is just a multiplier).
- The engineer wants an eventual selector: arms (none/one/both) × middle leg ×
  size on one Sola product.

### Other step times (No-Arms sheet, sanity-checked)
- Connector Plate Installation: 13:04 canonical (Right Arm override 14:52);
  4:44 for a 2-connector piece, 1:48 for 1-connector.
- Frame Connection Assembly: 10:37 (sheet notes missing top-bar install and
  +1 min gathering not included).
- Middle Leg Sub-Assembly: 3:20 (only on middle-leg configs).
- Corner Cap & End Cap: ~100 s/corner, 6:40 total (bottom caps not included).
- Seat/Leg frame installation: 13:15.
- Sheets contain copy-paste noise (both headers say "No arms") — don't trust
  prose over the engineer's explicit rules.

## App/modeling conventions tied to these facts

- SKU = one configuration (SOLA-BASE / SOLA-RA / SOLA-NA seeded; SOLA-BASE is
  constructed from the rules, not a sheet — verify on floor).
- Shared tags = single source of truth; per-unit tags carry quantity per SKU.
- Size-dependent steps use `size_times` {label → seconds}; representative
  (middle) bucket feeds the stored total.
- Precedence: `depends_on` per step; seeded deps put rivnut, connector
  pre-assembly, and seat-support prep in parallel branches; assembly chain is
  sequential. Critical path on the SKU page derives from this.
- Visualization preferences: vertical bar charts; family → configuration →
  size chip pickers (not dropdowns).

## Build-order precedence (authoritative, engineer-confirmed 2026-06)

Encoded in `shared/seedData.js` → `seedDeps` (PRECEDENCE_VERSION migrates
existing DBs). Per the engineer:
- **Rivet Nut** and **Connector Pre-Assembly** are prerequisite-free → both
  start at t=0 (parallel branches).
- **Connector Plate Installation** ← Rivet Nut + Connector Pre-Assembly.
- **Attach Connectors to Leg Pieces** ← Rivet Nut + Connector Pre-Assembly —
  a *separate* branch from Connector Plate (they attach connectors differently).
- **Frame Sub-Assembly** ("side support + arm assembly") ← Connector Plate.
- **Frame Assembly / Frame Connection** ← Frame Sub-Assembly.
- **Corner Caps** ← assembled frame (parallel to Middle Leg). Gluing a cap
  blocks top connector access — anything needing that access must precede caps.
- **Seat Support Frame Assembly** ("assemble seat support") is prerequisite-free
  → gates **Frame Prep** ("seat support prep") → gates **Seat Frame
  Installation** ("trellis support installation"; also needs the frame).
- Engineer's preferred name: "Seat Frame Installation" ≈ "Trellis Support
  Installation" (not yet renamed in data).
This corrected the earlier seeded graph (rivnut no longer gates Frame Sub;
caps depend on the frame, not the middle leg) → critical path dropped.

## Process model direction (2026-06)

The engineer rejected the 'operators run all over the floor every spare
second' model as unrealistic. Target = a balanced ASSEMBLY LINE: each
operator stays at one station doing the same grouped steps on every unit;
units flow station to station; output rate = the slowest (bottleneck)
station. Optimization = group steps into stations to minimize the
bottleneck (line balancing); add a 2nd person only to the bottleneck.
The Line Designer page (sticky-note whiteboard) is the design tool for
this: drag steps into stations, per-note worker stepper adjusts time,
shows cycle time / units-per-shift / operators / balance % and flags
precedence violations. Next: a 'line mode' in the 3D floor where
operators are fixed at stations and units flow past.

## Meritage 3D Line standalone — product switch + Sola line (2026-06)

`standalone/Meritage_3D_Line.entry.js` (bundled into `Meritage_3D_Line.html`)
is a self-contained three.js line model, SEPARATE from the SKU DB — its station
data is hand-authored, not synced. It now models BOTH halves of the floor via a
header **⇄ Line** switch (writes `localStorage['m3d_product']` = `meritage`|
`sola`, then reloads). Layouts are namespaced per product
(`m3d_layout_v2_<product>`, `m3d_layouts_v2_<product>`).

Engine is data-driven over a per-product config (`PRODUCTS[...]` → `title`,
`pos`, `stations`). Topology is shared: parallel **feeders** (role `feeder`,
derived as `FEEDERS`) stage sub-parts → one **FA** bench (role `fa`) → **pack**
(role `pak`, ppl 0, done by the FA pair). `schedule()`/`update()` are generic
over `FEEDERS`; `sch` carries `fT`/`fEnd` maps (was the old `conT`/`seaT`…).
Station IDs are reused (con/arm/bak/[tre/sea]/fa/pak) so scene/sim code is shared.

- **Meritage**: 5 feeders (Connectors, Arms×2p, Back, Trellis, Seat) → Full
  Assembly (58, 2p) → Cushions & Pack (18). Total labor 272.3, cycle ~48.7
  (with seeded help arrows), ~8.6/day. NOTE its pack is still 18 (sheet has 36
  — middle+top boxing not yet added; see "metric clarity" gap below).
- **Sola (No-Arms, SOLA-NA real SWI times sec→min)**: 3 feeders — Rivet Nuts
  9.55, Connector Prep 15.0 (18×0:50), Connector Plates 16.74 (plate 13.07 +
  attach 3.67) → Frame Assembly (37.62, 2p = sub 17 + connection 10.62 + middle
  leg 3.33 + caps 6.67) → Seat & Finish 13.25. Total labor 92.2, cycle ~33.3,
  ~12.6/day.
**Two lines, always shown (2026-06):** the two lines run in parallel IRL on two
decks split by the central divider, sharing the one elevator (the floor was
already built as two decks + a painted middle line; the right deck was empty).
The view ALWAYS shows BOTH: Meritage on the LEFT deck, Sola on the RIGHT deck
(fixed `DECKPOS`). The `✎ Editing` toggle only changes which line is **active** —
the active line runs the full engine (editable times, schedule, readouts/panels,
and it's the one that simulates when you press Play); the OTHER line is drawn by
`buildSecondLine` as a static staged line (same meshes/look, neutral LEDs, no
animation) for context. So pressing Play runs only the active line. `PROD` is
built at load from `ACTIVE` (localStorage `m3d_product` = meritage|sola): `pos`/
`stations` = active line on its deck, `second:{pos,stations}` = other line.
Single-line full-width view no longer exists (both decks are always populated).
Same one file/app (`Meritage_3D_Line.html`) — not separate programs. To give the
inactive line a live editable sim too would need the per-line schedule/update
refactor (deferred; only one line plays by design per the engineer).

- **Sola modeling caveats (flag before trusting):** Seat Support Frame Assembly
  and Frame Prep have NO measured time anywhere → OMITTED (not invented).
  Connector plates really depend on rivet+prep but are modeled as a parallel
  feeder (line-level simplification — the engine is feeders→FA, not a full DAG).
  Lumping the whole frame chain into one FA station loses the sequential detail.
  If the engineer wants Sola as a true sequential flow line, generalize
  schedule/update to a flow-shop (unit moves bench→bench) — bigger rewrite.

Rebuild after editing the entry: `client/node_modules/.bin/esbuild
standalone/Meritage_3D_Line.entry.js --bundle --format=iife --minify
--alias:three=<abs>/client/node_modules/three` → splice the IIFE into the
`<script>` of the HTML scaffold (lines before `<script>` are the hand-authored
DOM/CSS; everything after is the bundle). No npm build script wired for it.

## 3D Floor presentation restyle (2026-06)

The engineer wants the 3D Floor boss-presentable: "simple… super good for
visualization… nothing childish." Also: **the real floor has 8 stations.**
Restyle decisions: steps are grouped onto ≤8 benches in ONE straight row
along a yellow-taped aisle (saved Line Designer layout `sw-line-<sku>` wins,
else contiguous auto-balance by build order); station signs are white cards
with a navy STATION n header + total time + up to 3 step lines; status =
slim andon LED strip on the bench front edge (green active / blue done /
amber no-time) instead of the floor torus ring; muted palette (single navy
trim, steel-grey racking, polished light concrete, soft daylight, fill
light); racks only far behind the line; crew tags are white cards with a
color spine. Sim is still per-step — stations aggregate their steps' unit
instances for LED/progress; `ctx.stepInfo` maps stepId→{seq,name,station}
for the crew ticker. A Higgsfield static render (job
17804648-9f8f-4fdb-8b10-5b8586012900) exists as a style reference; the
engineer chose restyling the interactive floor over static images. Floor
photos from the earlier session are NOT in the repo — ask the user to
re-share if needed for reference-matched renders.

## Workflows + optimizer (2026-06)

A **Workflow** is a named, saved process plan for a product: the precedence
snapshot (which steps must precede others, stored by step *sequence* so it
survives id changes) + optional generated line design + metrics. Backed by a
real store (`state.workflows` in localApi, `workflows` table on the server) —
GET/POST/PUT/DELETE + POST `/apply` (re-applies the saved precedence to the
SKU's steps). Included in backup/restore automatically.

The **optimizer** (`shared/optimize.js` → `optimizeLine`) turns a process into
a realistic assembly line: topological order of the steps, DP contiguous
partition into stations (contiguous over a topo order guarantees precedence is
respected — every prerequisite lands in an earlier-or-same station), then
spends the spare crew on whichever station's bottleneck it shrinks most (same
diminishing-returns help model as the Line Designer / sim: 2 people ≈ 1.6× via
`help_seconds` or default base×0.62, capped 3/station). It only adds people who
actually cut the bottleneck, so it can report fewer operators than offered.
Goal = max throughput (min cycle time) but realistic (operators stay at one
station; a unit flows station→station; output = slowest station). The
Workflows page runs it, shows cycle/units-per-shift/operators/balance +
per-station breakdown, and "Open in Line Designer to tweak" writes the result
into `localStorage['sw-line-<sku>']`. Engineer's stated goal: "most throughput
but also realistic"; optimizer style: generate + let me tweak.

## Overlapping operations / partial handoff (2026-06)

Engineer: "once a couple of connectors are ready the next person can start."
Modeled as a per-edge **overlap**: each dependent step may carry
`dep_overlap: {prereqStepId: fraction in (0,1)}` = how much of the prerequisite
must be done before this step may start (default/absent = 1 = must fully
finish). Set on the **Process Map**: each arrow has an "after 100%" pill →
menu (100/75/50/25/10%); a partial edge draws dashed. Stored/pruned in both
backends alongside depends_on (server col `dep_overlap TEXT`). Honored by:
- `precedence.criticalPath`: es(B)=max(es(d)+ov·dur(d)); ef(B)=max(es+dur,
  ef(d) for partial d) so B can't finish before a partial supplier — overlap
  shrinks the critical path.
- `simulate.simulateBuild`: a dep is ready when done OR (active AND
  1−remaining/total ≥ ov); event loop also stops at threshold crossings so the
  downstream starts exactly then. Needs ≥2 operators to actually overlap (one
  person can't run both). 3D Floor passes `dep_overlap` through `simSteps`.
NOT yet in workflow snapshots or the optimizer (line balance is station-level;
overlap is cross-station start timing). schedule.js is unused.

**Consumer-side overlap (`dep_need_at`, 2026-06):** complements producer-side.
Per dependent step, `dep_need_at: {prereqId: fraction}` = the point INTO the
dependent at which the prerequisite is actually needed (0 = at the start =
classic; 0.9 = "only needed for the last 10%"). Engineer example: "legs are
only needed for the last 10% of seat-frame assembly." Combined start rule:
es(B) = max over deps of (ready(d) − need_at·dur(B)), where ready(d) = full
finish (or producer fraction if overlap<1). Set on the Process Map arrow popover
(second section "only needed for… the last X%"); pill shows "needed: last X%".
Honored by criticalPath and simulateLine (station-level, min need_at across
crossing edges: start[u][k] ≥ finish[u][k'] − need_at·stime[k]). Stored/pruned
in both backends (server col `dep_need_at TEXT`). Free-flow sim does NOT honor
it yet (only producer overlap).

## Layout tester (2026-06)

`Layout.jsx` — top-down floor plan (metres, FW30×FH17) to test physical
arrangements. Drag the ≤8 stations (grouped via the same saved-line /
auto-balance logic as the 3D floor) and one or more **parts carts**. Metrics:
total product flow path (1→n centre-to-centre), longest single hop (flagged
red >6 m), cart→station total (each station fed by its nearest cart), farthest
station from a cart (flagged >7 m). Presets: Single row / Two rows
(serpentine) / U-shape / Cell. Saved per product `sw-layout-<sku>`
{stations:[{x,y}], carts:[{x,y}]}. Pure SVG + pointer drag, no deps.
NOT yet wired to drive the 3D floor's bench positions (3D still lays one row);
possible future link.

## Line mode vs free-flow simulation (2026-06)

The 3D Floor now has TWO simulations, toggled top-right (default **Line**):
- **Line** (`shared/simulateLine.js`): flow-shop. Operators pinned to the ≤8
  stations (same grouping as benches: saved Line Designer layout else
  auto-balance; per-station worker counts from the saved `workers` map). One
  unit per station; unit u starts station k at max(finish[u][k-1],
  finish[u-1][k]); cycle time = slowest station; units/shift = shift/cycle.
  Matches the Line Designer / Workflow optimizer model. Operators stand at
  `ctx.stationSpots`; assignment panel + auto-helping hidden in this mode.
- **Free-flow** (`simulate.js`, the original): operators roam and pull ready
  work across all units; honors precedence + overlap; uses the own/help panel.
Line mode is **precedence-driven, not station-order-driven**: each station's
upstream dependencies are derived from its steps' depends_on, and a station
starts unit u once it's free AND its upstream stations finished unit u. So a
prerequisite-free station (seat-support frame, legs, connector prep) runs
flat-out from t=0 stockpiling sub-assemblies (engineer 2026-06: "they should be
doing that 24/7"). Stations are computed in topological order; cycle time =
bottleneck station. A compare strip shows both (makespan, units/shift, util,
ops) side by side. `activeSim` (mode-selected) drives the 3D playback,
stats, workload bars, slider. NOTE: free-flow has no single-bench capacity
(can over-parallelize) and honors overlap; line mode enforces one-unit-per-
station but does NOT yet honor cross-station overlap — two different models on
purpose, kept for comparison.

## Metric clarity + data fixes (2026-06)

Engineer flagged "Meritage shows 2h too long; Sola varies weirdly." Root cause
= the headline was **total hands-on labor** (sum of steps = person-time), not
**build time** (critical path = wall-clock with a crew). Meritage: 4:24 labor
vs **2:05 build**. Fix: Dashboard now leads with build time (critical path,
honoring overlap/need_at), labels the sum as "total hands-on labor (person-
time)". Meritage step data is COMPLETE (only PPE blank); its precedence is
inferred so build time depends on it — verify.
Sola variance was data gaps: **Right Arm's Frame Sub-Assembly had no time** →
filled to 19:00 (1140s, per its own "8:30+10:30" note); seed updated +
`state.dataFix_v1` migration fills blank seeded step own-times from seed
(never overwrites user values). STILL MISSING on all Solas: **Seat Support
Frame Assembly** and **Frame Prep** (no time anywhere — need a real
measurement; not invented). Only legit Sola config variance is connector count
(14/16/18 → Connector Pre 11:40/13:20/15:00).

## Open items

- Meritage: not yet modeled — waiting on a readable copy (app Export Excel →
  Drive, or picture-compressed resave).
- Both-arms frame sub-assembly variant: unknown.
- Item #13 (beam) rivnut rate: assumed = item #14's 0.531 min.
- Right Arm frame sub-assembly time is in description text (8:30 + 10:30)
  but the step's stored time needs confirming (19:00 assumed in seed? check).
- Sizes for Right Arm rivnut applied same as No-Arms (engineer's rule is
  config-independent) — confirm.
