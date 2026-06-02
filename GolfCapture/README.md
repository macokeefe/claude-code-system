# GolfCapture

A macOS CLI that captures a golf practice session by recording your swing on
the built-in webcam, logging Garmin Approach R10 ball-flight data over
Bluetooth LE, and merging the two streams into a single analyzable dataset with
per-swing pose biomechanics.

No GUI — everything runs from the terminal.

```
BLE listener   ──┐
                 ├─► session manager ─► swing clips ─► pose metrics ─► merged CSV
webcam recorder ─┘
```

## What it produces

Every session lives in `~/GolfCapture/sessions/<YYYYMMDD_HHMMSS>/`
(`~/GolfCapture/sessions/latest` always points at the newest one):

| File | Contents |
|------|----------|
| `r10_characteristics.json` | Discovered R10 BLE services/characteristics + properties |
| `raw_ble_log.jsonl` | Every BLE notification: hex, decimal bytes, ASCII, candidate float decodes, timestamps |
| `shots_raw.jsonl` | Best-effort parsed shots (ball speed, carry, etc.) |
| `CONNECTION_MODE.txt` | `active_connection`, `passive_advertisement`, or `none` |
| `ble_gaps.txt` | Connection drops / reconnect log |
| `session_<ID>.mp4` | Full continuous session video (H.264) |
| `frame_index.jsonl` | Frame index → wall-clock time mapping (frame-accurate) |
| `swing_events.jsonl` | Motion-detected swing start/end events |
| `swing_NNN.mp4` | Per-swing clips (extracted during `analyze`) |
| `swing_NNN_pose.jsonl` | Full 33-landmark MediaPipe time series per clip |
| `swing_NNN_metrics.json` | Derived biomechanics (per-frame + at key positions) |
| `session_analysis.csv` | **One row per shot**: BLE + pose-at-impact + meta |
| `session_summary.json` | Totals, match counts, duration, per-club averages, warnings |
| `merge_warnings.txt` | Unmatched shots/swings, pose failures |

## Requirements

- macOS with a built-in (or USB) webcam
- Python 3.11+
- A Garmin Approach R10 (device name contains "R10" or "Approach")

## Install

```bash
cd GolfCapture
./setup.sh
source venv/bin/activate
```

`setup.sh` checks your Python version, creates a `venv`, and installs
dependencies from `requirements.txt`.

### macOS permissions (one-time)

Your terminal app must be allowed to use Bluetooth and the Camera. macOS
usually prompts on first run; if not, enable your terminal under:

- **System Settings → Privacy & Security → Bluetooth**
- **System Settings → Privacy & Security → Camera**

(If you launch from an IDE, grant the IDE these permissions instead.)

## First-run walkthrough

### 1. Scan (do this first!)

```bash
python main.py scan
```

This finds the R10 by name, connects, and writes every service/characteristic
and its properties to `r10_characteristics.json`. **This step is mandatory** —
the R10 BLE protocol is not publicly documented, so the UUIDs must be
discovered empirically before recording is useful.

If no R10 is found within 30 seconds, the discovered BLE device list is printed
to help you debug (wrong device, asleep, already paired, etc.).

> **Already paired to your phone?** The R10 may refuse a second BLE
> connection. GolfCapture automatically falls back to a **passive
> advertisement scanner** and notes this in `CONNECTION_MODE.txt`. To get full
> notification data, forget the R10 in the Garmin Golf app / iPhone Bluetooth
> settings first.

### 2. Record a session

```bash
python main.py record          # add --camera N to pick a different webcam
```

Runs the BLE listener and webcam recorder concurrently. The terminal shows
connection status, each detected shot (number + carry), and motion-detected
swing events. Press **Ctrl+C** to stop; a summary is printed and all logs are
flushed.

### 3. Analyze

```bash
python main.py analyze                       # most recent session
python main.py analyze --session 20260602_143000   # a specific session
```

This extracts a clip per detected swing, runs MediaPipe Pose on each, computes
biomechanics, and merges everything with the BLE shots into
`session_analysis.csv` + `session_summary.json`.

## The raw log is the fallback

The R10 protocol is reverse-engineered and incomplete here, so the auto-parser
is **best-effort**: it only emits values that pass plausibility gates (e.g.
ball speed 20–220 mph, carry 10–400 yds) and otherwise stays silent. If parsed
shots are missing or wrong:

1. Open `raw_ble_log.jsonl` — each line shows `hex`, `bytes`, `ascii`, and
   `candidate_le_f32` (every little-endian float32 window) with a precise
   timestamp. Hit a shot, find the notification whose timestamp lines up, and
   read off which byte offsets hold the real values.
2. Update `KNOWN_OFFSETS` (and ranges if needed) in `ble_listener.py`.
3. Re-run `record`. The raw log always remains the source of truth even if the
   parser is imperfect.

## Biomechanics computed per swing

At each frame and at detected key positions (top of backswing = highest lead
wrist; impact = peak lead-wrist velocity; follow-through = highest trail wrist
after impact):

- Lead / trail arm angle (elbow joint)
- Hip–shoulder separation (transverse-plane rotation difference)
- Wrist hinge angle
- Spine tilt (lateral + forward)
- Swing tempo (movement→impact, impact→finish, in ms)
- Weight-shift proxy (lateral hip-midpoint displacement, px)

> Pose metrics assume a **right-handed** golfer (lead = left side). Edit the
> `LEAD`/`TRAIL` maps in `pose_analyzer.py` for left-handed players.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `No R10 found` | Make sure the R10 is awake and not exclusively paired to your phone. Check the printed device list. |
| Webcam fails to open | The error lists available camera indices — pass `--camera N`. Grant Camera permission. |
| Passive mode only | Forget the R10 from the iPhone/Garmin app so GolfCapture can connect directly. |
| No parsed shots | Expected if offsets are unknown — use `raw_ble_log.jsonl` to find offsets (see above). |
| Pose metrics null for a swing | Poor lighting/occlusion; flagged in `merge_warnings.txt`. Improve framing/lighting. |
```
