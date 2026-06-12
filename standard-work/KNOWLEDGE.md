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
- **Meritage** (e.g. "MeritageSW 3 seater") — sheet exists
  (`SWI MeritageSW 3 seater.xlsx`, ~98 MB, unreadable via Drive extraction;
  import via the app's in-browser importer, then Export Excel → Drive for a
  readable copy). NOT yet in seed data.

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

## Open items

- Meritage: not yet modeled — waiting on a readable copy (app Export Excel →
  Drive, or picture-compressed resave).
- Both-arms frame sub-assembly variant: unknown.
- Item #13 (beam) rivnut rate: assumed = item #14's 0.531 min.
- Right Arm frame sub-assembly time is in description text (8:30 + 10:30)
  but the step's stored time needs confirming (19:00 assumed in seed? check).
- Sizes for Right Arm rivnut applied same as No-Arms (engineer's rule is
  config-independent) — confirm.
