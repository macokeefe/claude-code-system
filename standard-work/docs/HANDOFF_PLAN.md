# 3D Mezzanine Model, Handoff Plan to TUUCI

Prepared: 07/14/2026 · Owner: Douglas O'Keefe (Continuous Improvement)
Status: DRAFT for review with Engineering + IT

## 1. What TUUCI is receiving

| Item | What it is |
|---|---|
| **3D Mezzanine Model** (`Mezzanine_3D_Model.html`) | Single-file web app of the whole mezzanine (Meritage, Sola, Canyon Crew lines) with animated operators, carts, forklifts, outbound flow; live takt/cycle/pace math; per-product standard work; editable layouts and times. Runs in any browser, no install. |
| Source code | `Meritage_3D_Line.entry.js` (Three.js) plus a one-command build (esbuild). |
| Data & assumptions register | `KNOWLEDGE.md`: every measured SWI, which numbers are measured vs estimated, and the app's modeling assumptions. |
| Related docs | Meritage connector ECN draft, PCN draft, improvement presentation. |

## 2. The data problem (why storage must change before handoff)

Today the app stores data in three layers, none of which sync between people:

1. **Browser localStorage**: the working layout and named layouts save automatically, but only on that browser on that computer.
2. **Baked-in layouts**: "Save into app" downloads a new copy of the HTML with the layouts embedded. The data travels with the file, but every copy someone saves becomes its own fork.
3. **Export / Import JSON**: manual file passing.

Consequence: if a supervisor rebalances a line or updates times from a new SWI, nobody else sees it unless a file is manually passed around. Copies drift apart and there is no single source of truth. Fine for a one-person tool; not acceptable for a company tool.

## 3. Where the data should live (verified recommendation)

The right home is the Microsoft 365 that TUUCI already pays for. No new server to host or maintain. The points below were checked against Microsoft's own documentation.

**The store: a SharePoint List, one row per saved layout, on a shared SharePoint/Teams site.** The app reads and writes it through the Microsoft Graph API using each person's normal M365 sign-in. When one person saves, everyone gets it on next load. This is the durable form of "run it on our OneDrive."

Why a List and not a single JSON file on OneDrive: a shared file is unsafe for this. When two people save within a few seconds, OneDrive silently keeps a conflict copy (for example `layouts-MARKS-PC.json`) and one person's edits disappear from the copy everyone else is reading. A SharePoint List, through Graph, gives:

- collisions only when two people edit the **same** layout, not the whole dataset;
- **optimistic concurrency**: a stale save is rejected (HTTP 412) so the app re-loads and warns instead of overwriting;
- **per-item version history**: who changed what, and when, built in. This mirrors the ECN/PCN change-control habit for free.

Two things to know up front, both confirmed:

- **The app is served from a static web address, not from the OneDrive folder.** SharePoint serves a raw `.html` file as a download, and a double-clicked local file cannot sign in. Host the page on an internal web server, Azure Static Web Apps, or package it into SharePoint (SPFx). This is static hosting, not an application server to babysit. The data lives in M365; the app file is served from a URL.
- **One-time admin consent.** To reach a shared location (rather than a user's own OneDrive), an M365 admin grants a one-time tenant consent for the Graph permission (Sites.ReadWrite.All), plus a one-time Entra "SPA" app registration. About 15 minutes, once. After that, users just sign in.

The code is already shaped for this swap: every read and write funnels through four functions (`saveLayout`, `loadLayout`, `readLayouts`, `writeLayouts`). Replacing localStorage with MSAL sign-in plus Graph calls is roughly one to two days of development.

**Interim bridge (this week, zero IT effort):** until the above is set up, declare one copy on the SharePoint/Teams site the only official copy. One owner makes changes, uses "Save into app," and republishes there. Everyone opens from that link, never a local copy. Manual, but it stops the forking today.

Ownership note: put it on a **SharePoint/Teams site, not a person's personal OneDrive.** Everyone still perceives it as "our OneDrive," but it does not orphan if that person leaves the company.

## 4. Change control for the data

Mirror the plant's ECN/PCN culture:

- **Sandbox vs Official layouts:** anyone can experiment and save under their own name; the Official mezzanine layout and Official product step times can only be published by the named data owner.
- **Times change only with evidence:** official step times update when a new or revised SWI backs them, and `KNOWLEDGE.md` (the measured-vs-estimated register) is updated in the same change.
- **Change log:** the SharePoint List version history records who changed what, and when, for every save.

## 5. Handoff steps

| # | Step | Who | Effort |
|---|---|---|---|
| 1 | IT setup: create the SharePoint/Teams site and a "Layouts" List; register an Entra "SPA" app; admin-consent the Graph scope (Sites.ReadWrite.All) | CI + IT | ~½ day |
| 2 | Start the interim bridge now: publish the official copy to the SharePoint/Teams site, announce "open it from here only" | CI | 1 hr |
| 3 | Transfer the code: move the repo into TUUCI's GitHub org (or IT-controlled equivalent) with a README covering the one-command build | CI + IT | ½ day |
| 4 | Implement storage: add MSAL sign-in and Graph read/write against the Layouts List (with ETag concurrency); swap the four storage functions; host the page on an internal HTTPS URL | Dev (CI or IT) | ~1–2 days |
| 5 | Pilot with 2–3 users (mezzanine supervisor + engineer): verify saves propagate and nothing is lost | CI | 1 week in parallel |
| 6 | Name owners: a **technical owner** (builds/deploys/hosts) and a **data owner** (publishes Official layouts/times) | Mgmt | . |
| 7 | Training: 1-hour session plus a one-page cheat sheet (Play, products, edit times, help paths, layouts) | CI | ½ day prep |
| 8 | Support path: where users report issues; keep the assumptions register current | Data owner | ongoing |

## 6. Open decisions for TUUCI

- Where to host the app page: internal web server vs Azure Static Web Apps vs SharePoint (SPFx).
- Who does the one-time Entra app registration and admin consent.
- Backup/retention of the Layouts List (SharePoint version history plus recycle bin, or an extra export).
- Who is named technical owner and data owner.
