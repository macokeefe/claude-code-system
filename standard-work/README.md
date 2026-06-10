# Standard Work — labor time tracking

Local web app that replaces the SWI Excel spreadsheets: log, organize, and
visualize labor time per SKU, with shared steps (tags) as a single source of
truth across SKUs.

## No-install version (locked-down work computers)

`standalone/StandardWork.html` is the entire app in one file — no Node.js, no
install, no admin rights. Copy it anywhere (email it to yourself, USB, etc.),
double-click, and it opens in Chrome/Edge. It comes pre-loaded with the Sola
Lounge data, and the Excel importer/exports/charts all run inside the page.

Notes for the standalone version:
- Data is saved in that browser on that machine (IndexedDB). Use the
  **Backup data** button in the sidebar regularly — the backup is a single
  JSON file (photos included) that **Restore backup** loads on any machine.
- Clearing the browser's site data deletes the app's data; keep backups.
- Rebuild after code changes with `npm run build:standalone`.

## Quick start (server version)

```bash
cd standard-work
npm run setup      # one time: installs server + client deps, builds the UI
npm run seed       # optional: loads the two Sola Lounge SKUs + 6 shared tags
npm start          # → http://localhost:3001
```

For development with hot reload: `npm run dev` (UI at http://localhost:5173).

## Concepts

- **SKU** — one product variant with an ordered list of steps. Total labor
  time is always computed live from the steps.
- **Unique step** — belongs to one SKU, carries its own observed time.
- **Shared step (tag)** — canonical definition + time stored once. SKUs attach
  the tag; updating the canonical time updates every SKU that inherits it
  (with a confirmation showing exactly which SKUs move).
- **Per-unit shared step** — a tag can carry a per-unit time instead of a
  fixed one (e.g. Connector Pre-Assembly at 0:50/connector). Each SKU's step
  stores its own quantity (Right Arm ×16, No-Arms ×14) and its time is
  quantity × unit time. Re-time the unit once and every SKU updates
  proportionally to its own count.
- **Override** — a tagged step that takes a different time on one SKU. Flagged
  with an orange "override" badge; not affected by canonical time changes.
- **Inline editing** — on the SKU page, click any step's text, time, or
  quantity to edit it in place. Per-step actions convert a unique step into a
  shared one ("make shared"), link it to an existing tag ("attach tag"), or
  detach it back to a unique step.
- **Time entry** accepts `4:30`, `12` (minutes), or `3 minutes 20 seconds`.
  Everything is stored as integer seconds.
- **History** — every time change (tag or step) is recorded with an optional
  note, so before/after improvements can be shown.

## Assistant (built-in Claude)

The **Assistant** page is a chat that can answer questions about your data
("which SKU has the most labor time?", "what's our best improvement target?")
and make changes for you ("update Connector Pre-Assembly to 10:30") — it reads
and writes through the same data layer as the UI, confirms in chat before
changing anything, and every time change lands in the audit history.

Requirements: an Anthropic API key (console.anthropic.com → API Keys; pasted
once, stored only in that browser) and network access to `api.anthropic.com`.
Questions and the data the assistant reads are sent to Anthropic's API.

## Importing existing spreadsheets

Import page → upload an SWI `.xlsx`. The importer finds the step table by its
headers (`Process Step` / `Time (minutes)` / `Operation Step` / `Pictures` /
`Can be done in parallel?`), parses each time format used in the existing
files, extracts embedded photos to `data/photos/`, and suggests existing tags
for matching steps. Nothing is written until you confirm the dry-run preview.
Ambiguous times (size-dependent lists, `/piece` rates) are imported without a
time and flagged **needs review** with the original text preserved.

## Exporting

From any SKU page: **Print / PDF** opens a clean printable sheet (photos
included) for the shop floor; **Export Excel** downloads a formatted `.xlsx`.

## Layout

```
server/   Express API + SQLite (better-sqlite3), importer, exporter
client/   React (Vite) UI
seed/     loads the data extracted from the two Sola Lounge workbooks
data/     SQLite database + extracted/uploaded photos (gitignored)
```
