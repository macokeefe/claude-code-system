"""The analyst — Claude turns a question (+ public context) into a probability.

This is the comprehension edge: not faster than the market, but a calibrated
forecast of where the price *should* be. Calls the Messages API directly over
stdlib urllib (no SDK dependency, matching explain.py). Returns a structured
{probability, confidence, rationale}. The estimate is worthless until its
calibration is proven (see calibration.py) — this module only produces it.

Leakage warning: an LLM may already "know" the outcome of an event from its
training data. Only grade the estimator on markets that resolved AFTER the
model's knowledge cutoff, or feed it only as-of-date information. The calibrate
flow in the CLI enforces the post-cutoff rule.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request

API_URL = "https://api.anthropic.com/v1/messages"
DEFAULT_MODEL = "claude-opus-4-8"

SYSTEM = (
    "You are a calibrated superforecaster. You are given a yes/no question about a "
    "real-world event. Estimate the probability that it resolves YES. Be well "
    "calibrated: across many estimates, events you rate 70% should happen about 70% "
    "of the time. Reason from base rates and any context provided. If you are "
    "uncertain, give a probability near your true uncertainty — do not anchor on "
    "0.5, and do not output 0 or 1 unless it is essentially certain. Never refuse; "
    "always return your single best numeric estimate."
)

# structured output: guarantees the text block is valid JSON in this shape
SCHEMA = {
    "type": "object",
    "properties": {
        "probability": {"type": "number"},
        "confidence": {"type": "number"},
        "rationale": {"type": "string"},
    },
    "required": ["probability", "confidence", "rationale"],
    "additionalProperties": False,
}


def _api_key() -> str:
    return os.environ.get("ANTHROPIC_API_KEY", "").strip()


def available() -> bool:
    return bool(_api_key())


def _request(body: dict, retries: int = 2) -> dict:
    """POST to the Messages API and return parsed JSON. Retries transient
    connection drops (web search can run long and an idle socket may close)."""
    data = json.dumps(body).encode("utf-8")
    last = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(
                API_URL, data=data,
                headers={"content-type": "application/json", "x-api-key": _api_key(),
                         "anthropic-version": "2023-06-01"})
            with urllib.request.urlopen(req, timeout=180) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError:
            raise  # a real API error — don't retry
        except Exception as exc:  # connection reset / RemoteDisconnected / timeout
            last = exc
            time.sleep(2 * (attempt + 1))
    raise last


def _converse(body: dict) -> dict:
    """Run a request, resuming if a server tool (web search) pauses the turn."""
    data = _request(body)
    messages = list(body["messages"])
    for _ in range(4):
        if data.get("stop_reason") != "pause_turn":
            break
        messages = messages + [{"role": "assistant", "content": data["content"]}]
        data = _request({**body, "messages": messages})
    return data


def _text(data: dict) -> str:
    parts = [b.get("text", "") for b in data.get("content", [])
             if b.get("type") == "text"]
    return "\n".join(p for p in parts if p).strip()


def parse(text: str) -> dict:
    """Pull {probability, confidence, rationale} out of a model reply, robustly."""
    obj = {}
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            try:
                obj = json.loads(m.group(0))
            except json.JSONDecodeError:
                obj = {}
    p = obj.get("probability")
    if p is None:  # last-ditch: grab a number/percentage from the text
        m = re.search(r"(\d+(?:\.\d+)?)\s*%|0?\.\d+", text)
        if m:
            p = float(m.group(1)) / 100.0 if m.group(1) else float(m.group(0))
        else:
            p = 0.5
    p = float(p)
    if p > 1.0:  # model gave a percentage
        p /= 100.0
    p = min(1.0, max(0.0, p))
    conf = obj.get("confidence", 0.5)
    try:
        conf = min(1.0, max(0.0, float(conf)))
    except (TypeError, ValueError):
        conf = 0.5
    return {"probability": p, "confidence": conf,
            "rationale": str(obj.get("rationale", ""))[:500]}


_GROUND = (
    "\n\nFirst use web search to find the most recent news and official information "
    "about this question (events, statements, filings as of today). Then, grounded in "
    "what you found, give your probability. Respond with ONLY a JSON object: "
    '{"probability": <0..1>, "confidence": <0..1>, "rationale": "<one sentence, cite what you found>"}'
)


def estimate(question: str, context: str = "", model: str | None = None,
             grounded: bool = False) -> dict:
    """Claude's calibrated probability that `question` resolves YES.
    grounded=True lets it web-search current public sources first (the
    comprehension edge); otherwise it forecasts from priors alone."""
    if not available():
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    model = model or os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL)
    user = question if not context else f"{question}\n\nContext you may use:\n{context}"
    body = {"model": model, "max_tokens": 2048, "system": SYSTEM,
            "messages": [{"role": "user", "content": user}]}
    if grounded:
        # server-side web search; structured-output format isn't combined with tools
        body["messages"][0]["content"] += _GROUND
        body["tools"] = [{"type": "web_search_20260209", "name": "web_search"}]
        return parse(_text(_converse(body)))
    body["output_config"] = {"format": {"type": "json_schema", "schema": SCHEMA}}
    return parse(_text(_request(body)))


NEWS_SYSTEM = (
    "You are a markets analyst monitoring breaking news. You are given a numbered list of "
    "live prediction markets and their current YES prices. Use web search to find the most "
    "recent news (ideally the last 24-72 hours) relevant to these markets. Flag markets where "
    "a SPECIFIC recent article or development implies the current price is mispriced. Be "
    "calibrated and skeptical: do NOT overreact to dramatic headlines on low-probability "
    "events — the market is usually right about base rates, so only flag a market when concrete "
    "new information genuinely shifts the odds. Cite the actual article/headline."
)


def _parse_array(text: str) -> list:
    """Extract a JSON array of news findings from the model's reply."""
    arr = None
    try:
        arr = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\[.*\]", text, re.S)
        if m:
            try:
                arr = json.loads(m.group(0))
            except json.JSONDecodeError:
                arr = None
    out = []
    for it in arr if isinstance(arr, list) else []:
        try:
            p = float(it["p"])
            out.append({"i": int(it["i"]), "p": min(1.0, max(0.0, p / 100 if p > 1 else p)),
                        "headline": str(it.get("headline", ""))[:220],
                        "source": str(it.get("source", ""))[:200],
                        "why": str(it.get("why", ""))[:320]})
        except (KeyError, TypeError, ValueError):
            continue
    return out


def news_recommendations(markets: list, model: str | None = None) -> list:
    """One web-search pass over many markets: returns news-driven findings
    [{i, p, headline, source, why}] only where a recent article moves the odds."""
    if not available():
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    model = model or os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL)
    listing = "\n".join(
        f"{i}. [{round(m['yes']*100)}%] {m['question']}" for i, m in enumerate(markets))
    user = (
        "Live markets (number, current YES price, question):\n" + listing
        + "\n\nSearch the web for breaking news relevant to these markets. Respond with "
        "ONLY a JSON array. Each element: {\"i\": <market number>, \"p\": <your news-grounded "
        "YES probability 0..1>, \"headline\": \"<the specific article headline>\", "
        "\"source\": \"<outlet or url>\", \"why\": \"<one sentence: how this news moves the "
        "odds>\"}. Include ONLY markets with a concrete, recent news catalyst that makes the "
        "price look wrong. If nothing qualifies, return [].")
    body = {"model": model, "max_tokens": 4096, "system": NEWS_SYSTEM,
            "messages": [{"role": "user", "content": user}],
            "tools": [{"type": "web_search_20260209", "name": "web_search"}]}
    return _parse_array(_text(_converse(body)))
