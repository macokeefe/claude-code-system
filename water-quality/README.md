# WaterAware — a live water quality awareness map

**The pitch:** IQAir made air quality legible to everyone with one map and one number. Nothing like it exists for water. This is a working prototype of that missing thing.

Open `index.html` in a browser — no build step, no server, no API keys. It's a single self-contained file.

## What it does

- **Live map** of real-time water quality across the US, pulling directly from the
  [USGS Instantaneous Values API](https://waterservices.usgs.gov/) (thousands of river/lake/stream
  sensors, updated as often as every 15 minutes).
- **One score per station (0–100)**, computed in the browser from up to five live parameters,
  with IQAir-style colored badges on the map.
- **Live ranking panel** — "most concerning" / "cleanest" stations in the current view,
  like IQAir's city ranking.
- **Station popups** with raw readings, per-parameter subscores, timestamp, and a link to the
  full USGS station page.
- Loads stations for wherever you pan/zoom (USGS caps queries at 25 sq° per request, so the
  national view is seeded with 15 major-metro regions and the rest loads as you explore).

## Scoring methodology (v0)

A simplified index inspired by the NSF Water Quality Index. Each parameter maps to a 0–100
subscore via a piecewise-linear curve, then a weighted average is taken over whichever
parameters the station reports (minimum two, weights renormalized):

| Parameter (USGS code) | Weight | Why it matters |
|---|---|---|
| Dissolved oxygen (00300) | 30% | Low DO suffocates aquatic life |
| Turbidity (63680) | 25% | Sediment, runoff, pathogen proxy |
| pH (00400) | 20% | Healthy rivers sit near 7–8 |
| Specific conductance (00095) | 15% | Dissolved solids / pollution proxy |
| Water temperature (00010) | 10% | Warm water holds less oxygen |

**Important disclaimer (also shown in-app):** this is an *awareness* tool for ambient surface
water, not a safety rating. It does not measure bacteria, lead, PFAS, or nitrates and says
nothing about tap water. Never use it to decide whether water is safe to drink or swim in.

## Known limitations

- **US-only** — the US is the only country with a free, dense, real-time public water sensor network.
- The USGS API blocks some datacenter/cloud IPs, so this app must run in a normal browser
  (it will not work from most CI containers or server-side fetchers).
- The scoring curves are reasonable first-pass values, not peer-reviewed; treat v0 scores as directional.
- No clustering yet — very dense areas (e.g. Florida) can get crowded at low zoom.

## Roadmap ideas (the path to "IQAir for water")

1. **Global archive layer** — UN [GEMStat](https://gemstat.org/) classification data where no
   real-time sensors exist.
2. **Satellite layer** — turbidity / chlorophyll-a (algal blooms) from GEO AquaWatch-style
   products for global near-real-time coverage.
3. **Recreational safety feeds** — beach/bacteria advisories (e.g. state E. coli monitoring).
4. **Crowdsourcing** — cheap test-strip submissions, the PurpleAir moment for water.
5. **A real, published WQI standard** so the number means the same thing everywhere.
