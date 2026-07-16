"""Align audio <-> behavior, find the signal, and make the money plot.

Two outputs:

1. A co-occurrence readout (interpretable, no ML): mean audio energy per
   behavior. Answers "does sound relate to behavior at all?" — e.g. begging and
   feeding should be louder than resting.

2. THE MONEY PLOT: can we recover behavior *from audio alone*, and does it hold
   up at night? We cross-validate a simple classifier that predicts the
   behavior label from the audio feature vector, and report accuracy separately
   for day vs night clips, against a majority-class baseline.

   Honest caveat for the writeup: the behavior labels themselves come from the
   *vision* model, which is exactly what degrades at night. So the truly
   rigorous "video collapses / audio holds" figure needs a HUMAN-labeled night
   ground-truth set. This prototype shows the audio->behavior signal exists and
   persists into night clips; the human night audit is the next step.

Usage:
    python correlate.py
Reads manifest + labels + features; writes out/moneyplot.png and out/summary.csv.
"""

import csv
import sys

import numpy as np

import config


def load_joined():
    """Return aligned arrays: ids, X (features), y (behavior), night (bool)."""
    # manifest: id -> is_night
    night = {}
    if config.MANIFEST.exists():
        with open(config.MANIFEST) as f:
            for r in csv.DictReader(f):
                night[r["id"]] = int(r["is_night"])
    # labels: id -> behavior
    labels = {}
    if not config.LABELS_CSV.exists():
        sys.exit("No labels. Run label_behavior.py (or selftest.py) first.")
    with open(config.LABELS_CSV) as f:
        for r in csv.DictReader(f):
            labels[r["id"]] = r["behavior"]
    # features: id -> vector
    if not config.FEATURES_NPZ.exists():
        sys.exit("No features. Run audio_features.py (or selftest.py) first.")
    feats = np.load(config.FEATURES_NPZ)

    ids, X, y, ng = [], [], [], []
    for cid in feats.files:
        if cid in labels:
            ids.append(cid)
            X.append(feats[cid])
            y.append(labels[cid])
            ng.append(night.get(cid, 0))
    if not ids:
        sys.exit("No clips have both a label and features.")
    return ids, np.array(X), np.array(y), np.array(ng, dtype=bool)


def cooccurrence(X, y):
    """Mean audio energy (RMS = 4th-from-last feature) per behavior."""
    rms = X[:, -4]
    print("\n--- Co-occurrence: mean audio energy by behavior ---")
    rows = []
    for beh in sorted(set(y)):
        m = rms[y == beh]
        if m.size:
            print(f"  {beh:10s}  energy={m.mean():+.3f}   n={m.size}")
            rows.append({"behavior": beh, "mean_energy": float(m.mean()),
                         "n": int(m.size)})
    return rows


def money_plot(ids, X, y, night):
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import cross_val_predict

    n = len(y)
    classes, counts = np.unique(y, return_counts=True)
    majority_acc = counts.max() / n

    # Cross-validated behavior-from-audio predictions.
    folds = min(5, n // len(classes)) if len(classes) > 1 else 2
    folds = max(2, folds)
    try:
        pred = cross_val_predict(
            RandomForestClassifier(n_estimators=200, random_state=0),
            X, y, cv=folds,
        )
    except ValueError as e:
        sys.exit(f"Not enough data to cross-validate ({e}). Capture more clips.")

    def acc(mask):
        return float((pred[mask] == y[mask]).mean()) if mask.any() else float("nan")

    day_mask = ~night
    overall = acc(np.ones(n, bool))
    day_acc = acc(day_mask)
    night_acc = acc(night)

    print("\n--- MONEY PLOT: behavior-from-audio accuracy ---")
    print(f"  majority-class baseline : {majority_acc:.2f}")
    print(f"  audio, overall          : {overall:.2f}  (n={n})")
    print(f"  audio, DAY clips        : {day_acc:.2f}  (n={int(day_mask.sum())})")
    print(f"  audio, NIGHT clips      : {night_acc:.2f}  (n={int(night.sum())})")

    # plot
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(6, 4))
    bars = ["baseline", "audio\n(day)", "audio\n(night)"]
    vals = [majority_acc, day_acc, night_acc]
    colors = ["#bbbbbb", "#3b7dd8", "#1f3a93"]
    vals = [0 if (v != v) else v for v in vals]  # NaN -> 0 for drawing
    ax.bar(bars, vals, color=colors)
    ax.axhline(majority_acc, ls="--", c="#888", lw=1)
    ax.set_ylim(0, 1.15)
    ax.set_ylabel("behavior recognition accuracy")
    ax.set_title("Can audio recover behavior — even at night?", pad=12)
    for i, v in enumerate(vals):
        ax.text(i, min(v + 0.03, 1.08), f"{v:.2f}", ha="center", fontsize=10)
    fig.tight_layout()
    out_png = config.OUT / "moneyplot.png"
    fig.savefig(out_png, dpi=130)
    print(f"\nWrote {out_png}")

    return {
        "n": n, "majority_baseline": majority_acc, "audio_overall": overall,
        "audio_day": day_acc, "audio_night": night_acc,
    }


def main():
    ids, X, y, night = load_joined()
    co = cooccurrence(X, y)
    summary = money_plot(ids, X, y, night)

    with open(config.OUT / "summary.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["metric", "value"])
        for k, v in summary.items():
            w.writerow([k, v])
    print(f"Wrote {config.OUT / 'summary.csv'}")


if __name__ == "__main__":
    main()
