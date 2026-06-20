"""Structural mispricing scanner — edges that need no view on the world.

The cleanest is the *time-ladder*: the same yes/no question at different
deadlines. Logic forces the YES price to be non-decreasing as the deadline
extends — "X by March" can never be worth more than "X by June", because
more time can only make X more likely. When the market violates that, the
gap is a locked profit you collect regardless of whether X happens:

    P(by March)=30c, P(by April)=25c  -> buy YES@April, buy NO@March.
    Worst case you net the 5c gap; you never lose. (Before fees/spread.)

This file finds those violations. It does NOT predict anything — it only
checks the market against arithmetic it must obey. Detection is on the mid
(YES) price; whether a violation survives the bid/ask spread + fees is the
execution question, flagged but not assumed.
"""

from __future__ import annotations

import logging
import re
from collections import defaultdict

log = logging.getLogger("whale_engine.mispricing")

# temporal tail to strip so "... by March 31?" and "... before 2027?" group together
_DATE = (r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|"
         r"january|february|march|april|june|july|august|september|october|"
         r"november|december|monday|tuesday|wednesday|thursday|friday|"
         r"saturday|sunday|q[1-4]|20\d\d|\d{1,2}(?:st|nd|rd|th)?|"
         r"end\b|eo[my]\b|the\s+end)")
_TEMPORAL = re.compile(
    r"\s+(?:by|before|after|on|through|until|in|during|this|next)\s+" + _DATE
    + r".*$", re.I)
_PUNCT = re.compile(r"[^a-z0-9 ]+")
_SPACE = re.compile(r"\s+")


def stem(question: str) -> str:
    """Strip the deadline phrase so a ladder's rungs share one key."""
    s = question.strip().lower().rstrip("?")
    s = _TEMPORAL.sub("", s)
    s = _PUNCT.sub(" ", s)
    return _SPACE.sub(" ", s).strip()


def find_ladders(markets: list[dict], min_gap: float = 0.03,
                 min_liquidity: float = 500.0) -> dict:
    """Group markets into time-ladders and flag monotonicity violations.

    A violation: an earlier-deadline rung priced more than `min_gap` above a
    later-deadline rung (both with at least `min_liquidity`). The gap is the
    per-pair locked profit. Returns groups (for tuning) and ranked violations.
    """
    groups: dict[str, list] = defaultdict(list)
    for m in markets:
        groups[stem(m["question"])].append(m)

    ladders, violations = [], []
    for key, ms in groups.items():
        if len(ms) < 2:
            continue
        ms = sorted(ms, key=lambda x: x["end"])  # ISO dates sort chronologically
        if len({m["end"][:10] for m in ms}) < 2:
            continue  # same deadline -> not a ladder (likely duplicates/candidates)
        ladders.append((key, ms))
        for early, late in zip(ms, ms[1:]):
            gap = early["yes"] - late["yes"]  # should be <= 0 if consistent
            liq = min(early["liquidity"], late["liquidity"])
            if gap > min_gap and liq >= min_liquidity:
                violations.append({
                    "stem": key, "gap": gap, "liquidity": liq,
                    "early": early, "late": late,
                })
    violations.sort(key=lambda v: v["gap"], reverse=True)
    return {
        "scanned": len(markets),
        "ladder_groups": len(ladders),
        "ladders": ladders,
        "violations": violations,
    }
