"""Merge BLE shot data with pose-derived swing metrics into one dataset.

Matching: every parsed shot (`shots_raw.jsonl`) is paired to the nearest motion
`swing_start` event (`swing_events.jsonl`) within a 5-second window. The swing
index of the matched event identifies the `swing_NNN.mp4` clip and its
`swing_NNN_metrics.json`. Unmatched shots and unmatched swings are recorded in
`merge_warnings.txt`. Output is one row per shot in `session_analysis.csv`, plus
a `session_summary.json` rollup.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pandas as pd

from session_paths import read_json, read_jsonl, write_json

MATCH_WINDOW_S = 5.0
HIGH_CONFIDENCE_DELTA_S = 2.0

BLE_COLUMNS = ["ball_speed_mph", "launch_angle_deg", "launch_direction_deg",
               "spin_rate_rpm", "carry_yards", "total_yards", "club_type",
               "shot_timestamp"]
POSE_COLUMNS = ["lead_arm_angle", "trail_arm_angle", "hip_shoulder_separation",
                "wrist_hinge_angle", "spine_tilt_lateral", "spine_tilt_forward",
                "swing_tempo_backswing_ms", "swing_tempo_downswing_ms",
                "hip_lateral_shift_px"]
META_COLUMNS = ["session_id", "shot_index", "swing_clip_filename", "match_confidence"]
ALL_COLUMNS = BLE_COLUMNS + POSE_COLUMNS + META_COLUMNS

NUMERIC_METRICS = ["ball_speed_mph", "launch_angle_deg", "launch_direction_deg",
                   "spin_rate_rpm", "carry_yards", "total_yards"] + \
                  [c for c in POSE_COLUMNS if c != "club_type"]


def merge_session(session_dir: Path) -> Path:
    session_id = session_dir.name
    warnings: list[str] = []

    shots = read_jsonl(session_dir / "shots_raw.jsonl")
    events = read_jsonl(session_dir / "swing_events.jsonl")
    swing_starts = [e for e in events if e.get("event") == "swing_start"]

    if not shots:
        warnings.append("No parsed shots in shots_raw.jsonl. "
                        "The auto-parser may have failed — inspect raw_ble_log.jsonl "
                        "and tune KNOWN_OFFSETS in ble_listener.py.")

    matched_swing_indices: set[int] = set()
    rows = []

    for i, shot in enumerate(shots, start=1):
        shot_wall = shot.get("wall")
        match, delta = _nearest_swing(shot_wall, swing_starts)

        row = {c: None for c in ALL_COLUMNS}
        for c in BLE_COLUMNS:
            row[c] = shot.get(c)
        row["shot_timestamp"] = shot.get("iso") or shot_wall
        row["session_id"] = session_id
        row["shot_index"] = shot.get("shot_index", i)

        if match is not None and delta <= MATCH_WINDOW_S:
            swing_index = match["swing_index"]
            matched_swing_indices.add(swing_index)
            clip_name = f"swing_{swing_index:03d}.mp4"
            row["swing_clip_filename"] = clip_name
            row["match_confidence"] = "high" if delta <= HIGH_CONFIDENCE_DELTA_S else "low"
            pose = _load_impact_metrics(session_dir, swing_index)
            if pose is None:
                warnings.append(f"Shot {row['shot_index']} matched {clip_name} "
                                f"(Δ={delta:.2f}s) but no/failed pose metrics.")
            else:
                for c in POSE_COLUMNS:
                    row[c] = pose.get(c)
        else:
            row["match_confidence"] = "unmatched"
            d = f"{delta:.2f}s" if match is not None else "n/a"
            warnings.append(f"Shot {row['shot_index']} at {row['shot_timestamp']} "
                            f"had no swing event within {MATCH_WINDOW_S}s (nearest Δ={d}).")
        rows.append(row)

    # Unmatched swings.
    for sw in swing_starts:
        if sw["swing_index"] not in matched_swing_indices:
            warnings.append(f"Swing event #{sw['swing_index']} at "
                            f"{sw.get('iso', sw.get('wall'))} had no matching shot.")

    df = pd.DataFrame(rows, columns=ALL_COLUMNS)
    csv_path = session_dir / "session_analysis.csv"
    df.to_csv(csv_path, index=False)

    _write_warnings(session_dir, warnings)
    _write_summary(session_dir, session_id, df, shots, swing_starts, warnings)

    print(f"[merge] wrote {csv_path.name}: {len(rows)} shot row(s), "
          f"{len(matched_swing_indices)} matched swing(s), {len(warnings)} warning(s).")
    return csv_path


def _nearest_swing(shot_wall, swing_starts):
    if shot_wall is None or not swing_starts:
        return None, float("inf")
    best, best_delta = None, float("inf")
    for sw in swing_starts:
        sw_wall = sw.get("wall")
        if sw_wall is None:
            continue
        delta = abs(sw_wall - shot_wall)
        if delta < best_delta:
            best_delta, best = delta, sw
    return best, best_delta


def _load_impact_metrics(session_dir: Path, swing_index: int):
    path = session_dir / f"swing_{swing_index:03d}_metrics.json"
    if not path.exists():
        return None
    data = read_json(path)
    if data.get("error"):
        return None
    return data.get("impact_metrics")


def _write_warnings(session_dir: Path, warnings: list[str]):
    path = session_dir / "merge_warnings.txt"
    with open(path, "w") as fh:
        fh.write(f"# merge warnings — {datetime.now().isoformat(timespec='seconds')}\n")
        if not warnings:
            fh.write("(none)\n")
        for w in warnings:
            fh.write(w + "\n")


def _write_summary(session_dir, session_id, df, shots, swing_starts, warnings):
    matched = int((df["match_confidence"].isin(["high", "low"])).sum())
    duration = _session_duration(session_dir, shots, swing_starts)

    per_club = {}
    if not df.empty and "club_type" in df:
        for club, group in df.groupby(df["club_type"].fillna("unknown")):
            per_club[str(club)] = {
                m: _safe_mean(group[m]) for m in NUMERIC_METRICS if m in group
            }

    summary = {
        "session_id": session_id,
        "total_shots": len(shots),
        "matched_shots": matched,
        "unmatched_shots": len(shots) - matched,
        "total_swing_events": len(swing_starts),
        "session_duration_seconds": duration,
        "per_club_averages": per_club,
        "warnings": warnings,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }
    write_json(session_dir / "session_summary.json", summary)


def _session_duration(session_dir, shots, swing_starts):
    walls = []
    frame_index = read_jsonl(session_dir / "frame_index.jsonl")
    if frame_index:
        walls += [f["wall"] for f in frame_index]
    walls += [s.get("wall") for s in shots if s.get("wall") is not None]
    walls += [s.get("wall") for s in swing_starts if s.get("wall") is not None]
    walls = [w for w in walls if w is not None]
    return round(max(walls) - min(walls), 2) if len(walls) >= 2 else 0.0


def _safe_mean(series):
    s = pd.to_numeric(series, errors="coerce").dropna()
    return round(float(s.mean()), 2) if len(s) else None
