# CutWatch — locked-in behavior spec

CutWatch is a single-file browser tool (`CutWatch_Machine_Log.html`) that measures
downtime on TUUCI's fabric cutting machines (Gerber + Eastman) and pairs each stop
with the camera footage of that stop so a cause can be tagged.

**This document records the behavior that was verified correct and signed off.
Treat it as the contract. Do not "improve" any rule below without being asked —
every one of these was arrived at by fixing a real bug, and several earlier
attempts broke things by changing them.**

Shared drive root: `T:\ENGINEERING\Mac O' Keefe\CutWatch`

```
CutWatch\
  Gerber running logs\          <- newest .csv is the Gerber data
  Eastman running logs\         <- newest .xls is the Eastman data
  WYZE CAM RECORDINGS  Gerber\  <- Gerber footage (note: two spaces in the name)
  WYZE CAM RECORDING - EASTMAN\ <- Eastman footage
  cutwatch_tags.json            <- the only file the app writes (cause tags etc.)
```

Subfolders are located by **name matching** (case- and spacing-insensitive:
contains "gerber"/"eastman" plus "log", or plus "wyze"/"cam"/"recording").
Never match folder names exactly — the real names have inconsistent spacing.

## 1. How the numbers are calculated

**Gerber (CSV export)**
- cutting time = **sum of the `Total Automatic Time (Seconds)` column** over all job rows
- Cross-check that never fails: the Gerber's own summary row at the bottom of the
  CSV reports the same total. On the reference file `LAST_100_1718_GERBER.csv`
  that is `17486` s = 4h 51m.
- Stops come from the `Gap Time (Seconds)` column (default floor 60 s, cap 4 h).
- Errors come from `Total Error Time (Seconds)`.
- `Total Manual Time` = operator-driven time. It is **not** counted as running.

**Eastman (.xls export)**
- cutting time = **sum of (`Total Time` − `Pause Time`)** per row
- Stops come from the gap between one job's end and the next job's start.
- Header row is row 9; data starts row 10. Times are Excel serials.

**Both machines (identical, so Compare is apples-to-apples)**
```
available time = for each shift worked: (shift length − 45 min breaks)
% of shift running = cutting time / available time
```
- Standard shifts: 1st 7:00a–3:00p, 2nd 3:00p–1:00a. Editable per day per shift in ⚙.
- Reference result for the file above: 4h 51m of 23h 45m over 3 shifts = **20.5%**.
- Eastman only counts days that actually have camera footage (`videoDaysOnly`).

**Data loading is REPLACE, never accumulate.** Each load reads the newest report
and that becomes the whole picture for that machine. Nothing is stored or merged.
This is deliberate: accumulation caused numbers to silently double (a long,
painful bug — two stacked imports read as 196 jobs / 45% instead of 100 / 20.5%).
Only human work (cause tags, splits, shift edits) is persisted, in
`cutwatch_tags.json`.

## 2. How videos are pulled

**Index once per machine at connect.** Walk that machine's own camera folder and
timestamp every `.mp4`. A machine only ever reads its own folder, which is why
Gerber and Eastman footage can never mix.

**Wyze layout:** `<camera folder>\YYYYMMDD\HH\<clip>.mp4`. Date and hour come
from the folders; only the minute (and maybe seconds) come from the filename.

**Filename format is auto-detected, never assumed.** `13.45.mp4` inside hour
folder `13` is ambiguous — 1:45, or 1:13:45? Decide per camera from the real
files: if the first number almost always equals the hour folder it is `HH.MM`;
if it varies across the hour it is `MM.SS`. Guessing this wrong shifts every
clip by up to an hour and shows footage of the wrong job.
Also handled: `HH.MM.SS.mp4`, `MM.mp4`, suffixes like `13.45_2.mp4`, and
filenames carrying a full date (those always win).

**Deduplicate.** One camera cannot start two recordings in the same second, so
identical timestamps mean the same footage was reached twice (mirrored/copied
folders). Collapse them, or the player shows every clip twice.

**The playlist for a stop is EXACTLY the stop's window:**
```
clip 1      = the clip containing the stop's start minute
last clip   = the clip containing the stop's end minute
```
No lead-in, no trail-out. An earlier version started 10 minutes early and the
first clips showed something else entirely — that was the "wrong videos" bug.
If nothing covers the window, say so and report how far away the nearest clip
is; never substitute unrelated footage.

**Clocks are correct — do not shift clip times.** The machine logs and the
cameras run on the same clock. A manual offset exists in ⚙ purely as a safety
valve if a camera ever drifts; it defaults to 0 and nothing adjusts it
automatically.

**Playback must be race-proof.** Reads off the network drive are slow, so two
loads can overlap. Every async step takes a sequence ticket and only touches the
DOM if it is still the newest request; the clip list is locked to the stop that
owns it; a new object URL is created before the old one is revoked. Without
this, a slower older read overwrites the newer one and you see one stop's clips
under another stop's label.

## 3. Verification harness (in the session scratchpad)

Playwright tests that reproduce the real failures. Re-run these after any change
to loading, math, or video code:

| script | proves |
|---|---|
| `e2e_fs.mjs` | zero-click reopen, newest report wins, 20.5%, tags round-trip |
| `e2e_fuzzy.mjs` | folder names with different spacing/case still resolve |
| `e2e_fmt.mjs` | `HH.MM` vs `MM.SS` auto-detection, duplicate collapse |
| `e2e_race.mjs` | slow out-of-order reads: displayed clip always matches its label |
| `e2e_align.mjs` | playlist starts at the stop's first minute, ends at its last |

They mock the shared drive with OPFS (`navigator.storage.getDirectory`) and store
the handle in the app's own IndexedDB slot, so `boot()` runs its real path.
Chromium: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

## 4. Ground rules learned the hard way

- Verify against the real exported files, not synthetic data.
- Test the path the user actually takes (open → look at screen), not just the
  internal functions. A bug that only appears on a slow network drive will pass
  every fast local test.
- Prove a fix by making the test fail without it first.
- Keep it one HTML file. No server, no build step, no install.
- Don't add features to work around a bug — find the bug.
