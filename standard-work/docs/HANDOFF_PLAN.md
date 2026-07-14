# 3D Mezzanine Model — Handoff Plan to TUUCI

Prepared: 07/14/2026 · Owner: Douglas O'Keefe (Continuous Improvement)
Status: DRAFT for review with Engineering + IT

## 1. What TUUCI is receiving

| Item | What it is |
|---|---|
| **3D Mezzanine Model** (`Mezzanine_3D_Model.html`) | Single-file web app — the whole mezzanine (Meritage, Sola, Canyon Crew lines) with animated operators, carts, forklifts, outbound flow; live takt/cycle/pace math; per-product standard work; editable layouts and times. Runs in any browser, no install. |
| Source code | `Meritage_3D_Line.entry.js` (Three.js) + build script (esbuild). One JS file, one build command. |
| Data & assumptions register | `KNOWLEDGE.md` — every measured SWI (Sola no-arm/1-arm/both-arms/middle-leg, Canyon chair, Meritage chair/swivel), which numbers are measured vs estimated, and the app's modeling assumptions. |
| Related docs | Meritage connector ECN draft, PCN draft, improvement presentation. |

## 2. The data problem (why storage must change before handoff)

Today the app stores data in three layers, **none of which sync between people**:

1. **Browser localStorage** — the working layout and named layouts save automatically, but only on *that browser on that computer*.
2. **Baked-in layouts** — "Save into app" downloads a new copy of the HTML with the layouts embedded. The data travels with the file, but every copy someone saves becomes its own fork.
3. **Export / Import JSON** — manual file passing.

Consequence: if a supervisor rebalances a line or updates times from a new SWI, nobody else sees it unless a file is manually passed around. Copies drift apart and there is no single source of truth. Fine for a one-person tool; not acceptable for a company tool.

## 3. Where the data should live — options

### Option A — Small internal server (RECOMMENDED)
- App is served from one company URL (e.g. `mezzanine.tuuci.local`). Layouts, products, and step times live **server-side** (a tiny REST API in front of SQLite or a JSON store).
- Anyone opens the same URL; when someone saves, **everyone company-wide gets it on next load**. The server stamps who changed what, when — a free change log.
- The code is already shaped for this: every read/write funnels through four functions (`saveLayout`, `loadLayout`, `readLayouts`, `writeLayouts`). Swapping localStorage for `fetch()` calls is roughly a day of development plus a small IT-hosted VM/IIS site/container.
- Add lightweight roles: anyone can save *sandbox* layouts; only designated owners can overwrite *Official* ones.

### Option B — SharePoint / Microsoft 365 native
- Store the layout JSON in a SharePoint list or document library; the app reads/writes through the Microsoft Graph API with company sign-in.
- No new server to host, and auth is the existing TUUCI M365 login — but it requires an Azure AD app registration, more integration code, and lives with SharePoint API quirks/throttling. Choose this only if IT strongly prefers no self-hosted services.

### Option C — Published-copy discipline (interim, zero IT effort)
- One copy on SharePoint/network drive is declared **the only official copy**. One owner makes changes, uses "Save into app," and republishes to that location. Everyone opens from there — never from a locally saved copy.
- Works today with zero development, but sync is manual and only as strong as the discipline. Use as the bridge until A (or B) is live.

**Recommendation: start C immediately (costs nothing), build A as the real fix.**

## 4. Change control for the data

Mirror the plant's ECN/PCN culture:

- **Sandbox vs Official layouts** — anyone can experiment and save under their own name; the *Official* mezzanine layout and *Official* product step times can only be published by the named data owner.
- **Times change only with evidence** — official step times update when a new/revised SWI backs them, and `KNOWLEDGE.md` (measured vs estimated register) is updated in the same change.
- **Server change log** (Option A) records who/what/when for every publish.

## 5. Handoff steps

| # | Step | Who | Effort |
|---|---|---|---|
| 1 | Decision meeting with IT: pick Option A / B, confirm hosting + auth (AD SSO?) + backup | CI + IT | 30 min |
| 2 | Start Option C now: publish the official copy to SharePoint, announce "open it from here only" | CI | 1 hr |
| 3 | Transfer the code: move the repo into TUUCI's GitHub org (or IT-controlled equivalent) with a README covering the one-command build | CI + IT | ½ day |
| 4 | Implement the chosen storage (Option A: tiny REST API + swap the four storage functions) | Dev (CI or IT) | ~1–2 days |
| 5 | Pilot with 2–3 users (mezzanine supervisor + engineer): verify saves propagate, nothing lost | CI | 1 week in parallel |
| 6 | Name owners: **technical owner** (builds/deploys), **data owner** (publishes Official layouts/times) | Mgmt | — |
| 7 | Training: 1-hour session + one-page cheat sheet (Play/products/edit times/help paths/layouts) | CI | ½ day prep |
| 8 | Support path: where users report issues; keep the assumptions register current | Data owner | ongoing |

## 6. Open decisions for TUUCI

- Hosting: internal VM/IIS vs M365-native (drives Option A vs B)
- Authentication: open on the LAN vs AD sign-in with roles
- Backup/retention of the layout database
- Who is named technical owner and data owner
