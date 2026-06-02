"""Webcam capture, frame-accurate timestamping, and motion-based swing detection.

Runs a blocking OpenCV capture loop (intended to live on its own thread) that:

* records continuously to `session_<ID>.mp4` (H.264, falling back to mp4v),
* keeps the last ~10 s of frames in an in-memory rolling buffer,
* logs every frame's index + wall-clock time to `frame_index.jsonl` so any
  wall time can later be mapped to an exact frame, and
* detects motion in the lower half of the frame (club/ball region) to mark
  rough swing start/end events in `swing_events.jsonl`.

`extract_swing_clip` cuts an individual `swing_NNN.mp4` from the session video
using the frame index, with configurable padding.
"""

from __future__ import annotations

import threading
from collections import deque
from pathlib import Path

import cv2
import numpy as np

from session_paths import Clock, append_jsonl, read_jsonl

# Motion detection tuning.
MOTION_THRESHOLD = 25            # per-pixel abs-diff threshold (0-255)
MOTION_AREA_FRACTION = 0.02      # fraction of lower-half pixels that must move
SWING_END_QUIET_S = 2.0          # motion-quiet duration that ends a swing
ROLLING_BUFFER_SECONDS = 10.0


def list_available_cameras(max_index: int = 6) -> list[int]:
    """Probe camera indices 0..max_index-1 and return those that open."""
    available = []
    for idx in range(max_index):
        cap = cv2.VideoCapture(idx)
        if cap is not None and cap.isOpened():
            available.append(idx)
        if cap is not None:
            cap.release()
    return available


class WebcamError(RuntimeError):
    pass


class VideoRecorder:
    """Threaded continuous webcam recorder with motion-based swing detection."""

    def __init__(self, session_dir: Path, clock: Clock, session_id: str,
                 camera_index: int = 0, on_swing_event=None):
        self.session_dir = session_dir
        self.clock = clock
        self.session_id = session_id
        self.camera_index = camera_index
        self.on_swing_event = on_swing_event  # callback(event_dict)

        self.video_path = session_dir / f"session_{session_id}.mp4"
        self.frame_index_path = session_dir / "frame_index.jsonl"
        self.swing_events_path = session_dir / "swing_events.jsonl"

        self.fps = 30.0
        self.width = 0
        self.height = 0
        self._cap = None
        self._writer = None
        self._thread = None
        self._stop = threading.Event()
        self.rolling_buffer = deque()
        self.frame_count = 0
        self.swing_count = 0

        # Motion state machine.
        self._prev_gray = None
        self._in_swing = False
        self._swing_start_wall = None
        self._last_motion_wall = None

    # -- lifecycle ------------------------------------------------------------

    def open(self):
        cap = cv2.VideoCapture(self.camera_index)
        if not cap.isOpened():
            cap.release()
            available = list_available_cameras()
            raise WebcamError(
                f"Failed to open webcam at index {self.camera_index}. "
                f"Available camera indices: {available or 'none detected'}. "
                "On macOS, grant Terminal camera access in "
                "System Settings > Privacy & Security > Camera."
            )

        # Request the highest resolution the device reports, then 60fps->30fps.
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 3840)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 2160)
        cap.set(cv2.CAP_PROP_FPS, 60)

        self.width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        reported_fps = cap.get(cv2.CAP_PROP_FPS)
        self.fps = reported_fps if 1.0 < reported_fps <= 120.0 else 30.0
        self._cap = cap

        writer = self._make_writer()
        if writer is None or not writer.isOpened():
            cap.release()
            raise WebcamError("Failed to initialize the video writer (codec/permissions).")
        self._writer = writer

        print(f"[video] webcam open: {self.width}x{self.height} @ {self.fps:.0f}fps "
              f"-> {self.video_path.name}")

    def _make_writer(self):
        # Prefer H.264 (avc1); fall back to mp4v which is universally available.
        for fourcc_str in ("avc1", "H264", "mp4v"):
            fourcc = cv2.VideoWriter_fourcc(*fourcc_str)
            writer = cv2.VideoWriter(str(self.video_path), fourcc, self.fps,
                                     (self.width, self.height))
            if writer.isOpened():
                if fourcc_str == "mp4v":
                    print("[video] H.264 unavailable; using mp4v fallback codec.")
                return writer
        return None

    def start(self):
        if self._cap is None:
            self.open()
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="video-capture", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5.0)
        # Close any swing left open at shutdown.
        if self._in_swing and self._swing_start_wall is not None:
            self._end_swing(self.clock.wall())
        if self._writer is not None:
            self._writer.release()
        if self._cap is not None:
            self._cap.release()
        print(f"[video] stopped. {self.frame_count} frames, {self.swing_count} swing events.")

    # -- capture loop ---------------------------------------------------------

    def _loop(self):
        buffer_len = int(ROLLING_BUFFER_SECONDS * self.fps)
        while not self._stop.is_set():
            ok, frame = self._cap.read()
            if not ok:
                # Transient read failure; keep trying rather than crashing.
                continue
            stamp = self.clock.stamp()
            idx = self.frame_count
            self.frame_count += 1

            self._writer.write(frame)
            append_jsonl(self.frame_index_path, {
                "frame_index": idx, "wall": stamp["wall"],
                "perf": stamp["perf"], "iso": stamp["iso"],
            })

            self.rolling_buffer.append((idx, stamp["wall"], frame))
            while len(self.rolling_buffer) > buffer_len:
                self.rolling_buffer.popleft()

            self._detect_motion(frame, stamp["wall"])

    # -- motion detection -----------------------------------------------------

    def _detect_motion(self, frame, wall: float):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (21, 21), 0)
        lower = gray[gray.shape[0] // 2:, :]  # club/ball region

        if self._prev_gray is None:
            self._prev_gray = lower
            return

        delta = cv2.absdiff(self._prev_gray, lower)
        self._prev_gray = lower
        _, thresh = cv2.threshold(delta, MOTION_THRESHOLD, 255, cv2.THRESH_BINARY)
        moving_fraction = float(np.count_nonzero(thresh)) / thresh.size
        is_moving = moving_fraction >= MOTION_AREA_FRACTION

        if is_moving:
            self._last_motion_wall = wall
            if not self._in_swing:
                self._start_swing(wall)
        elif self._in_swing and self._last_motion_wall is not None:
            if wall - self._last_motion_wall >= SWING_END_QUIET_S:
                self._end_swing(self._last_motion_wall)

    def _start_swing(self, wall: float):
        self._in_swing = True
        self._swing_start_wall = wall
        self.swing_count += 1
        event = {"event": "swing_start", "swing_index": self.swing_count,
                 "wall": wall, "iso": _iso(wall)}
        append_jsonl(self.swing_events_path, event)
        print(f"[video] motion: swing #{self.swing_count} start")
        if self.on_swing_event:
            self.on_swing_event(event)

    def _end_swing(self, wall: float):
        event = {"event": "swing_end", "swing_index": self.swing_count,
                 "wall": wall, "iso": _iso(wall),
                 "start_wall": self._swing_start_wall}
        append_jsonl(self.swing_events_path, event)
        print(f"[video] motion: swing #{self.swing_count} end "
              f"({wall - (self._swing_start_wall or wall):.1f}s)")
        if self.on_swing_event:
            self.on_swing_event(event)
        self._in_swing = False
        self._swing_start_wall = None


def _iso(wall: float) -> str:
    from datetime import datetime
    return datetime.fromtimestamp(wall).isoformat(timespec="milliseconds")


# ---------------------------------------------------------------------------
# Clip extraction (post-session)
# ---------------------------------------------------------------------------

def extract_swing_clip(session_dir: Path, swing_index: int, start_time: float,
                       end_time: float, padding_seconds: float = 1.5,
                       session_id: str | None = None) -> Path | None:
    """Cut swing_NNN.mp4 from the session video between two wall-clock times.

    Uses frame_index.jsonl to translate wall times into frame numbers, applies
    `padding_seconds` on both ends, and re-encodes the frame range. Returns the
    output path, or None if the source video/frame index is unavailable.
    """
    frame_index = read_jsonl(session_dir / "frame_index.jsonl")
    if not frame_index:
        print("[clip] no frame_index.jsonl; cannot extract clip.")
        return None

    # Locate the session video.
    if session_id is not None:
        video_path = session_dir / f"session_{session_id}.mp4"
    else:
        videos = sorted(session_dir.glob("session_*.mp4"))
        if not videos:
            print("[clip] no session video found.")
            return None
        video_path = videos[0]

    walls = [f["wall"] for f in frame_index]
    pad_start = start_time - padding_seconds
    pad_end = end_time + padding_seconds
    start_frame = _nearest_frame(walls, pad_start)
    end_frame = _nearest_frame(walls, pad_end)
    if end_frame <= start_frame:
        end_frame = min(start_frame + 1, len(frame_index) - 1)

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"[clip] cannot open {video_path}")
        return None
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    out_path = session_dir / f"swing_{swing_index:03d}.mp4"
    writer = None
    for fourcc_str in ("avc1", "mp4v"):
        writer = cv2.VideoWriter(str(out_path), cv2.VideoWriter_fourcc(*fourcc_str),
                                 fps, (width, height))
        if writer.isOpened():
            break
    if writer is None or not writer.isOpened():
        cap.release()
        print("[clip] failed to open clip writer.")
        return None

    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    current = start_frame
    while current <= end_frame:
        ok, frame = cap.read()
        if not ok:
            break
        writer.write(frame)
        current += 1
    writer.release()
    cap.release()
    print(f"[clip] wrote {out_path.name} (frames {start_frame}-{end_frame})")
    return out_path


def _nearest_frame(walls: list[float], target_wall: float) -> int:
    """Return the index of the frame whose wall time is closest to target."""
    best_idx, best_delta = 0, float("inf")
    for i, w in enumerate(walls):
        d = abs(w - target_wall)
        if d < best_delta:
            best_delta, best_idx = d, i
    return best_idx
