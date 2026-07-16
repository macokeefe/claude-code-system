# owl-audio-behavior

A non-invasive pipeline that learns the relationship between an animal's
**behavior** (from video) and its **vocalizations** (from audio), using a
live public nest-cam feed. The proof-of-concept target is a **barn/barred owl
nest cam** — nocturnal, so it directly tests the core thesis:

> **Audio lets us recognize behavior when the camera goes blind (night / IR /
> occlusion).**

This is the first brick in the same wall the animal-communication labs
(Project CETI, Earth Species) are building: decode meaning from *sound* by
**grounding** it in *observed behavior*. Here the grounding is done for us by a
powerful vision-language model, so the human labeling step is replaced by
machine auto-labeling — a human only spot-checks a sample.

## The 2-day plan

**Day 1 — data flowing + auto-labeled**
1. `capture.py`   — pull rolling clips (video + synced audio) from a live cam.
2. `label_behavior.py` — a vision model auto-labels each clip's behavior.
3. `audio_features.py` — each clip's audio → feature vector.

**Day 2 — find the signal + the money plot**
4. `correlate.py` — align audio ↔ behavior, compute co-occurrence stats, and
   produce the payoff figure: **behavior-from-audio accuracy, day vs. night.**

You can run the whole logic *without a live cam or API key first* via
`selftest.py`, which fabricates a tiny dataset and exercises the correlation +
plotting end-to-end. Do that first to confirm your environment works.

## Setup (macOS, Apple Silicon or Intel)

```bash
# 1. system deps
brew install ffmpeg
python3 -m venv .venv && source .venv/bin/activate

# 2. python deps
pip install -r requirements.txt

# 3. (optional, only for real vision labeling) set your Anthropic key
export ANTHROPIC_API_KEY=sk-ant-...

# 4. prove the pipeline works with fabricated data — no cam, no key
python selftest.py
```

`selftest.py` should print a small day-vs-night accuracy table and write
`out/selftest_moneyplot.png`. If that works, the plumbing is sound.

## Running it for real

```bash
# capture 30 minutes of 10s clips from the configured cam
python capture.py --minutes 30

# auto-label behavior on the captured clips (uses claude-haiku-4-5, cheap)
python label_behavior.py

# extract audio features
python audio_features.py

# align, correlate, and make the money plot
python correlate.py
```

Edit `config.py` to point at a different cam or change the behavior label set.

## ⚠️ Legal / ToS note (read before releasing anything)

- Analyzing a public feed privately is one thing; **redistributing the raw
  frames/audio is another.** Cornell and Explore.org terms generally prohibit
  re-posting/mirroring their video. So: **publish derived results — the model,
  the annotations, the audio feature vectors, the findings — never the raw
  footage.**
- For a public *dataset* or a *collaborator*, email the operator (e.g. NC
  Wildlife Resources Commission, or the Owl Research Institute) for research
  permission. That also gets you a credible co-author.

## What this is / isn't

- **Is:** a working proof-of-concept that a behavior↔sound mapping can be
  learned from a public feed, and that audio carries behavior info into the
  dark.
- **Isn't (yet):** a validated, publishable result. That needs the
  human-checked ground-truth set and more data. Two days gets you "it works and
  here's a real signal," which is exactly the right first milestone.
