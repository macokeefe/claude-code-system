"""Auto-label each clip's behavior with a vision model (zero-shot).

This replaces the tedious human-labeling step: a powerful vision model looks at
the representative frame and classifies it into config.BEHAVIORS. Uses
claude-haiku-4-5 (the cheap tier for image classification, $1/$5 per 1M tokens).

A human's job shrinks to *auditing* a sample of these labels, not producing
them. For a real publishable result, spot-check ~50-100 and report the agreement
rate, or run two models and keep only clips where they agree.

Usage:
    export ANTHROPIC_API_KEY=sk-ant-...
    python label_behavior.py
Writes config.LABELS_CSV: id, behavior.
"""

import base64
import csv
import sys

import config

try:
    import anthropic
except ImportError:
    sys.exit("anthropic not installed. pip install -r requirements.txt")


PROMPT = (
    "You are labeling a single frame from an owl nest camera. "
    "Classify the owl's behavior into EXACTLY ONE of these labels:\n"
    + ", ".join(config.BEHAVIORS)
    + "\n\nRules:\n"
    "- If no owl is clearly visible, answer 'absent'.\n"
    "- Night/IR frames are grainy; do your best from posture and context.\n"
    "- Reply with ONLY the single label word, nothing else."
)


def label_frame(client, frame_path) -> str:
    data = base64.standard_b64encode(frame_path.read_bytes()).decode()
    resp = client.messages.create(
        model=config.VISION_MODEL,
        max_tokens=16,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image",
                 "source": {"type": "base64",
                            "media_type": "image/jpeg",
                            "data": data}},
                {"type": "text", "text": PROMPT},
            ],
        }],
    )
    text = "".join(b.text for b in resp.content if b.type == "text").strip().lower()
    # snap to the closest known label (model may add punctuation/whitespace)
    for b in config.BEHAVIORS:
        if b in text:
            return b
    return "absent"


def main() -> None:
    frames = sorted(config.FRAMES.glob("*.jpg"))
    if not frames:
        sys.exit("No frames found. Run capture.py first.")
    client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY / ant profile

    rows = []
    for fp in frames:
        try:
            beh = label_frame(client, fp)
        except anthropic.APIError as e:
            print(f"  !! {fp.stem}: API error {e} -> skipping")
            continue
        rows.append({"id": fp.stem, "behavior": beh})
        print(f"  {fp.stem}: {beh}")

    with open(config.LABELS_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["id", "behavior"])
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} labels -> {config.LABELS_CSV}")


if __name__ == "__main__":
    main()
