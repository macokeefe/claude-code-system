"""AI rundown of a signal — what it means and why it might matter.

Calls Claude's Messages API directly over stdlib urllib (no SDK dependency,
consistent with the rest of this project). Needs an Anthropic API key in the
environment (ANTHROPIC_API_KEY); without one it returns a friendly hint
instead of failing. Model defaults to the latest Claude (claude-opus-4-8);
override with ANTHROPIC_MODEL (e.g. claude-haiku-4-5 for cheaper/faster).
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone

_API_URL = "https://api.anthropic.com/v1/messages"
_DEFAULT_MODEL = "claude-opus-4-8"

_LABEL = {
    "size_spike": "a large single trade",
    "volume_surge": "a burst of trading volume",
    "oi_jump": "a jump in open interest (new positions)",
    "sharp_move": "a sharp move in the odds",
}

_SYSTEM = (
    "You are a prediction-market analyst explaining a detected 'whale' signal to "
    "a smart but non-expert user watching a live dashboard. Be concrete and "
    "plain-English. In 3-5 short sentences cover: what just happened, why it "
    "might matter, what could plausibly be driving it, and what to watch next. "
    "Be honest about uncertainty — you're reading anonymized order flow, not "
    "minds. Do NOT give financial advice or tell the user to buy/sell. No preamble."
)


def _api_key() -> str:
    return os.environ.get("ANTHROPIC_API_KEY", "").strip()


def available() -> bool:
    return bool(_api_key())


def _build_prompt(sig: dict, snaps: list) -> str:
    when = datetime.fromtimestamp((sig.get("ts") or 0) / 1000, tz=timezone.utc)
    lines = [
        f"Market: {sig.get('question') or sig.get('market_id')}",
        f"Ticker: {sig.get('market_id')}",
        f"Signal: {_LABEL.get(sig.get('type'), sig.get('type'))}",
        f"Detected at: {when:%Y-%m-%d %H:%M UTC}",
        f"Current implied probability: {round((sig.get('price') or 0) * 100)}%",
    ]
    if sig.get("notional"):
        lines.append(f"Approx money involved: ${round(sig['notional']):,}")
    if sig.get("contracts"):
        lines.append(f"Contracts: {round(sig['contracts']):,}")
    if sig.get("side"):
        lines.append(f"Side/direction: {sig['side']}")
    lines.append(f"Why it was flagged: {sig.get('reason')}")

    if snaps:
        # snaps newest-first; show a compact recent trail oldest->newest
        trail = list(reversed(snaps[:8]))
        pts = ", ".join(
            f"{round((r['yes_price'] or 0) * 100)}% (vol {r['volume']:,}, OI {r['open_interest']:,})"
            for r in trail
        )
        lines.append(f"Recent history (oldest to newest): {pts}")

    lines.append("\nExplain what this means and why it might matter.")
    return "\n".join(lines)


def explain(sig: dict, snaps: list, model: str | None = None) -> str:
    key = _api_key()
    if not key:
        return ("AI explanations need an Anthropic API key. Add a line "
                "ANTHROPIC_API_KEY=sk-ant-... to your .env (get one at "
                "console.anthropic.com), then restart the dashboard.")
    model = model or os.environ.get("ANTHROPIC_MODEL", _DEFAULT_MODEL)
    body = json.dumps({
        "model": model,
        "max_tokens": 600,
        "system": _SYSTEM,
        "messages": [{"role": "user", "content": _build_prompt(sig, snaps)}],
    }).encode("utf-8")
    req = urllib.request.Request(_API_URL, data=body, headers={
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            return "Anthropic rejected the API key (401). Check ANTHROPIC_API_KEY in your .env."
        if exc.code == 429:
            return "Anthropic rate limit hit (429). Wait a moment and click again."
        return f"AI request failed (HTTP {exc.code}). {exc.read().decode('utf-8')[:200]}"
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        return f"AI request failed: {exc}"

    parts = [b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"]
    return "\n".join(p for p in parts if p).strip() or "(no explanation returned)"
