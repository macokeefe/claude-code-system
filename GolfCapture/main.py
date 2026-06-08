#!/usr/bin/env python3
"""GolfCapture — macOS golf session capture & analysis CLI.

Subcommands
-----------
  scan       Discover the Garmin R10 and dump its BLE characteristics. Run this
             first on initial setup to verify connectivity.
  record     Run the BLE listener and webcam recorder concurrently until Ctrl+C.
  analyze    Extract swing clips, run MediaPipe pose estimation, and merge BLE +
             pose data into session_analysis.csv / session_summary.json.
             Use --session YYYYMMDD_HHMMSS to target a specific past session;
             defaults to the most recent session.
  debug-ble  Connect to the R10 and print every raw BLE notification in real
             time (timestamp, UUID, hex, top-5 candidate floats). Useful for
             discovering which characteristic carries shot data. Does NOT write
             any session files. Runs until Ctrl+C.

All session artifacts live under ~/GolfCapture/sessions/<SESSION_ID>/, with a
`latest` symlink tracking the most recent session.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from session_paths import (
    create_session, get_session_dir, latest_session_dir, load_clock,
    new_session_id, read_jsonl,
)


# ---------------------------------------------------------------------------
# scan
# ---------------------------------------------------------------------------

def cmd_scan(_args) -> int:
    from ble_listener import dump_characteristics

    session_dir = create_session()
    print(f"[scan] session dir: {session_dir}")
    ok = asyncio.run(dump_characteristics(session_dir))
    if ok:
        print(f"[scan] success — see {session_dir / 'r10_characteristics.json'}")
        print("[scan] You can now run: python main.py record")
        return 0
    print("[scan] Could not discover/connect to an R10. "
          "Check Bluetooth is on, the R10 is awake, and Terminal has "
          "Bluetooth permission (System Settings > Privacy & Security > Bluetooth).")
    return 1


# ---------------------------------------------------------------------------
# record
# ---------------------------------------------------------------------------

def cmd_record(args) -> int:
    return asyncio.run(_record_async(args))


async def _record_async(args) -> int:
    from ble_listener import R10Listener
    from video_capture import VideoRecorder, WebcamError

    session_id = new_session_id()
    session_dir = create_session(session_id)
    clock = load_clock(session_dir)
    print(f"[record] session {session_id}")
    print(f"[record] writing to {session_dir}")

    # Start the webcam recorder first; abort cleanly if the camera fails.
    recorder = VideoRecorder(session_dir, clock, session_id, camera_index=args.camera)
    try:
        recorder.start()
    except WebcamError as exc:
        print(f"[record] ERROR: {exc}", file=sys.stderr)
        return 2

    listener = R10Listener(session_dir, clock)
    ble_task = asyncio.create_task(listener.run())

    print("[record] recording... press Ctrl+C to stop.")
    try:
        await ble_task
        # BLE finished (e.g. no device) but keep recording video until Ctrl+C.
        while True:
            await asyncio.sleep(1.0)
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        print("\n[record] stopping...")
        listener.stop()
        recorder.stop()
        if not ble_task.done():
            ble_task.cancel()
            try:
                await ble_task
            except (asyncio.CancelledError, Exception):
                pass
        _print_record_summary(session_dir, listener, recorder)
    return 0


def _print_record_summary(session_dir, listener, recorder):
    print("\n===== SESSION SUMMARY =====")
    print(f"  session dir : {session_dir}")
    print(f"  shots parsed: {listener.shot_count}")
    print(f"  frames      : {recorder.frame_count}")
    print(f"  swing events: {recorder.swing_count}")
    print(f"  raw ble log : {(session_dir / 'raw_ble_log.jsonl')}")
    print(f"  video       : {recorder.video_path}")
    print("  Next: python main.py analyze")
    print("===========================")


# ---------------------------------------------------------------------------
# analyze
# ---------------------------------------------------------------------------

def cmd_analyze(args) -> int:
    # Resolve the target session before importing heavy (cv2/mediapipe) modules
    # so a bad --session fails with a clear message, not an ImportError.
    try:
        session_dir = get_session_dir(args.session) if args.session else latest_session_dir()
    except FileNotFoundError as exc:
        print(f"[analyze] {exc}", file=sys.stderr)
        return 1

    from merge_session import merge_session
    from pose_analyzer import analyze_session
    from video_capture import extract_swing_clip

    session_id = session_dir.name
    print(f"[analyze] session {session_id} ({session_dir})")

    # 1) Extract one clip per detected swing from the session video.
    events = read_jsonl(session_dir / "swing_events.jsonl")
    starts = {e["swing_index"]: e for e in events if e.get("event") == "swing_start"}
    ends = {e["swing_index"]: e for e in events if e.get("event") == "swing_end"}
    if starts:
        print(f"[analyze] extracting {len(starts)} swing clip(s)...")
        for idx, start in sorted(starts.items()):
            end = ends.get(idx, {})
            start_wall = start.get("wall")
            end_wall = end.get("wall", start_wall + 3.0 if start_wall else None)
            if start_wall is None:
                continue
            extract_swing_clip(session_dir, idx, start_wall, end_wall,
                               session_id=session_id)
    else:
        print("[analyze] no swing events found; skipping clip extraction.")

    # 2) Pose estimation on every extracted clip.
    analyze_session(session_dir)

    # 3) Merge BLE + pose into CSV + summary.
    csv_path = merge_session(session_dir)
    print(f"[analyze] done. Output: {csv_path}")
    print(f"[analyze] summary: {session_dir / 'session_summary.json'}")
    return 0


# ---------------------------------------------------------------------------
# debug-ble
# ---------------------------------------------------------------------------

def cmd_debug_ble(_args) -> int:
    """Connect to the R10 and stream every raw BLE notification to the terminal.

    Prints timestamp, UUID, hex dump, and the top-5 candidate LE float32 values
    for each notification.  Does NOT write any session files.  Runs until Ctrl+C.
    """
    from ble_listener import debug_ble_live

    try:
        asyncio.run(debug_ble_live())
    except KeyboardInterrupt:
        print("\n[debug-ble] stopped.")
    return 0


# ---------------------------------------------------------------------------
# argparse
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="golfcapture", description="macOS golf session capture & analysis.")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("scan", help="Discover R10 and dump BLE characteristics.")

    p_record = sub.add_parser("record", help="Record BLE + webcam concurrently.")
    p_record.add_argument("--camera", type=int, default=0,
                          help="Webcam index (default 0).")

    p_analyze = sub.add_parser("analyze", help="Pose-analyze + merge a session.")
    p_analyze.add_argument("--session", default=None,
                           help="Session id YYYYMMDD_HHMMSS (default: most recent).")

    sub.add_parser(
        "debug-ble",
        help=(
            "Connect to the R10 and print every raw BLE notification in real time "
            "(timestamp, UUID, hex, top-5 candidate floats). "
            "Does NOT write session files. Runs until Ctrl+C."
        ),
    )

    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "scan":
        return cmd_scan(args)
    if args.command == "record":
        return cmd_record(args)
    if args.command == "analyze":
        return cmd_analyze(args)
    if args.command == "debug-ble":
        return cmd_debug_ble(args)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
