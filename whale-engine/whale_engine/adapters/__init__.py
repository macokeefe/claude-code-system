"""Platform adapters. Each normalizes a venue into the common schema."""

import logging

from ..auth import KalshiAuth
from .base import Source
from .kalshi import KalshiSource
from .synthetic import SyntheticSource

log = logging.getLogger("whale_engine.adapters")


def make_source(name: str, config) -> Source:
    name = name.lower()
    if name == "kalshi":
        auth = None
        try:
            auth = KalshiAuth.from_env()
        except Exception as exc:  # bad key path / unreadable pem — warn, don't crash
            log.warning("Kalshi auth not loaded: %s", exc)
        if auth is not None:
            log.info("Kalshi: using authenticated access (key %s…)", auth.key_id[:8])
        else:
            log.info("Kalshi: no credentials found — using public (unauthenticated) access")
        return KalshiSource(config.kalshi_base_url, config.market_limit, auth=auth,
                            scan_pages=config.scan_pages, active_only=config.active_only,
                            discovery_every=config.discovery_every,
                            max_close_days=config.max_close_days)
    if name == "synthetic":
        return SyntheticSource(config.market_limit)
    raise ValueError(f"unknown source: {name!r} (expected 'kalshi' or 'synthetic')")
