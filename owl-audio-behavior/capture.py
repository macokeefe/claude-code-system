"""Capture rolling clips (video + synced audio) from a live cam.

Approach: resolve the live stream with yt-dlp, then let ffmpeg record it in
fixed-length segments. Each segment becomes one clip; we also extract a
representative frame and a wav per clip. A manifest row records the clip id,
wall-clock capture time, and whether it was captured at night (for the
day-vs-night analysis later).

Usage:
    python capture.py --minutes 30
    python capture.py --minutes 5 --url "https://youtube.com/watch?v=..."

This is the one step that needs the live internet feed. It is intentionally
tolerant: if ffmpeg or the stream hiccups, you keep whatever clips landed.
"""

import argparse
import csv
import datetime as dt
import subprocess
import sys
from pathlib import Path

import config


def resolve_stream_url(cam_url: str) -> str:
    """Ask yt-dlp for a direct media URL ffmpeg can read."""
    try:
        out = subprocess.check_output(
            ["yt-dlp", "-g", "-f", "best", cam_url],
            text=True,
            stderr=subprocess.STDOUT,
        )
    except FileNotFoundError:
        sys.exit("yt-dlp not found. pip install -r requirements.txt")
    except subprocess.CalledProcessError as e:
        sys.exit(f"yt-dlp could not resolve the stream:\n{e.output}")
    # yt-dlp may print separate video/audio URLs; ffmpeg reads the first fine
    # for a muxed 'best' stream. Take the first non-empty line.
    for line in out.splitlines():
        if line.strip():
            return line.strip()
    sys.exit("yt-dlp returned no stream URL.")


def is_night(when: dt.datetime) -> bool:
    """Crude night flag by local hour. Good enough for the prototype; swap for
    a real sunrise/sunset calc (e.g. `astral`) once you have the cam's coords."""
    return when.hour < 6 or when.hour >= 20


def capture(cam_url: str, minutes: float) -> None:
    stream_url = resolve_stream_url(cam_url)
    total_seconds = int(minutes * 60)
    seg = config.CLIP_SECONDS
    started = dt.datetime.now()

    # ffmpeg records the live stream into <started>_%05d.mp4 segments.
    prefix = started.strftime("%Y%m%d_%H%M%S")
    seg_pattern = str(config.CLIPS / f"{prefix}_%05d.mp4")

    cmd = [
        "ffmpeg", "-nostdin", "-y",
        "-i", stream_url,
        "-t", str(total_seconds),
        "-f", "segment",
        "-segment_time", str(seg),
        "-reset_timestamps", "1",
        "-c", "copy",              # no re-encode: fast + preserves audio
        seg_pattern,
    ]
    print(f"Recording ~{minutes} min of {seg}s clips from the live feed...")
    try:
        subprocess.run(cmd, check=False)
    except FileNotFoundError:
        sys.exit("ffmpeg not found. brew install ffmpeg")

    # For each produced segment, extract a frame + wav, and write a manifest row.
    rows = []
    segments = sorted(config.CLIPS.glob(f"{prefix}_*.mp4"))
    for i, seg_path in enumerate(segments):
        clip_id = seg_path.stem
        # capture time = start + i * seg (approximate but monotonic)
        when = started + dt.timedelta(seconds=i * seg)
        frame_path = config.FRAMES / f"{clip_id}.jpg"
        wav_path = config.WAVS / f"{clip_id}.wav"

        # representative frame (middle of the clip)
        subprocess.run(
            ["ffmpeg", "-nostdin", "-y", "-ss", str(seg / 2),
             "-i", str(seg_path), "-frames:v", "1", str(frame_path)],
            check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        # mono 16 kHz wav (small, plenty for owl calls)
        subprocess.run(
            ["ffmpeg", "-nostdin", "-y", "-i", str(seg_path),
             "-ac", "1", "-ar", "16000", str(wav_path)],
            check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        rows.append({
            "id": clip_id,
            "time": when.isoformat(timespec="seconds"),
            "is_night": int(is_night(when)),
            "has_frame": int(frame_path.exists()),
            "has_wav": int(wav_path.exists()),
        })

    write_header = not config.MANIFEST.exists()
    with open(config.MANIFEST, "a", newline="") as f:
        w = csv.DictWriter(
            f, fieldnames=["id", "time", "is_night", "has_frame", "has_wav"]
        )
        if write_header:
            w.writeheader()
        w.writerows(rows)

    print(f"Captured {len(rows)} clips -> {config.MANIFEST}")
    if not rows:
        print("No clips landed. Check CAM_URL in config.py and that the "
              "stream is live and yt-dlp-resolvable.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=float, default=10.0)
    ap.add_argument("--url", default=config.CAM_URL)
    a = ap.parse_args()
    capture(a.url, a.minutes)
