"""Prove the pipeline end-to-end WITHOUT a live cam or an API key.

Fabricates a small dataset where the audio features genuinely carry behavior
information (with extra noise on 'night' clips to mimic harder conditions),
writes it into the same files the real pipeline uses, then runs the correlation
+ money-plot step. If this prints a day/night accuracy table above baseline and
writes out/moneyplot.png, your environment and plumbing are sound.

Usage:
    python selftest.py
"""

import csv

import numpy as np

import config
import correlate

FEAT_LEN = 32 * 2 + 4   # must match audio_features.extract()
RMS_IDX = -4            # energy feature index


def make():
    rng = np.random.default_rng(0)
    behaviors = config.BEHAVIORS
    # a distinct centroid per behavior so audio is informative (modest
    # separation, so accuracy lands realistically below 1.0)
    centers = {b: rng.normal(0, 1.6, FEAT_LEN) for b in behaviors}
    # make begging/feeding louder (higher energy) — the interpretable signal
    for b in ("begging", "feeding"):
        centers[b][RMS_IDX] += 3.0

    manifest_rows, label_rows, feats = [], [], {}
    n_per = 30
    for b in behaviors:
        for k in range(n_per):
            is_night = int(k % 2 == 0)             # half day, half night
            noise = 4.0 if is_night else 1.5       # night is harder, not hopeless
            cid = f"syn_{b}_{k:03d}"
            vec = centers[b] + rng.normal(0, noise, FEAT_LEN)
            feats[cid] = vec.astype(np.float32)
            label_rows.append({"id": cid, "behavior": b})
            manifest_rows.append({
                "id": cid, "time": "2026-01-01T00:00:00",
                "is_night": is_night, "has_frame": 1, "has_wav": 1,
            })

    with open(config.MANIFEST, "w", newline="") as f:
        w = csv.DictWriter(
            f, fieldnames=["id", "time", "is_night", "has_frame", "has_wav"])
        w.writeheader()
        w.writerows(manifest_rows)
    with open(config.LABELS_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["id", "behavior"])
        w.writeheader()
        w.writerows(label_rows)
    np.savez(config.FEATURES_NPZ, **feats)
    print(f"Fabricated {len(feats)} synthetic clips "
          f"({len(config.BEHAVIORS)} behaviors, day+night).")


if __name__ == "__main__":
    make()
    print("\nRunning the real correlate step on the synthetic data...\n")
    correlate.main()
    print("\nSelftest done. If accuracy beat baseline and out/moneyplot.png "
          "exists, the pipeline works. Now wire up a real cam in config.py.")
