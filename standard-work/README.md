# Standard Work — labor time tracking

Local web app that replaces the SWI Excel spreadsheets: log, organize, and
visualize labor time per SKU, with shared steps (tags) as a single source of
truth across SKUs.

## Quick start

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
- **Override** — a tagged step that takes a different time on one SKU. Flagged
  with an orange "override" badge; not affected by canonical time changes.
- **Time entry** accepts `4:30`, `12` (minutes), or `3 minutes 20 seconds`.
  Everything is stored as integer seconds.
- **History** — every time change (tag or step) is recorded with an optional
  note, so before/after improvements can be shown.

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
