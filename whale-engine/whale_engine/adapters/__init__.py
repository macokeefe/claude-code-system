"""Platform adapters. Each normalizes a venue into the common schema."""

from .base import Source
from .kalshi import KalshiSource
from .synthetic import SyntheticSource


def make_source(name: str, config) -> Source:
    name = name.lower()
    if name == "kalshi":
        return KalshiSource(config.kalshi_base_url, config.market_limit)
    if name == "synthetic":
        return SyntheticSource(config.market_limit)
    raise ValueError(f"unknown source: {name!r} (expected 'kalshi' or 'synthetic')")
