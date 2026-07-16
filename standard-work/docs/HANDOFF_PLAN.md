# 3D Mezzanine Model, Handoff Plan to TUUCI

Prepared: 07/14/2026 · Updated: 07/16/2026 · Owner: Mac O'Keefe (Continuous Improvement)
Status: DRAFT for review with Engineering + IT

## 1. What TUUCI is receiving

| Item | What it is |
|---|---|
| **3D Mezzanine Model** (`Mezzanine_3D_Model.html`, plus a TUUCI-branded copy) | Web app of the whole mezzanine (Meritage, Sola, Canyon Crew) with animated operators, carts, forklifts, and outbound flow; live cycle/pace/capacity/bottleneck math; per-product standard work; product-specific help paths; crew coverage rules; Planner (daily build schedule); Takt board with a help-path optimizer; organized toolbar with floor-editing tools separated from daily analysis tools. Runs in any browser, no install. |
| Source code | One JavaScript source (`Meritage_3D_Line.entry.js`, Three.js) plus a one-command build (esbuild) and a theming script for the TUUCI skin. |
| Data & assumptions register | `KNOWLEDGE.md`: every measured SWI, which numbers are measured vs estimated, and the model's assumptions. |
| Related docs | Meritage connector ECN and PCN drafts, improvement presentation, meeting deck. |

## 2. The end state (what "handed off" means)

Two roles, one shared source of truth:

- **Admin page** (Engineering / CI owns it): the back end and workflow design. Stations, step times, products, crew coverage rules, floor layout, cart routes. Today this maps to the "Floor tools" + Edit times side of the app.
- **Floor manager page** (line supervisors use it daily): pick what the line builds today, how many, in what order, and how many people they have; the tool shows the schedule, the takt picture, and the best help-path setup. Today this maps to the Planner + Takt board + optimizer side.
- **Shared data in TUUCI's Microsoft 365**: one person saves, everyone sees it on next load. No forked copies.

The current app already previews this split (daily tools visible, floor tools behind a toggle). The handoff makes it real with storage, permissions, and owners.

## 3. Where the data should live (verified recommendation)

The right home is the Microsoft 365 TUUCI already pays for. No new server to host or maintain. Checked against Microsoft documentation:

**The store: a SharePoint List, one row per saved layout, on a shared SharePoint/Teams site.** The app reads and writes it through the Microsoft Graph API using each person's normal M365 sign-in.

Why a List and not a shared JSON file on OneDrive: when two people save a file within a few seconds, OneDrive silently keeps a conflict copy (for example `layouts-MARKS-PC.json`) and one person's edits vanish from the copy everyone reads. A SharePoint List through Graph gives:

- collisions only when two people edit the **same** layout;
- **optimistic concurrency**: a stale save is rejected (HTTP 412) so the app re-loads and warns instead of overwriting;
- **per-item version history**: who changed what, when. This is the change log, free.

Two facts to plan around, both confirmed:

- **The app page is served from a static web address, not from the OneDrive folder.** SharePoint serves a raw `.html` as a download, and a double-clicked local file cannot sign in. Host on an internal web server, Azure Static Web Apps, or package into SharePoint (SPFx). Static hosting, not an application server.
- **One-time admin consent.** Reaching a shared site needs an Entra "SPA" app registration plus a one-time tenant admin consent for the Graph scope (Sites.ReadWrite.All). About 15 minutes, once.

The code is shaped for the swap: every read and write funnels through four functions (`saveLayout`, `loadLayout`, `readLayouts`, `writeLayouts`). Replacing localStorage with MSAL sign-in plus Graph calls is roughly one to two days of development.

**Interim bridge (start now, zero IT):** one copy on the SharePoint/Teams site is the only official copy. One owner makes changes, uses "Save into app," republishes there. Everyone opens from that link only.

Ownership note: a SharePoint/Teams site, not a person's personal OneDrive, so nothing orphans if someone leaves.

## 4. Roles and permissions

- **Admin (Engineering/CI):** full app. Publishes Official layouts, step times, products, coverage rules. Changes to official step times require an SWI behind them, and the measured-vs-estimated register updates in the same change.
- **Floor manager:** Planner, Takt board, Idle/Task charts, product selection, day length and crew counts for the day. Cannot overwrite Official layouts; daily plans save under the line/date.
- Enforcement is phased: at first by convention (two builds of the page or the Floor-tools toggle), later by role check on sign-in (the M365 login tells us who they are).

## 5. Handoff phases

| Phase | What happens | Who | Effort |
|---|---|---|---|
| 0. Now | Publish the official copy to the SharePoint/Teams site; announce "open from here only." Freeze a v1: tag the repo, list known assumptions. | CI | 1 hr |
| 1. Storage | IT setup (site, Layouts list, Entra SPA registration, admin consent). Implement MSAL + Graph in the four storage functions; host the page on an internal HTTPS URL. | CI + IT | ~2-3 days total |
| 2. Pilot | 2-3 users (mezzanine supervisor + engineer) run it for a week; verify saves propagate, nothing lost, numbers trusted. | CI | 1 week parallel |
| 3. Roles | Split admin vs floor-manager experience (start with the toggle convention, add sign-in role check). Line supervisors trained on Planner/Takt board only. | CI + IT | 2-3 days |
| 4. Ownership | Name a **technical owner** (builds, deploys, hosts) and a **data owner** (publishes Official layouts/times). Move the repo into TUUCI's org. Training: 1 hour for supervisors, 2 hours for the admin owner, plus one-page cheat sheets. | Mgmt + CI | ½ day + sessions |
| 5. Support | Issues route to the data owner; assumptions register stays current; product times keep getting grounded in real SWIs. | Data owner | ongoing |

## 6. What must be true before we call it handed off

- Data lives in the shared M365 store and a two-person concurrent-save test passes.
- Every product's official step times are either SWI-measured or explicitly flagged as estimates in the app data register.
- Named technical owner and data owner have accepted the roles.
- Supervisors can run a day's plan in the Planner without help.
- The repo, build instructions, and theming script live in a TUUCI-controlled repository.

## 7. Open decisions for TUUCI

- Where to host the app page: internal web server vs Azure Static Web Apps vs SharePoint (SPFx).
- Who performs the Entra app registration and admin consent.
- Backup/retention of the Layouts list beyond SharePoint version history.
- Who is named technical owner and data owner.
- Whether the TUUCI-branded skin becomes the primary look (recommended for handoff).
