"""Post-session pose estimation and swing biomechanics metrics.

Each `swing_NNN.mp4` clip is run through MediaPipe Pose (model_complexity=2,
segmentation disabled). The full 33-landmark time series is saved to
`swing_NNN_pose.jsonl`; derived biomechanical metrics (per-frame and at the
detected key positions) are saved to `swing_NNN_metrics.json`.

If MediaPipe fails on a clip (poor lighting, occlusion, no detectable pose) the
analyzer writes null metrics for that swing rather than crashing, and the
condition is surfaced to the merger via the metrics file's `error` field.

Coordinate convention (MediaPipe normalized image space): x rightward, y
downward, z toward/away from camera. "Height" therefore means smaller y.
A right-handed golfer is assumed by default, so the *lead* side is the left
limb and the *trail* side is the right limb.
"""

from __future__ import annotations

import math
from pathlib import Path

import cv2
import numpy as np

from session_paths import write_json

# MediaPipe landmark indices.
L_SHOULDER, R_SHOULDER = 11, 12
L_ELBOW, R_ELBOW = 13, 14
L_WRIST, R_WRIST = 15, 16
L_INDEX, R_INDEX = 19, 20
L_HIP, R_HIP = 23, 24

# Right-handed golfer: lead = left, trail = right.
LEAD = {"shoulder": L_SHOULDER, "elbow": L_ELBOW, "wrist": L_WRIST, "index": L_INDEX, "hip": L_HIP}
TRAIL = {"shoulder": R_SHOULDER, "elbow": R_ELBOW, "wrist": R_WRIST, "index": R_INDEX, "hip": R_HIP}

METRIC_KEYS = [
    "lead_arm_angle", "trail_arm_angle", "hip_shoulder_separation",
    "wrist_hinge_angle", "spine_tilt_lateral", "spine_tilt_forward",
]


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def _angle_3pt(a, b, c) -> float | None:
    """Interior angle at b formed by points a-b-c, in degrees (xy plane)."""
    if a is None or b is None or c is None:
        return None
    ba = np.array([a[0] - b[0], a[1] - b[1]])
    bc = np.array([c[0] - b[0], c[1] - b[1]])
    nba, nbc = np.linalg.norm(ba), np.linalg.norm(bc)
    if nba == 0 or nbc == 0:
        return None
    cos = float(np.dot(ba, bc) / (nba * nbc))
    cos = max(-1.0, min(1.0, cos))
    return math.degrees(math.acos(cos))


def _line_angle_xz(p1, p2) -> float | None:
    """Angle (deg) of the p1->p2 line in the transverse (x,z) plane."""
    if p1 is None or p2 is None:
        return None
    return math.degrees(math.atan2(p2[2] - p1[2], p2[0] - p1[0]))


def _tilt_from_vertical(top, bottom, axis: str) -> float | None:
    """Tilt (deg) of the bottom->top spine vector away from vertical.

    axis='lateral' uses the x-y (frontal) plane; axis='forward' uses z-y
    (sagittal). 0 deg means perfectly upright.
    """
    if top is None or bottom is None:
        return None
    dy = top[1] - bottom[1]  # negative because "up" is smaller y
    horiz = (top[0] - bottom[0]) if axis == "lateral" else (top[2] - bottom[2])
    if dy == 0:
        return None
    return abs(math.degrees(math.atan2(horiz, -dy)))


def _midpoint(p1, p2):
    if p1 is None or p2 is None:
        return None
    return [(p1[i] + p2[i]) / 2 for i in range(3)]


# ---------------------------------------------------------------------------
# Per-frame metric computation
# ---------------------------------------------------------------------------

def _frame_metrics(lm: list) -> dict:
    """Compute the derived angle metrics for a single frame's landmarks.

    `lm` is a list of [x, y, z, visibility]; entries may be None if absent.
    """
    def pt(i):
        return lm[i][:3] if i < len(lm) and lm[i] is not None else None

    lead_arm = _angle_3pt(pt(LEAD["shoulder"]), pt(LEAD["elbow"]), pt(LEAD["wrist"]))
    trail_arm = _angle_3pt(pt(TRAIL["shoulder"]), pt(TRAIL["elbow"]), pt(TRAIL["wrist"]))

    shoulder_angle = _line_angle_xz(pt(L_SHOULDER), pt(R_SHOULDER))
    hip_angle = _line_angle_xz(pt(L_HIP), pt(R_HIP))
    separation = (shoulder_angle - hip_angle) if (shoulder_angle is not None and hip_angle is not None) else None

    wrist_hinge = _angle_3pt(pt(LEAD["elbow"]), pt(LEAD["wrist"]), pt(LEAD["index"]))

    spine_top = _midpoint(pt(L_SHOULDER), pt(R_SHOULDER))
    spine_bottom = _midpoint(pt(L_HIP), pt(R_HIP))
    tilt_lat = _tilt_from_vertical(spine_top, spine_bottom, "lateral")
    tilt_fwd = _tilt_from_vertical(spine_top, spine_bottom, "forward")

    return {
        "lead_arm_angle": _round(lead_arm),
        "trail_arm_angle": _round(trail_arm),
        "hip_shoulder_separation": _round(separation),
        "wrist_hinge_angle": _round(wrist_hinge),
        "spine_tilt_lateral": _round(tilt_lat),
        "spine_tilt_forward": _round(tilt_fwd),
    }


def _round(v):
    return round(v, 2) if v is not None else None


def null_metrics(error: str) -> dict:
    """Metrics payload for a clip that could not be analyzed."""
    impact = {k: None for k in METRIC_KEYS}
    impact.update({"swing_tempo_backswing_ms": None,
                   "swing_tempo_downswing_ms": None,
                   "hip_lateral_shift_px": None})
    return {"error": error, "frames_analyzed": 0, "key_positions": {},
            "impact_metrics": impact}


# ---------------------------------------------------------------------------
# Clip processing
# ---------------------------------------------------------------------------

def process_swing_clip(clip_path: Path, session_dir: Path) -> dict:
    """Run pose estimation on one clip and write pose + metrics files.

    Returns the metrics dict (also written to swing_NNN_metrics.json).
    """
    try:
        import mediapipe as mp
    except ImportError as exc:
        metrics = null_metrics(f"mediapipe import failed: {exc}")
        _write_metrics(clip_path, session_dir, metrics)
        return metrics

    stem = clip_path.stem  # e.g. swing_001
    pose_path = session_dir / f"{stem}_pose.jsonl"

    cap = cv2.VideoCapture(str(clip_path))
    if not cap.isOpened():
        metrics = null_metrics(f"could not open clip {clip_path.name}")
        _write_metrics(clip_path, session_dir, metrics)
        return metrics
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    landmark_series: list[list] = []
    per_frame: list[dict] = []

    try:
        with mp.solutions.pose.Pose(model_complexity=2, enable_segmentation=False,
                                    min_detection_confidence=0.5,
                                    min_tracking_confidence=0.5) as pose:
            with open(pose_path, "w") as pose_fh:
                frame_idx = 0
                while True:
                    ok, frame = cap.read()
                    if not ok:
                        break
                    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    result = pose.process(rgb)
                    if result.pose_landmarks:
                        lm = [[round(p.x, 5), round(p.y, 5), round(p.z, 5),
                               round(p.visibility, 4)]
                              for p in result.pose_landmarks.landmark]
                    else:
                        lm = [None] * 33
                    landmark_series.append(lm)
                    fm = _frame_metrics(lm)
                    per_frame.append(fm)
                    pose_fh.write(_jsonl_line({"frame": frame_idx, "landmarks": lm}))
                    frame_idx += 1
    except Exception as exc:  # MediaPipe runtime failure on a bad clip
        cap.release()
        metrics = null_metrics(f"mediapipe failed on {clip_path.name}: {exc}")
        _write_metrics(clip_path, session_dir, metrics)
        return metrics
    cap.release()

    if not any(any(p is not None for p in lm) for lm in landmark_series):
        metrics = null_metrics(f"no pose landmarks detected in {clip_path.name}")
        _write_metrics(clip_path, session_dir, metrics)
        return metrics

    metrics = _compute_metrics(landmark_series, per_frame, fps)
    _write_metrics(clip_path, session_dir, metrics)
    print(f"[pose] {clip_path.name}: {len(landmark_series)} frames, "
          f"impact@frame {metrics['key_positions'].get('impact')}")
    return metrics


def _compute_metrics(landmark_series, per_frame, fps) -> dict:
    n = len(landmark_series)

    def wrist_y(i, key):
        lm = landmark_series[i]
        p = lm[key["wrist"]]
        return p[1] if p is not None else None

    # Lead-wrist velocity (normalized units/frame) -> impact = max velocity.
    velocities = [0.0] * n
    for i in range(1, n):
        prev = landmark_series[i - 1][LEAD["wrist"]]
        cur = landmark_series[i][LEAD["wrist"]]
        if prev is not None and cur is not None:
            velocities[i] = math.hypot(cur[0] - prev[0], cur[1] - prev[1]) * fps

    impact = int(np.argmax(velocities)) if any(velocities) else n // 2

    # Top of backswing = max height (min y) of lead wrist over whole clip.
    top = _argmin_height(landmark_series, LEAD["wrist"])
    # Follow-through peak = max height of trail wrist after impact.
    finish = _argmin_height(landmark_series, TRAIL["wrist"], start=impact) or (n - 1)

    # First detected movement: first frame with appreciable lead-wrist velocity.
    movement_start = next((i for i, v in enumerate(velocities) if v > 0.02), 0)

    backswing_ms = ((impact - movement_start) / fps) * 1000.0 if impact >= movement_start else None
    downswing_ms = ((finish - impact) / fps) * 1000.0 if finish >= impact else None

    # Weight-shift proxy: lateral hip-midpoint displacement address->impact,
    # expressed in pixels of a nominal 1920-wide frame (normalized x * 1920).
    hip_addr = _hip_mid_x(landmark_series, 0)
    hip_impact = _hip_mid_x(landmark_series, impact)
    hip_shift_px = round(abs(hip_impact - hip_addr) * 1920, 2) if (
        hip_addr is not None and hip_impact is not None) else None

    impact_metrics = dict(per_frame[impact])
    impact_metrics["swing_tempo_backswing_ms"] = _round(backswing_ms)
    impact_metrics["swing_tempo_downswing_ms"] = _round(downswing_ms)
    impact_metrics["hip_lateral_shift_px"] = hip_shift_px

    return {
        "error": None,
        "frames_analyzed": n,
        "fps": fps,
        "key_positions": {"top_of_backswing": top, "impact": impact,
                          "follow_through": finish, "movement_start": movement_start},
        "key_position_metrics": {
            "top_of_backswing": per_frame[top] if top is not None else None,
            "impact": per_frame[impact],
            "follow_through": per_frame[finish] if finish is not None else None,
        },
        "impact_metrics": impact_metrics,
        "per_frame_metrics": per_frame,
    }


def _argmin_height(series, idx, start: int = 0):
    """Frame index with the smallest y (=highest point) for landmark `idx`."""
    best_i, best_y = None, float("inf")
    for i in range(start, len(series)):
        p = series[i][idx]
        if p is not None and p[1] < best_y:
            best_y, best_i = p[1], i
    return best_i


def _hip_mid_x(series, i):
    if i is None or i >= len(series):
        return None
    lh, rh = series[i][L_HIP], series[i][R_HIP]
    if lh is None or rh is None:
        return None
    return (lh[0] + rh[0]) / 2


def _write_metrics(clip_path: Path, session_dir: Path, metrics: dict):
    out = session_dir / f"{clip_path.stem}_metrics.json"
    write_json(out, metrics)


def _jsonl_line(obj) -> str:
    import json
    return json.dumps(obj) + "\n"


def analyze_session(session_dir: Path) -> list[dict]:
    """Run pose estimation on every swing_NNN.mp4 clip in the session."""
    clips = sorted(session_dir.glob("swing_[0-9][0-9][0-9].mp4"))
    if not clips:
        print(f"[pose] no swing clips found in {session_dir}")
        return []
    print(f"[pose] analyzing {len(clips)} swing clip(s)...")
    return [process_swing_clip(c, session_dir) for c in clips]
