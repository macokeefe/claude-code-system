"""
Synthesized sound effects — no external files needed.
Everything is wrapped so that a machine with no audio device degrades silently.
"""
import math
import array
import random

try:
    import pygame
except Exception:           # pragma: no cover
    pygame = None

_RATE     = 22050
_sounds   = {}
_enabled  = False


def init():
    """Initialise the mixer and build the sound bank. Safe to call once."""
    global _enabled
    if pygame is None:
        return
    try:
        pygame.mixer.pre_init(_RATE, -16, 1, 256)
        pygame.mixer.init()
        _build()
        _enabled = True
    except Exception:
        _enabled = False


def play(name: str, volume: float = 1.0):
    if not _enabled:
        return
    snd = _sounds.get(name)
    if snd is not None:
        snd.set_volume(volume)
        snd.play()


# ── Sound synthesis ────────────────────────────────────────────────────────────

def _clamp16(v: float) -> int:
    return max(-32767, min(32767, int(v * 32767)))


def _make(samples) -> "pygame.mixer.Sound":
    buf = array.array("h", (_clamp16(s) for s in samples))
    return pygame.mixer.Sound(buffer=buf.tobytes())


def _tone(freq: float, ms: int, vol: float = 0.4,
          decay: bool = True, attack_ms: int = 4):
    n      = int(_RATE * ms / 1000)
    atk    = max(1, int(_RATE * attack_ms / 1000))
    for i in range(n):
        t   = i / _RATE
        env = (1.0 - i / n) if decay else 1.0
        if i < atk:
            env *= i / atk            # soft attack to avoid clicks
        yield math.sin(2 * math.pi * freq * t) * env * vol


def _noise(ms: int, vol: float = 0.5, decay_pow: float = 2.0):
    n = int(_RATE * ms / 1000)
    for i in range(n):
        env = (1.0 - i / n) ** decay_pow
        yield random.uniform(-1, 1) * env * vol


def _mix(*generators):
    """Sum several sample streams of differing lengths."""
    streams = [list(g) for g in generators]
    length  = max(len(s) for s in streams)
    for i in range(length):
        yield sum(s[i] for s in streams if i < len(s))


def _build():
    random.seed(1)

    # Crisp "crack" of a struck ball: short noise burst + a low thump
    _sounds["hit"] = _make(_mix(
        _noise(55, vol=0.55, decay_pow=3.0),
        _tone(180, 70, vol=0.35, decay=True),
    ))

    # Sand: softer, longer noise
    _sounds["sand"] = _make(_noise(180, vol=0.35, decay_pow=1.6))

    # Splash: descending watery noise
    _sounds["splash"] = _make(_mix(
        _noise(380, vol=0.45, decay_pow=1.3),
        _tone(420, 200, vol=0.18, decay=True),
    ))

    # Out of bounds: low buzzer
    _sounds["ob"] = _make(_mix(
        _tone(150, 320, vol=0.35, decay=True),
        _tone(151, 320, vol=0.30, decay=True),
    ))

    # Hole out: pleasant rising two-note chime + sparkle
    chime = list(_tone(659, 130, vol=0.40)) + list(_tone(988, 240, vol=0.42))
    _sounds["holeout"] = _make(chime)

    # Gentle tick when nudging aim
    _sounds["aim"] = _make(_tone(900, 22, vol=0.18, decay=True))
