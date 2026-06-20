"""Structural mispricing scanner — edges that need no view on the world.

The cleanest is the *time-ladder*: the SAME cumulative yes/no question at
different deadlines. Logic forces the YES price to be non-decreasing as the
deadline extends — "X by March" can never be worth more than "X by June",
because more time can only make X more likely. When the market violates
that, the gap is a locked profit collected regardless of whether X happens.

The hard part is telling a real ladder from look-alikes that obey no such
rule. We only treat a market as a ladder rung when it has a genuine
cumulative deadline phrase — "(by|before|through) {month/year}". That
deliberately EXCLUDES:
  * sports "win on {date}"     — different games, not deadlines
  * "by 25 bps" / magnitudes   — buckets of one event, not time
  * snapshot "largest on {date}" — point-in-time, not cumulative
Rungs are ordered by the date in the QUESTION text (Polymarket's endDate
field is unreliable). Detection is on the mid price; surviving the bid/ask
spread + fees is the execution check, flagged but not assumed.
"""

from __future__ import annotations

import logging
import re
from collections import defaultdict

log = logging.getLogger("whale_engine.mispricing")

_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "oct": 10,
    "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}

# cumulative deadline prepositions (NOT "on"/"in" — those are snapshots/games)
_PREP = re.compile(r"\b(by|before|until|through)\b", re.I)
_FILL = re.compile(r"^(?:\s+(?:the|end|of))+", re.I)  # "by the end of June" -> "June"
_ISO = re.compile(r"^\s*(20\d\d)-(\d{2})-(\d{2})")
_MD = re.compile(r"^\s*([A-Za-z]+)\.?\s*(\d{1,2})?(?:st|nd|rd|th)?(?:,?\s*(20\d\d))?")
_YR = re.compile(r"^\s*(20\d\d)\b")
_PUNCT = re.compile(r"[^a-z0-9 ]+")
_SPACE = re.compile(r"\s+")


def _parse_date(s: str):
    """Parse the start of `s` into a sortable (y, m, d). Missing day -> 31
    (cumulative 'by June' means by end of June). None if no date found."""
    m = _ISO.match(s)
    if m:
        return (int(m[1]), int(m[2]), int(m[3]))
    m = _MD.match(s)
    if m and m[1].lower() in _MONTHS:
        return (int(m[3]) if m[3] else 2026, _MONTHS[m[1].lower()],
                int(m[2]) if m[2] else 31)
    m = _YR.match(s)
    if m:
        return (int(m[1]), 12, 31)
    return None


def deadline(question: str):
    """Return (stem, (y,m,d)) for a cumulative-deadline market, else None.
    The stem is the question with the deadline phrase onward removed, so a
    ladder's rungs share one key."""
    q = question.strip().rstrip("?")
    for pm in _PREP.finditer(q):
        rest = _FILL.sub("", q[pm.end():])
        d = _parse_date(rest)
        if d:
            key = _PUNCT.sub(" ", q[:pm.start()].lower())
            return _SPACE.sub(" ", key).strip(), d
    return None


def find_ladders(markets: list[dict], min_gap: float = 0.03,
                 min_liquidity: float = 500.0) -> dict:
    """Group cumulative markets into time-ladders and flag monotonicity
    violations: an earlier-deadline rung priced more than `min_gap` above a
    later-deadline rung (both at least `min_liquidity`). The gap is the
    per-pair locked profit. Returns groups (for tuning) and ranked violations.
    """
    groups: dict[str, list] = defaultdict(list)
    eligible = 0
    for m in markets:
        dl = deadline(m["question"])
        if not dl:
            continue  # not a cumulative-deadline market — can't ladder
        eligible += 1
        groups[dl[0]].append((dl[1], m))

    ladders, violations = [], []
    for key, items in groups.items():
        if len(items) < 2:
            continue
        items.sort(key=lambda x: x[0])  # by parsed question date
        if len({d for d, _ in items}) < 2:
            continue  # same deadline -> not a ladder (duplicates / variants)
        ms = [m for _, m in items]
        ladders.append((key, ms))
        for (_, early), (_, late) in zip(items, items[1:]):
            gap = early["yes"] - late["yes"]  # should be <= 0 if consistent
            liq = min(early["liquidity"], late["liquidity"])
            if gap > min_gap and liq >= min_liquidity:
                violations.append({"stem": key, "gap": gap, "liquidity": liq,
                                   "early": early, "late": late})
    violations.sort(key=lambda v: v["gap"], reverse=True)
    return {
        "scanned": len(markets),
        "eligible": eligible,
        "ladder_groups": len(ladders),
        "ladders": ladders,
        "violations": violations,
    }
