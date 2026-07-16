"""Turn each clip's audio into a fixed-length feature vector.

For a prototype we use compact, interpretable features rather than a big
pretrained embedding: log-mel statistics + energy + spectral shape + zero
crossing. These already separate "call vs silence vs which call" surprisingly
well and run instantly on a laptop. Swap in a pretrained bioacoustic embedding
(BirdNET / BirdAVES / NatureLM-audio) later for a real accuracy jump — the rest
of the pipeline doesn't change.

Usage:
    python audio_features.py
Writes config.FEATURES_NPZ mapping clip id -> feature vector.
"""

import sys

import numpy as np

import config

try:
    import librosa
except ImportError:
    sys.exit("librosa not installed. pip install -r requirements.txt")

SR = 16000
N_MELS = 32


def extract(wav_path) -> np.ndarray:
    """Return a 1-D feature vector for one wav file."""
    y, _ = librosa.load(wav_path, sr=SR, mono=True)
    if y.size == 0:
        return np.zeros(N_MELS * 2 + 4, dtype=np.float32)

    # log-mel spectrogram -> per-band mean & std (captures call timbre)
    mel = librosa.feature.melspectrogram(y=y, sr=SR, n_mels=N_MELS)
    logmel = librosa.power_to_db(mel + 1e-10)
    mel_mean = logmel.mean(axis=1)
    mel_std = logmel.std(axis=1)

    # coarse scalars: loudness, brightness, noisiness, "how much is happening"
    rms = float(librosa.feature.rms(y=y).mean())
    centroid = float(librosa.feature.spectral_centroid(y=y, sr=SR).mean())
    zcr = float(librosa.feature.zero_crossing_rate(y).mean())
    flatness = float(librosa.feature.spectral_flatness(y=y).mean())

    return np.concatenate(
        [mel_mean, mel_std, [rms, centroid, zcr, flatness]]
    ).astype(np.float32)


def main() -> None:
    wavs = sorted(config.WAVS.glob("*.wav"))
    if not wavs:
        sys.exit("No wavs found. Run capture.py first (or selftest.py).")
    feats = {}
    for wp in wavs:
        feats[wp.stem] = extract(wp)
        print(f"  featurized {wp.stem}")
    np.savez(config.FEATURES_NPZ, **feats)
    print(f"Wrote {len(feats)} feature vectors -> {config.FEATURES_NPZ}")


if __name__ == "__main__":
    main()
