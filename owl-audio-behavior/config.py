"""Central configuration for the owl-audio-behavior pipeline.

Edit CAM_URL to point at a different feed. For a 2-day prototype, a
YouTube-hosted owl nest cam with confirmed audio is the path of least
resistance (yt-dlp handles it, ffmpeg segments it).

Analysis here is private/non-redistributive — see README's ToS note before
publishing raw footage.
"""

from pathlib import Path

# --- Feed ------------------------------------------------------------------
# Default: a Cornell Lab owl nest cam (confirmed audio + IR night vision).
# Replace with any live stream URL yt-dlp can resolve. Point at the specific
# cam you have research permission for before building a releasable dataset.
CAM_URL = "https://www.youtube.com/watch?v=REPLACE_WITH_LIVE_OWL_CAM"

# --- Capture ---------------------------------------------------------------
CLIP_SECONDS = 10          # length of each captured clip
FRAME_PER_CLIP = 1         # representative frames sampled per clip for labeling

# --- Behavior label set ----------------------------------------------------
# Keep this small and unambiguous for the prototype. These are what the vision
# model classifies each clip into, and what we ground the audio against.
BEHAVIORS = [
    "feeding",       # adult delivering/feeding prey, or chick eating
    "begging",       # chick begging for food
    "resting",       # sitting still / brooding
    "alert",         # head up, scanning, vigilant
    "absent",        # no owl clearly visible in frame
]

# --- Vision model ----------------------------------------------------------
# Haiku 4.5 is the cheap tier for image classification ($1/$5 per 1M tokens).
VISION_MODEL = "claude-haiku-4-5"

# --- Paths -----------------------------------------------------------------
ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
CLIPS = DATA / "clips"          # <id>.mp4  (video + audio)
FRAMES = DATA / "frames"        # <id>.jpg  (representative frame)
WAVS = DATA / "wavs"            # <id>.wav  (extracted audio)
OUT = ROOT / "out"              # results, plots, csvs

for _p in (CLIPS, FRAMES, WAVS, OUT):
    _p.mkdir(parents=True, exist_ok=True)

# Manifest of captured clips (one row per clip): id, wall-clock time, is_night
MANIFEST = DATA / "manifest.csv"
LABELS_CSV = OUT / "behavior_labels.csv"     # id, behavior, (confidence)
FEATURES_NPZ = OUT / "audio_features.npz"    # id -> feature vector
