# WaterAware — a drinking water quality awareness map

**The pitch:** IQAir made air quality legible to everyone with one map and one number. Nothing
like it exists for the water people actually drink. This is a working prototype of that missing
thing.

Open `index.html` in a browser — no build step, no server, no API keys. It's a single
self-contained file (geo lookups for county placement are embedded at build time).

## Two views

### 🚰 Tap water (default)

Every US public water system must report Safe Drinking Water Act violations to the EPA. This
view queries the [EPA ECHO Safe Drinking Water services](https://echo.epa.gov/tools/web-services)
(SDWIS data, refreshed quarterly) directly from the browser:

- **National view** shows every EPA-designated **serious violator** community water system in
  the country.
- **Zoom into a state or metro** and every community water system loads (nearest states first,
  up to 3,000 systems per state), placed at its county location and sized by population served.
- **Compliance score (0–100)**: each system starts at 100 and loses points for its EPA record —
  serious-violator designation (−45), health-based violations (−20), quarters in violation over
  3 years (−2 each, max −24), quarters as serious violator (−2 each, max −12), lead/copper
  action-level exceedances in 5 years (−8 each, max −16), current unresolved violation (−8),
  monitoring/reporting failures (−5), public-notice failures (−5). Clamped to 0–100.
- **Popups** show violation flags, contaminants in violation, people served, enforcement
  history, and a link to the system's official EPA Detailed Facility Report.
- **Ranking panel**: most concerning / cleanest systems in view (ties broken by population).

### 🌊 Rivers & streams

Live ambient water quality — the source much tap water starts as — from the
[USGS Instantaneous Values API](https://waterservices.usgs.gov/) (thousands of real-time
sensors, updated as often as every 15 minutes). Each station gets a 0–100 score blending
dissolved oxygen (30%), turbidity (25%), pH (20%), specific conductance (15%) and temperature
(10%) via NSF-inspired piecewise curves; stations reporting fewer than two parameters show as
grey dots with raw readings.

## Honest limitations (also shown in-app)

- **A compliance score is not a lab test of your tap.** It reflects the EPA's violation record
  (quarterly, can lag), not today's chemistry; building plumbing and unregulated contaminants
  (like many PFAS) don't appear.
- **System locations are approximate** — ECHO's SDW service reports county FIPS, not
  coordinates, so systems are placed at their county center with deterministic jitter.
- **US-only.** The US is unusual in publishing per-system compliance data via public API.
- Both EPA and USGS APIs block some datacenter/cloud IPs — the app must run in a normal
  browser, and cannot be exercised from most CI containers.
- Score weights are reasonable first-pass values, not peer-reviewed; treat v0 as directional.

## Verification

The EPA API contract (parameters and the `sdw04` water-system schema) was taken from the
official ECHO OpenAPI specification. Scoring, ingest, paging, and both views were exercised
headless (Playwright + mocked API responses matching those schemas); live-API behavior should
be confirmed in a real browser.

## Roadmap ideas

1. Lead service line inventories (now federally reported) as an overlay.
2. Consumer Confidence Report links per system.
3. Global layer: UN [GEMStat](https://gemstat.org/) + WHO/UNICEF JMP access data.
4. Satellite-derived source-water indicators (turbidity, algal blooms).
5. A published, versioned scoring standard so the number means the same thing everywhere.
