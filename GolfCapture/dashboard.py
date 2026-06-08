#!/usr/bin/env python3
"""GolfCapture web dashboard.

Run with:
    python dashboard.py
Then open http://localhost:5050 in your browser.
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
from pathlib import Path

from flask import Flask, Response, jsonify, render_template, request, stream_with_context

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------

SESSIONS_DIR = Path.home() / "GolfCapture" / "sessions"
PROJECT_DIR = Path(__file__).parent

# Active record subprocess (module-level; only one at a time)
_record_proc: "subprocess.Popen | None" = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _stream_subprocess(cmd: list, cwd=None):
    """Generator that yields SSE-formatted lines from a subprocess."""
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
        text=True,
        cwd=str(cwd or PROJECT_DIR),
    )
    try:
        for line in proc.stdout:
            line = line.rstrip("\n")
            yield f"data: {line}\n\n"
        proc.wait()
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
    yield "data: DONE\n\n"


def _sse_response(generator):
    return Response(
        stream_with_context(generator),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("dashboard.html")


@app.route("/api/scan", methods=["POST"])
def api_scan():
    cmd = [sys.executable, "main.py", "scan"]
    return _sse_response(_stream_subprocess(cmd))


@app.route("/api/record/start", methods=["POST"])
def api_record_start():
    global _record_proc

    # Kill any existing record process
    if _record_proc is not None and _record_proc.poll() is None:
        try:
            _record_proc.send_signal(signal.SIGINT)
            _record_proc.wait()
        except (ProcessLookupError, OSError):
            pass

    cmd = [sys.executable, "main.py", "record"]
    _record_proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
        text=True,
        cwd=str(PROJECT_DIR),
    )
    proc = _record_proc

    def generate():
        try:
            for line in proc.stdout:
                line = line.rstrip("\n")
                yield f"data: {line}\n\n"
            proc.wait()
        finally:
            pass
        yield "data: DONE\n\n"

    return _sse_response(generate())


@app.route("/api/record/stop", methods=["POST"])
def api_record_stop():
    global _record_proc
    if _record_proc is None:
        return jsonify({"status": "no_process"})
    if _record_proc.poll() is not None:
        _record_proc = None
        return jsonify({"status": "already_stopped"})
    try:
        _record_proc.send_signal(signal.SIGINT)
    except (ProcessLookupError, OSError):
        pass
    return jsonify({"status": "stopped"})


@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    session = request.args.get("session")
    cmd = [sys.executable, "main.py", "analyze"]
    if session:
        cmd += ["--session", session]
    return _sse_response(_stream_subprocess(cmd))


@app.route("/api/sessions")
def api_sessions():
    if not SESSIONS_DIR.exists():
        return jsonify([])
    entries = []
    for p in sorted(SESSIONS_DIR.iterdir(), reverse=True):
        if p.name == "latest":
            continue
        if p.is_symlink():
            continue
        if p.is_dir():
            entries.append(p.name)
    return jsonify(entries)


@app.route("/api/session/<session_id>")
def api_session(session_id: str):
    session_dir = SESSIONS_DIR / session_id
    if not session_dir.exists():
        return jsonify({"error": "not found"}), 404

    files = [f.name for f in session_dir.iterdir() if f.is_file()]

    # Count shots from shots_raw.jsonl
    shot_count = 0
    shots_file = session_dir / "shots_raw.jsonl"
    if shots_file.exists():
        try:
            with open(shots_file) as fh:
                shot_count = sum(1 for line in fh if line.strip())
        except Exception:
            pass

    # Count swings from swing_events.jsonl
    swing_count = 0
    swing_file = session_dir / "swing_events.jsonl"
    if swing_file.exists():
        try:
            with open(swing_file) as fh:
                swing_count = sum(
                    1 for line in fh
                    if line.strip() and '"swing_start"' in line
                )
        except Exception:
            pass

    analyzed = (session_dir / "session_analysis.csv").exists()

    return jsonify({
        "session_id": session_id,
        "files": files,
        "shot_count": shot_count,
        "swing_count": swing_count,
        "analyzed": analyzed,
    })


@app.route("/api/session/<session_id>/csv")
def api_session_csv(session_id: str):
    csv_path = SESSIONS_DIR / session_id / "session_analysis.csv"
    if not csv_path.exists():
        return jsonify({"error": "not found"}), 404
    try:
        import pandas as pd
        df = pd.read_csv(csv_path)
        return jsonify(df.to_dict("records"))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/session/<session_id>/summary")
def api_session_summary(session_id: str):
    summary_path = SESSIONS_DIR / session_id / "session_summary.json"
    if not summary_path.exists():
        return jsonify({"error": "not found"}), 404
    try:
        with open(summary_path) as fh:
            return jsonify(json.load(fh))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("GolfCapture Dashboard running at http://localhost:5050")
    app.run(host="0.0.0.0", port=5050, debug=False, threaded=True)
