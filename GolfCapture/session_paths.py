"""Session directory management and a shared monotonic clock.

All GolfCapture data lives under ~/GolfCapture/sessions/<SESSION_ID>/ where
SESSION_ID is a wall-clock stamp of the form YYYYMMDD_HHMMSS. A `latest`
symlink in the sessions directory always points at the most recent session.

The `Clock` here is the single source of truth for timestamps across the BLE
and video processes. It anchors a high-precision monotonic counter
(`time.perf_counter()`) to wall-clock time captured at the same instant, so
events recorded by independent threads/loops can be compared on a common,
drift-free timeline and still be mapped back to human-readable wall time.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

GOLF_HOME = Path(os.path.expanduser("~")) / "GolfCapture"
SESSIONS_DIR = GOLF_HOME / "sessions"
LATEST_LINK = SESSIONS_DIR / "latest"

SESSION_ID_FORMAT = "%Y%m%d_%H%M%S"
CLOCK_ANCHOR_FILE = "clock_anchor.json"


def new_session_id(now: datetime | None = None) -> str:
    """Return a session id derived from the current local wall-clock time."""
    return (now or datetime.now()).strftime(SESSION_ID_FORMAT)


@dataclass
class Clock:
    """A monotonic clock anchored to wall-clock time.

    `perf()` returns the raw `time.perf_counter()` value (monotonic, immune to
    NTP/system clock adjustments). `wall()` converts any perf value (or "now")
    into a Unix wall-clock timestamp using the anchor captured at construction.
    Both BLE and video logs store both values so byte/frame patterns can be
    correlated precisely while remaining human-readable.
    """

    anchor_perf: float
    anchor_wall: float

    @classmethod
    def start(cls) -> "Clock":
        # Capture the two reads as close together as possible.
        perf = time.perf_counter()
        wall = time.time()
        return cls(anchor_perf=perf, anchor_wall=wall)

    def perf(self) -> float:
        return time.perf_counter()

    def wall(self, perf_value: float | None = None) -> float:
        p = time.perf_counter() if perf_value is None else perf_value
        return self.anchor_wall + (p - self.anchor_perf)

    def stamp(self) -> dict:
        """Return a {perf, wall, iso} timestamp dict for the current instant."""
        p = time.perf_counter()
        w = self.wall(p)
        return {
            "perf": p,
            "wall": w,
            "iso": datetime.fromtimestamp(w).isoformat(timespec="milliseconds"),
        }

    def to_dict(self) -> dict:
        return {"anchor_perf": self.anchor_perf, "anchor_wall": self.anchor_wall}

    @classmethod
    def from_dict(cls, d: dict) -> "Clock":
        return cls(anchor_perf=d["anchor_perf"], anchor_wall=d["anchor_wall"])


def create_session(session_id: str | None = None) -> Path:
    """Create a fresh session directory, write the clock anchor, update latest."""
    session_id = session_id or new_session_id()
    session_dir = SESSIONS_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    clock = Clock.start()
    write_json(session_dir / CLOCK_ANCHOR_FILE, {
        "session_id": session_id,
        **clock.to_dict(),
        "created_iso": datetime.now().isoformat(timespec="seconds"),
    })

    _update_latest_symlink(session_dir)
    return session_dir


def load_clock(session_dir: Path) -> Clock:
    """Load the clock anchor saved for a session."""
    data = read_json(session_dir / CLOCK_ANCHOR_FILE)
    return Clock.from_dict(data)


def _update_latest_symlink(session_dir: Path) -> None:
    try:
        if LATEST_LINK.is_symlink() or LATEST_LINK.exists():
            LATEST_LINK.unlink()
        LATEST_LINK.symlink_to(session_dir, target_is_directory=True)
    except OSError:
        # Symlinks may be unavailable on some filesystems; not fatal.
        pass


def get_session_dir(session_id: str) -> Path:
    path = SESSIONS_DIR / session_id
    if not path.is_dir():
        raise FileNotFoundError(f"No session found at {path}")
    return path


def latest_session_dir() -> Path:
    """Resolve the most recent session, preferring the symlink then mtime."""
    if LATEST_LINK.is_symlink():
        resolved = LATEST_LINK.resolve()
        if resolved.is_dir():
            return resolved
    candidates = [p for p in SESSIONS_DIR.glob("*") if p.is_dir() and p.name != "latest"]
    if not candidates:
        raise FileNotFoundError(f"No sessions found under {SESSIONS_DIR}")
    return max(candidates, key=lambda p: p.stat().st_mtime)


# ---------------------------------------------------------------------------
# Small JSON / JSONL helpers used throughout the codebase.
# ---------------------------------------------------------------------------

def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as fh:
        json.dump(obj, fh, indent=2, default=str)


def read_json(path: Path):
    with open(path) as fh:
        return json.load(fh)


def append_jsonl(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a") as fh:
        fh.write(json.dumps(obj, default=str) + "\n")


def read_jsonl(path: Path) -> list:
    if not Path(path).exists():
        return []
    out = []
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out
