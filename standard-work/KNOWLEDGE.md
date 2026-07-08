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

## Meritage 3D Line standalone (2026-06)

`standalone/Meritage_3D_Line.entry.js` (bundled into `Meritage_3D_Line.html`)
is a self-contained three.js line model, SEPARATE from the SKU DB — its station
data is hand-authored, not synced. It is the single **Meritage** line: 5 feeders
(Connectors 19.25, Arms 64×2p, Back 43.5, Trellis 22.5, Seat 47) → Full Assembly
(58, 2p) → Cushions & Pack (18). Total labor 272.3, cycle ~48.7 (with seeded help
arrows), ~8.6/day.

NOTE: an earlier session built a two-line (Meritage + Sola) experiment here —
a product toggle, a "Both" view, and a shared connectors table. The engineer
rejected it as over-built; it was REVERTED to the plain Meritage app. Do not
re-add Sola/two-line machinery unless asked. (Sola SWI data still lives in
`shared/seedData.js` and the Sola-rules sections above.)

**Add station + side tables (2026-06):** a header **＋ Add station** button drops
an extra bench (`addStation`, tracked in `extraStations`, ids `x1,x2,…`). Added
stations are INDEPENDENT — kept OUT of `ST`, so `schedule()`/`update()` never
touch them; they do NOT affect Meritage's labor/cycle/bottleneck. Included in
`stList()` so they're draggable in Edit-layout (default drop is the open area on
the right/"other" side at x≈16). Persisted via `o.__extras` (recreated in
`loadLayout`). The `#times` panel now has TWO editable step/time tables:
"MERITAGE — station steps" (`stepsHost` = ST + added stations on the Meritage
side) and "OTHER SIDE — station steps" (`stepsHost2` = added stations on the
other side). Side = `sideOf(x)` vs `DIVIDER_X` (= `DECK.x1`, the painted middle
line); dragging a station across the line re-routes it between tables (drag-end
calls `renderTimes()`). Edits use `getAny`/`recalcAny`/`afterEdit` — ST edits
re-pace the line, added-station edits just update the bench label (no schedule).
Camera: `controls.enablePan + screenSpacePanning`; in Edit mode right/middle-drag
pans (left = drag stations), and `contextmenu` is suppressed on the canvas.

**Draggable windows + shared connector station (2026-06):** the floating panels
(Station times, Idle/day, Help paths, Task chart, Measure) are draggable by their
title bar (CSS `cursor:move` + a `pointerdown` delegation IIFE near the end of
the entry; positions persist in `localStorage['m3d_panel_<id>']`).
**Surrounding warehouse areas (2026-06):** `buildSurroundings()` (an IIFE that
adds a `surroundings` group to `level2`) draws the peripheral zones from the
plant floor plan AROUND the two untouched line decks: an extended concrete
slab, then color-coded translucent zone pads with flat floor labels — Pallet
Staging, Upholstery Racks, Forklift Access lanes (corners), FG Staging, X
Staging, Back Rest Rack, Cart Staging, Sola Cart Staging, Sola Pallets — plus
representative objects (steel racks, pallets w/ boxes, carts w/ wheels, 2 turn
tables, a slide gate). Layout: BACK band z≈−12, FRONT band z≈12, LEFT x≈−9,
RIGHT x≈23 (decks span x[−5.1,19.28] z[±9.14], divider x=7.09). Toggle via the
injected `🏭 Areas` button (`surroundings.visible`).

EDITABLE (2026-06 update): areas are now draggable in Edit Layout and
persisted. Each area is `{g,kind,x,z,rot}` in `areas[]`, built from an
`AREA_KINDS` registry (kind → builder that draws pad+label+objects at the group
origin). `addArea/clearAreas/restoreAreas` + `defaultAreas()` (from
`AREA_DEFAULTS`). `fixtureList()` includes areas (kind `'area'`) when
`surroundings.visible`, so the existing dragFix path moves them and right-click
deletes them. Persisted as `__areas` = `[[kind,x,z,rot],…]` in the working
layout AND named layouts; a layout's `__areas` REPLACES the defaults. The
dragFix clamp and the edit grid were widened to the whole floor
(x[−12.5,26.5]; grid [−12,26]×[−14.5,14.5]).

RAILINGS REMOVED (2026-06): the deck guard-railings (`railing()` calls) were
deleted — the two line decks now sit on the open warehouse floor.

FLOOR LOOK (2026-06): the surrounding slab uses a canvas `concreteTex()`
(speckle + expansion-joint tile borders, repeat-wrapped) plus painted yellow
aisle safety lines, so it reads as a real sealed concrete floor. The line decks
keep their original metallic surface.

TRUE-SCALE PASS (2026-07): all surrounding parts sized from the plan/reality:
pallets 48"×40", shop carts 4'×2.5', 6×1.5 racks exactly 6'×1.5', upholstery
racks 6'×2'×5'7" tall, Back Rest Rack 6'×2.5' (per plan), turn table 5' dia,
slide gate true 6' opening + 8' travel rail (`aRack` gained an `h` height
param). Crew figures scaled to ~5'9" (`makeCrewFigure` `g.scale.set(1.06,
1.17, 1.06)`) so operators read correctly against the 38" benches.
Also (2026-07, per engineer): elevator cab = 3 yd wide × 8' deep (`makeElevator`
`SX/SZ` half-dims replaced the old 2.8 m square) and every bench's anti-fatigue
mat = exactly 8' × 1 yd (`makeBench`). NOTE: `YARD` was moved next to `FT` near
the top of the entry — `makeBench` now references it at init, and the old
declaration at ~line 1467 would have been a TDZ error.

FLOOR 35x21 (2026-07, per engineer): the ENTIRE floor is now exactly 35 yd x
21 yd (`FLOOR_W/D/X0/X1/Z0/Z1` consts, x≈−8.91..23.09, z≈±9.60), a tight
envelope around the two 40'x60' decks — side strips ≈12.5' wide, front/back
slivers only ≈0.45 yd. `AREA_DEFAULTS` were re-laid to fit: LEFT strip
(forklift, pallets, upholstery(rot), solaCart(rot)), RIGHT strip (fg,
turntable, xstaging, backrest, solaPallets, cart), SOUTH edge (rackRow(rot) +
gate). Zone pads shrunk to ≤3.6 m to fit the strips. Grid + dragFix clamps
follow the FLOOR_ consts. Saved layouts with old `__areas` coords will restore
those areas OFF the new floor — user drags them back on.

CART AISLE (2026-07): each cart route renders a 5'-wide lane (`AISLE_W`,
`updateAisle(mesh, pts)` builds a triangle-strip ribbon with rounded joints;
meshes `aisleMesh`/`aisleMesh2` on level2). Shown ONLY in Edit Layout (toggled
in `setEditing`) as a blue floor tint (opacity 0.5 after "more discolored"
feedback), updated live from `refreshPath()`/`refreshCart2Feed()`.

AISLE LOOP + RETURN WAYPOINTS (2026-07): the aisle now LOOPS back —
elevator → wps → cart spot → `returnWps`/`returnWps2` → elevator. The return
leg draws as an amber dashed line (`returnLine`/`returnLine2`) with amber
draggable dots (userData cart `'ret'`/`'ret2'`, same drag/right-click-delete
plumbing as normal waypoints, shared wpGroup visibility). The injected
`⟲ Return wp` button adds a return waypoint for the last-selected cart.
Persisted as `__rwps`/`__rwps2` (working) and `rwps`/`rwps2` (named layouts).
The SIM is untouched — carts still animate only on the delivery leg; the
return leg is planning/visual ("future paths").

DBL-CLICK WAYPOINTS (2026-07): in Edit Layout, double-clicking ON a lane
inserts a waypoint exactly there, into the correct position in the sequence.
A `dblclick` listener on the canvas checks all four legs (cart/cart2 delivery
+ return) with point-to-segment distance (`segClosest`), threshold 4 m;
near-ties keep the earlier leg so DELIVERY beats RETURN where the two lanes
overlap (e.g. before any waypoints exist — they're the same line then).
Segment index i = splice index into that leg's waypoint array. The edit hint
text is appended via JS (the hint lives in the frozen HTML head).

DBL-CLICK EDITING (2026-07): in the Task chart, the red takt figure
(`#taktVal`) and the day length (`#dayHrsVal`) are double-click editable
(generic `dblEdit(id, getCur, apply)` swaps in an input; Enter/blur commits,
Esc cancels). Typing a takt in MINUTES back-computes `taktDemand = dayMin /
takt` (now a float — inputs parseFloat) and re-renders the charts live.

CART SPOTS TRUE SIZE (2026-07): the two materials-cart pads were 2.7 m (≈9')
squares — shrunk to true 5'x3' taped spots (`CPW/CPD`), and the animated parts
carts rescaled from ×1.4 (4.8'x3.1') to a true 4'x2.5' footprint
(`scale.set(1.17,1.2,1.12)`). These were the biggest "cramped vs paper"
offenders from the scale audit.

FLOOR = CAD 1:1 (2026-07): measured the drawing at 27.05 px/ft (lift 8x12,
tables 8x4/8x3/6x1.5 all confirm to 0.00'), so the interior is 105' x 64'.
Floor changed from 35yd x 21yd (105x63) to `105*FT x 64*FT` — 1' deeper — so
the CAD overlay (mapped onto FLOOR_W x FLOOR_D) is exactly 1:1: anything N
yards on the plan is N yards in the sim. All FLOOR_-derived things (areas,
grid, stairs, clamps) follow automatically.

MY-STATION MARKERS (2026-07): with the CAD on, `rebuildMyMarks()` draws a
bright-teal fill+outline (renderOrder 902/903, depthTest off) over each of MY
stations' bench footprints (`stationFootprint` = 8x4, fa 8x5, arms double
16x4) so they're obvious vs the black CAD tables at any opacity. Rebuilt on
overlay toggle, station drag (pointermove), and add/delete. `#cadBox` has a
"highlight your stations" checkbox (`myMarksOn`) to turn the teal off entirely
and see just the CAD, plus a separate opacity slider for the marks
(`MY_MARK_FILL.opacity`) — independent of the CAD-plan opacity slider.

THREE-SECTION TIMES PANEL (2026-07): the Edit-times panel renders ONE host
with three colour-coded sections — MERITAGE (navy), SOLA (green), CANYON CREW
(brown) — assigned by floor slice via `sectionOf(x)`: < DIVIDER_X (7.09) =
meritage, < CANYON_X (17.6, section line 4) = sola, else canyon. Dragging a
table across a blue line re-files it live. Each section header shows count +
total minutes; each section has a "＋ Add station to X" button
(`addStationInSection` — prompts a name, drops the bench in that slice,
enters edit mode); every added station card has a 🗑 remove button (core
Meritage ST stations have none). `stepsHost2` is a no-op shim. The right-side
top data panel still aggregates sola+canyon ("SOLA + CANYON").

HARD RULE — NEVER MUTATE LOADED LAYOUTS, ABSOLUTE (2026-07, learned THREE
times): (1) a migration deleted the engineer's Sola line; (2) additive
seeding polluted layouts and saves; (3) an id-heuristic "clone cleanup"
(remove s-ids, keep x-ids) deleted the engineer's REDESIGNED line — they had
rebuilt their design on the restored s-id stations, so the heuristic was
exactly backwards. NO automated edit of user layout data is ever safe. Not
migrations, not seeds, not cleanups, not "provably safe" ones. Loaded
layouts are read-only truth; only the user edits them. Defaults appear only
on a completely virgin open (no layout anywhere).

HARD RULE — NEVER MUTATE LOADED LAYOUTS (2026-07, learned TWICE): the canyon
"migration" deleted the engineer's Sola stations; then additive seeding
polluted layouts and saves with seeded stations, and the engineer reported
"even the saved ones are cooked". FINAL STATE: `hadSavedLayout` flag in
loadLayout; the default Sola+Canyon lines seed ONLY when NO layout exists
anywhere (no localStorage, no baked __M3D_LAYOUT__, zero extras). Loading any
layout — working or named — shows exactly its contents. Any future
"upgrade"/"migration" idea for user layout data: DON'T. Offer a button or
instructions instead.

THREE LINES (2026-07 — after a hard lesson): the plant has Meritage (left),
SOLA (middle slices), and CANYON CREW (rightmost slice). An earlier
"migration" DELETED the engineer's Sola stations assuming Canyon replaced
them — WRONG, and it made the engineer justifiably angry. NEVER delete user
stations in a migration. Current state: `seedLine(defs, idPrefix)` is
ADDITIVE-ONLY. `CANYON_LINE` (ids c1..c4, x≈20.4 column in the rightmost
slice) = the ASSEMBLY portion per the engineer's SWI reference combination
sheet (99 min, 4 operators): SWI 10–16 = 30', 17–22 = 26.5', 23–29 = 26.5',
30–35 = 16' (sheet also lists a 3-op split 10–18/19–24/25–35 ≈ 37/38/24).
Reference CSV had times but no step text — descriptions mapped from the SWI
doc where numbering matched, otherwise "SWI step N". Old 5-station canyon
SEEDS (exact old default names) are auto-upgraded on load; renamed/custom
stations are never touched. `SOLA_LINE` (ids s1..s5, middle, x 7.8–11.3 — MUST be
east of the deck divider x=7.09 or renderSolaData counts them as Meritage) =
the engineer's five stations (Rivet Nuts 33.1 / Frame 38.2 / trellis 33 /
final installation 28.4 / cushions_ship 36 = 168.7), restored from their
screenshot after the deletion. Seeding: canyon added when no /^canyon /
station exists; sola added when none of its five names exist. The app still
has only TWO sim sides — the right-side panel/charts AGGREGATE Sola+Canyon
(renamed "SOLA + CANYON" everywhere); true 3-line separation (own
panels/charts/sim per line) is future work.

BOX STORAGE ZONE (2026-07): the shipped-box stack area is a drawable zone —
`boxZone {x,z,w,d}` rendered by `refreshBoxZone()` (translucent pad + dashed
edge + "BOX STORAGE" label + an orange SE corner handle shown only in edit).
Drag the body to move (a `boxzone` entry in fixtureList), drag the corner to
resize (`boxResizing` branch in the pointer handlers, NW corner pinned,
snapped, clamped to the floor). Boxes re-stack inside on every change:
Meritage fills rows from the NORTH end, Sola from the SOUTH (cols = w/1.9,
rows = d/1.15, up to 4 levels of 0.74 m). Persisted as `__boxZone=[x,z,w,d]`
in the working layout and `boxZone` in named layouts; undo covers it via
saveLayout.

GRAPHICS PASS — TRIED AND REVERTED (2026-07): an environment-map lighting
pass (PMREM RoomEnvironment ambient, 4096 shadow map, gradient sky, exposure
retune) was built, shipped, and the engineer said "nope, go back, way better
before" — the whole pass was reverted to the prior light rig (hemi 1.0, sun
0.85, 2048 shadows, flat 0xe9edf1 background). Do NOT re-attempt an env-map
look without being asked; the engineer prefers the flatter, softer render.

CAD OVERLAY (2026-07): `📐 CAD` button (Edit-Layout only) lays the actual
plant drawing flat on the floor, scaled 1:1, to compare the model to the plan.
The PDF was rasterized (PyMuPDF), cropped to the interior walls (PDF x
116..2960 / y 208..1940 → aspect 1.642 == floor 104/63.3), white→transparent,
downscaled, base64'd into `window.__CAD_OVERLAY__` — injected as a `<script>`
appended to the head scaffold `m3d_head.html` (NOT entry.js; ~400 KB, so the
built HTML is ~1 MB now). `buildCadOverlay()` makes a flat PlaneGeometry sized
`FLOOR_W x FLOOR_D` at y=0.2 with a MeshBasicMaterial (opacity 0.55). The
image is the SOLID white-background crop (not white→transparent) + `depthTest
false` + `renderOrder 900`, so at opacity 1.0 the paper fully OCCLUDES the
model ("only see the CAD"); lower opacity = tracing-paper blend. Toggle
`setCadOverlay`; a floating `#cadBox` has the opacity slider; SHIFT-drag (or
right-drag) on the floor nudges the plane to align (`cadDragging` in the
pointer handlers, before station picking). Auto-hidden on leaving edit mode.

2D VIEW (2026-07): `▦ 2D` button (injected after #top). NOT a separate
camera — `set2D(on)` turns the existing perspective camera into a telephoto
plan view (fov 5° from ~260 m above the floor centre), so every raycast,
drag, control, and panel keeps working unchanged in BOTH normal and edit
mode. Rotate is disabled in 2D (pan+zoom only); `scene.fog` is stashed and
NULLED while 2D is on (at 260 m the 60–140 fog would white the scene out) and
restored on exit. `setEditing`'s camera repositioning is skipped while
`is2D`; the Angle/Top view buttons call `set2D(false)` first.

STATIONS ANYWHERE (2026-07): station + waypoint drag clamps widened from the
two decks to the WHOLE floor (`FLOOR_X0/X1/Z0/Z1` ± margins) — tables can now
be dragged onto the side strips beside the lines. `POS.con` default moved from
x=−12 (off the shrunken floor) to −7.5. GOTCHA fixed with it: when a station
overlaps a staging area, `pickFixture` used to steal the grab (fixtures are
checked before stations on pointerdown); it now also raycasts stations and
returns null when a station is closer (+0.05 bias), so the bench wins.

EVERYTHING EDITABLE (2026-07, "don't discriminate"): the stairs and the four
section lines were converted from fixed scenery into AREA kinds (`stairs`,
`sline1..4` in `AREA_KINDS`; builders `buildStairsInto(g)` / `slineInto(g,
pl)` draw RELATIVE to the group origin — stairs anchored at the top-landing
corner, slines at their first point). So they now drag / right-click delete /
persist / travel exactly like every other area. Each sline carries a faint
0.7 m-wide pick-ribbon under the dashed line so it's grabbable. dragFix clamp
widened to FLOOR_X0−1.2 so the stairs can return to their off-edge home.
CAVEAT: layouts saved before this have `__areas` without stairs/slines — on
load those disappear (a layout's `__areas` REPLACES defaults); re-add via
Undo/defaults or re-save.

SECTION LINES EXACT + IMMOVABLE (2026-07, final state): the sline polylines
are RE-DERIVED with the exact same wall→floor transform the CAD overlay uses
(PDF pts 116..2960 / 208..1940 → FLOOR_W×FLOOR_D), so line and drawing
coincide by construction. Per engineer ("the lines need to not be moveable"),
they are NO LONGER areas: a fixed `sectionGroup` in `surroundings` draws them
(`slineInto` lost its grab-ribbon), they are not draggable/deletable/persisted,
and `restoreAreas` DROPS any `sline*` entries found in old saves. The stairs
remain an editable area (with add-if-missing migration + 0.75 m home snap).
While the CAD is shown, `setSlinesOnTop(true)` (now traversing sectionGroup)
sets depthTest=false / renderOrder 905 so the lines draw ABOVE the sheet.
INTENT (engineer): the 4 lines cut the floor into 5 slices — leftmost (~19')
= storage, one production line in each of the other four (~27/23/16/18').

SECTION LINES (2026-07): the plan's four dashed cyan section dividers were
extracted from the PDF's VECTOR data (PyMuPDF `page.get_drawings()`, color
(0,1,1), clustered dashes → stepped polylines; the two stairs are also cyan
and were excluded) and mapped 1:1 onto the floor (walls at PDF x 116..2960 /
y 208..1940 → interior 104'x63.3', anchoring scale 27.35 px/ft — confirms the
35x21 yd floor). `SECTION_LINES` polylines → dashed cyan THREE.Line group in
`surroundings`. Positions (world x): ~−3.1/−3.7 stepped, ~4.9/5.2, ~11.8→13.6
with jogs, ~17.9/17.6. NOTE these do NOT align with the current two-deck
split — they cut through the decks; that's the real plan's sectioning, shown
for the engineer to evaluate before any re-layout.

DIVIDER (2026-07): the green "crossing" marker on the middle yellow divider
was removed (connector station is no longer shared between lines) —
`rebuildDivider` now draws a plain continuous dashed line.

STAIRS (2026-07): `buildStairs()` IIFE (in `surroundings`, so the 🏭 Areas
button hides it too) — a 4'-wide industrial straight flight at the floor's
west edge (channel x≈−13.65, outside the slab at x0=−12.91), 32 treads at
7.3"/11" rise-run, descending from a guard-railed top landing at z≈1.4–3.0
(flush with the slab top, immediately LEFT of the lift at x=−6.7, z=2) down to
the ground at z≈11. Stringers/handrails are boxes rotated by
`atan2(rise,run)` about x. Fixed scenery — not draggable, not in layouts.

**Printable line-plan report (2026-06):** a `📄 Report` button (injected next to
Import via JS, since the toolbar lives in the frozen HTML head) opens a
self-contained printable page in a new tab (`buildReportHTML()` → Blob URL →
`window.open`, falls back to download if the popup is blocked). It curates the
CURRENT layout for the assembly-line lead: per-line KPIs (total labor, cycle,
capacity, takt, bottleneck), the build sequence (Meritage = 5 parallel
sub-assemblies → Full Assembly → Pack; Sola = numbered single-piece flow via
`orderedSola()`), each station's people/total/net-per-unit and its ordered
steps with times, and the help paths. Uses the live `effNet`/`helpInto`/
`bottleneckInfo` so numbers match the app. Print → Save as PDF to share.

**Independent added lines / Canyon animation (2026-07):** the added ('other')
stations no longer run as one serial flow-shop. `solaComponents()` splits them
into connected components of the flow graph (union-find, then per-group topo
order, sorted L→R by first-station x), and `buildSolaSched()` builds ONE
schedule per component into `solaScheds` (Sola, Canyon Crew, …). `buildSolaTravel`
+ `solaUpdate` iterate `solaScheds`, so each line animates on the shared `Ts`
clock with its own LED wave / operators / traveling parts — no cross-floor jump
from Sola's last station to Canyon's first. Stale flow edges pointing at deleted
stations (e.g. legacy `c1..c4`) are filtered out (both endpoints must be live),
so NO layout mutation is needed to fix an old saved layout. `solaSched` kept as
`solaScheds[0]` for legacy refs; `orderedSola()` now dead but left in place.

**Undo (2026-07):** `saveLayout()` pushes the previous `__workingLayout` onto
`undoStack` (cap 50) whenever the JSON differs — since every mutation already
calls `saveLayout`, undo needs no per-action hooks. `undoLayout()` (↩ Undo
button, injected; or Ctrl/Cmd+Z outside text inputs) pops and re-applies via
`clearExtras()` + `helpArrows=[]` (because `applyWorkingLayout` skips an empty
`__help`) + `applyWorkingLayout(prev)`, then re-schedules both lines.
`undoApplying` guards against re-pushing during an undo. A baseline
`__workingLayout = buildWorkingLayout()` is captured right after the init
`loadLayout()` so the FIRST edit is undoable (the push is skipped while
`__workingLayout` is `{}`). Import records an undo point explicitly.

**Report upgrades (2026-07):** the report now opens with a **Floor Plan**
section — `captureFloorMap()` renders the scene once with a temporary
top-down OrthographicCamera fitted to the whole floor (aspect-corrected to the
canvas) and embeds `renderer.domElement.toDataURL()` as an `<img>`; the main
loop redraws with the real camera next frame, so nothing is disturbed. Also
added an **Operators** headcount KPI per line and a walk-time note (speed +
trips/unit) when walk time is on.

**Rotated-table crew bug (2026-06):** operators appeared on the OPPOSITE side
from the anti-fatigue mat whenever a table was rotated 90°/270° ("Rotate
table"). Cause: the bench (and its mat, a child mesh) rotate with THREE's
Y-rotation `x'=x·cos+z·sin, z'=-x·sin+z·cos`, but `placeStation` rotated the
crew offset with the opposite-handed math convention (`rx=bdx·cs−bdz·sn`), so
the two diverged for any non-0/180° angle (they matched at 0/180°, which hid
it). Fixed to `rx=bdx·cs+bdz·sn, rz=bdz·cs−bdx·sn` so crew tracks the mat at
every angle. Single-op stations sit dead-center on the mat; multi-op stations
spread along the full-width mat.

**Resizable windows (2026-06):** the same IIFE adds a bottom-right corner grip
(20px hit-zone; a `◢` glyph injected via a JS `<style>`, cursor hint on hover).
Dragging it sets `el.style.zoom` (0.55–2.6) so the WHOLE window scales — box +
all the px-based text together (simplest way to scale px children uniformly).
GOTCHA: `zoom` also scales the element's own `left`/`top`, so drag/clamp deltas
are in visual px and must be divided by `zoom` to move in offset px;
`clampOnScreen()` keeps the window fully in the viewport. Persisted as
`{left,top,zoom}` in the same `m3d_panel_<id>` key. The SHARED connector station idea was REMOVED (engineer, 2026-06): CONNECTORS is
just a normal Meritage feeder again (`POS.con` back on the left feeder row, shown
in the Meritage table). No middle-line "connector lady" bench, no "Shared —
connector station" table, no per-side connector assignment. Sola connectors, if
needed, are their own Sola-side station.

NEXT STEP (planned): make Meritage-side added stations join the sim too, and let
the connector lady's other-side load feed an actual other-side line.

**Help paths on the Sola side (2026-06):** help arrows used to crash when drawn
on added/Sola stations — `eff(id)` did `get(id).t` and `get` only searches
Meritage `ST`, so the 2nd click threw and no arrow appeared. Fixed: `eff` and
`stName` use `getAny` (ST or added). Added side-aware `solaCyc()`/`cycOf()`/
`availIdleAny()` so the default help-minutes come from the correct line's
cycle. `buildSolaSched()` now paces with `effNet(id)` (per-unit time minus help
received), so a Sola help arrow drops the helped station's time and raises Sola
capacity; `renderSolaData()` (top panel) likewise uses `effNet`. The Help-paths
panel's Sola branch now lists/edits/deletes Sola help arrows instead of showing
a "not modeled" note. Help model is the same as Meritage: the helper pays only
out of idle (helper station time unchanged), the helped station drops by
helpMin. All help mutations call `buildSolaSched()`+`renderSolaData()` too.

Rebuild after editing the entry: `client/node_modules/.bin/esbuild
standalone/Meritage_3D_Line.entry.js --bundle --format=iife --minify
--alias:three=<abs>/client/node_modules/three` → splice the IIFE into the
`<script>` of the HTML scaffold (lines before `<script>` are the hand-authored
DOM/CSS; everything after is the bundle). No npm build script wired for it.

**Save layouts INTO the app (2026-06):** a static HTML file can't self-modify,
so layouts that should "travel between computers" are baked into a downloaded
COPY. `loadLayout`/`readLayouts` fall back to globals `window.__M3D_LAYOUT__`
(working) and `window.__M3D_LAYOUTS__` (named) when localStorage is empty —
`readLayouts()` = `Object.assign({}, builtinLayouts(), localStorage)` so baked
layouts merge under this browser's. The **💾 Save into app** button (`#bakeApp`)
captures `__ORIGINAL_HTML` (`'<!DOCTYPE html>\n' + outerHTML`, taken at module
load) and injects `<script id="m3dLayouts">window.__M3D_LAYOUT__=…;
window.__M3D_LAYOUTS__=…;</script>` before `</head>`, then downloads it.
GOTCHA (cost a long debug): the inject marker tag and the strip-regex that
removes a previously-baked inject MUST be built from fragments at runtime
(`const LT = String.fromCharCode(60)` for `<`), NOT as plain literals. Plain
literals fold into the bundle, so `__ORIGINAL_HTML` (the serialized document,
which contains this very bundle) carries a literal `<script id="m3dLayouts">`,
and the non-greedy strip-regex then matches INSIDE the bundle and deletes
everything up to the bundle's real closing `</script>` — the baked copy's
bundle is truncated and never runs (symptom: opens with an empty layout
dropdown and zero console output). JSON data is `<`-escaped for the same
reason. Re-baking is idempotent (strip-regex removes the old inject first).

GOTCHA #2 (Sola side missing in saved/baked layouts, 2026-06): named layouts
(`snapshot`/`applyLayout`) originally captured only Meritage `ST` — the Sola
side (added stations `extraStations` + `flowArrows`) was dropped, so a baked
named layout opened on another machine showed "only the chart" (the Sola data
panel renders from defaults) and no Sola benches. Fixed with shared helpers
`extraSnap()` / `clearExtras()` / `restoreExtras()` / `restoreFlow()` used by
BOTH the working layout (`saveLayout`/`loadLayout`) and named layouts
(`snapshot`/`applyLayout`). `extraSnap` stores full per-station detail
(`{id,name,x,z,t,rot,ppl,steps}`) — the old working-layout `__extras` only
stored `{id,name,x,z,t}`, losing people/step breakdown. `applyLayout` only
clears+restores the Sola side when `L.extras` is an array, so applying a
LEGACY (pre-fix) named layout doesn't wipe the current Sola line. NOTE: named
layouts saved before this fix can't be recovered — rebuild the Sola line (it
survives in the working layout) and re-save those layouts.

GOTCHA #3 (bake captured nothing on Mac/Safari, 2026-06): the bake button and
the export button read the working layout back out of `localStorage`
(`getItem(LAYOUT_KEY)`). Safari (and file:// pages generally) often REFUSE to
persist localStorage, so `setItem` throws (silently caught) and the read
returns empty — bake produced a copy with an empty working layout even though
the line was on screen. Fixed: `buildWorkingLayout()` builds the object from
the LIVE scene; `saveLayout()` keeps an in-memory mirror `__workingLayout`;
named layouts keep an in-memory mirror `__namedCache` (seeded from baked-in +
storage). Bake/export now read those, never storage. The baked copy carries
everything in `window.__M3D_LAYOUT__`/`__M3D_LAYOUTS__`, and `loadLayout` reads
those globals directly — so on a storage-blocked machine the user must WORK IN
and RE-OPEN the baked copy (the plain copy can't remember anything there).
Import was ALSO broken on such machines — it did `localStorage.setItem` +
`location.reload()`, which silently no-ops when storage is blocked. Fixed:
import now parses the file and applies it to the LIVE scene via the shared
`applyWorkingLayout(o)` (extracted from `loadLayout`), `clearExtras()` first,
then `schedule()`/`buildSolaSched()`. So the reliable PC→Mac transfer is
Export (on the storage-working PC) → Import (on the Mac) — no rebuild needed.

## Sola No-Arms updated SWI + material flow (2026-06)

Newer "Sola_Lounge_no_armSWI_in_progress.csv" (No Arms, **No middle leg**) —
total **132.73 min**, 9 timed steps (supersedes the older partial seed values):
1 PPE; 2 Rivet nut install **8.5**; 3 Connector Pre-Assembly **11.66** (14
connectors — the connector lady); 4 Connector Plate Install **13**; 5 Connector
Attachment **3.66** (4 connectors); 6 Frame Sub-Assembly **17** (2×4-leg); 7
Frame Connection Assembly **17.5**; 8 Seat Support Frame / trellis **33** (now
MEASURED — was missing); 9 Trellis Frame Installation **13.41**; 10 Corner & End
Caps **15**. No middle leg, no separate Frame Prep.

Material flow (parts come-from → go-to), engineer's CSV:
- cart → Rivet Nuts, Connector Pre-Assembly, Seat Support (all prereq-free).
- Rivet Nuts + Connector Pre-Assembly → Connector Plate Install AND Connector
  Attachment (two branches).
- Connector Plate + Connector Attachment → Frame Sub-Assembly → Frame Connection.
- Frame Connection → Corner Caps AND Trellis Frame Installation.
- Seat Support → Trellis Frame Installation. → finished sofa → ship.
The shared connector lady, when a task is set to the Sola side, sends Sola
connectors to the Sola Connector Plate / Attachment stations.

App naming: the "other side" is now labelled **"Sola (no arms)"** throughout the
UI (internal side value stays `other`).

**Dual data panels (2026-06):** both lines are ALWAYS shown (a brief view-filter
that hid one line was removed — the engineer wants to see both). The top now has
TWO readout strips: MERITAGE (left, from `schedule()`) and SOLA (NO ARMS) (right,
`renderSolaData()` — Stations / Total labor / Cycle / Capacity / Bottleneck).
Sola metrics are computed from the Sola-side added stations (`sideOf==='other'`)
plus the connector lady's Sola-side task minutes: labor = Σ station t (+lady
Sola), cycle = max per-operator station time, capacity = 420/cycle. It's a
static line-balance (bottleneck = slowest station), not yet an animated flow sim
— the 3D Play still animates only Meritage. Added stations also get varied
header colours (`STA_COLORS`), and there's a 2nd "Sola materials cart" (`cart2`,
green) fed from the same elevator (dashed feed line). NEXT: an animated Sola
flow sim so the Sola line can run in 3D too (together or separately).

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
