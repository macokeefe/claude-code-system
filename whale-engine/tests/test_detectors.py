"""Detector unit tests — feed crafted history, assert the right signal fires.

Run: python -m unittest discover -s tests   (from the whale-engine/ dir)
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from whale_engine.config import Thresholds  # noqa: E402
from whale_engine.detectors import Detectors  # noqa: E402
from whale_engine.models import MarketSnapshot, TradeEvent  # noqa: E402
from whale_engine.storage import Storage  # noqa: E402

MIN = 60_000  # one minute in ms


def snap(ts, price=0.50, volume=0, oi=5000, mid="MKT"):
    return MarketSnapshot("test", mid, "Q?", "open", ts, price, volume, oi)


class DetectorTests(unittest.TestCase):
    def setUp(self):
        self.store = Storage(":memory:")
        # oi_fraction=0 so tests exercise the absolute floors, not OI scaling.
        self.det = Detectors(self.store, Thresholds(
            cooldown_min=0, oi_fraction=0.0, min_contracts=500,
            min_notional=100.0, sharp_move_min_oi=0, sharp_move_window_min=15))

    def _seed(self, snaps):
        """Insert all but the last snapshot as history; return the last."""
        for s in snaps[:-1]:
            self.store.insert_snapshot(s)
        self.store.insert_snapshot(snaps[-1])
        return snaps[-1]

    def test_volume_surge_fires(self):
        snaps = [snap(i * MIN, volume=1000 + i * 50) for i in range(10)]
        snaps.append(snap(10 * MIN, volume=snaps[-1].volume + 3000))  # big burst
        last = self._seed(snaps)
        sigs = self.det.on_snapshot(last)
        self.assertTrue(any(s.type == "volume_surge" for s in sigs), sigs)

    def test_no_surge_on_normal_volume(self):
        snaps = [snap(i * MIN, volume=1000 + i * 50) for i in range(12)]
        last = self._seed(snaps)
        self.assertFalse([s for s in self.det.on_snapshot(last) if s.type == "volume_surge"])

    def test_oi_jump_fires(self):
        snaps = [snap(i * MIN, oi=500 + i * 10) for i in range(10)]
        snaps.append(snap(10 * MIN, oi=snaps[-1].open_interest + 3000))
        last = self._seed(snaps)
        sigs = self.det.on_snapshot(last)
        self.assertTrue(any(s.type == "oi_jump" for s in sigs), sigs)

    def test_sharp_move_fires(self):
        snaps = [snap(i * MIN, price=0.50) for i in range(20)]
        snaps.append(snap(20 * MIN, price=0.68))  # +18 pts vs 15m ago
        last = self._seed(snaps)
        sigs = self.det.on_snapshot(last)
        self.assertTrue(any(s.type == "sharp_move" for s in sigs), sigs)

    def test_size_spike_fires(self):
        # baseline of small trades
        small = [TradeEvent("test", "MKT", i * MIN, 0.5, 20, "yes", f"t{i}")
                 for i in range(10)]
        self.store.insert_trades(small)
        big = TradeEvent("test", "MKT", 11 * MIN, 0.5, 4000, "yes", "BIG")
        self.store.insert_trades([big])
        sigs = self.det.on_trades(snap(11 * MIN), [big])
        self.assertTrue(any(s.type == "size_spike" for s in sigs), sigs)

    def test_size_spike_ignores_normal_trade(self):
        small = [TradeEvent("test", "MKT", i * MIN, 0.5, 20, "yes", f"t{i}")
                 for i in range(10)]
        self.store.insert_trades(small)
        normal = TradeEvent("test", "MKT", 11 * MIN, 0.5, 25, "yes", "N")
        self.assertFalse(self.det.on_trades(snap(11 * MIN), [normal]))


class SizeRelativeTests(unittest.TestCase):
    """The fix: signals must scale with the market's size + clear a $ floor."""

    def setUp(self):
        self.store = Storage(":memory:")
        self.det = Detectors(self.store, Thresholds(
            cooldown_min=0, min_contracts=500, min_notional=250.0, oi_fraction=0.02))

    def _series(self, oi, last_delta, mid):
        snaps = [snap(i * MIN, volume=10_000 + i * 30, oi=oi, mid=mid) for i in range(8)]
        snaps.append(snap(8 * MIN, volume=snaps[-1].volume + last_delta, oi=oi, mid=mid))
        for s in snaps[:-1]:
            self.store.insert_snapshot(s)
        self.store.insert_snapshot(snaps[-1])
        return snaps[-1]

    def test_small_market_fires_on_modest_burst(self):
        # OI 1000 -> floor = max(500, 20) = 500; a 600-lot qualifies
        last = self._series(oi=1000, last_delta=600, mid="SMALL")
        self.assertTrue(any(s.type == "volume_surge" for s in self.det.on_snapshot(last)))

    def test_huge_market_ignores_same_burst(self):
        # OI 2,000,000 -> floor = 40,000; a 600-lot is noise, must NOT fire
        last = self._series(oi=2_000_000, last_delta=600, mid="HUGE")
        self.assertFalse([s for s in self.det.on_snapshot(last) if s.type == "volume_surge"])

    def test_dollar_floor_blocks_cheap_longshot(self):
        # 600 contracts at 1c = ~$6 notional -> below the $250 floor, no fire
        snaps = [snap(i * MIN, price=0.01, volume=10_000 + i * 30, oi=1000, mid="LONG")
                 for i in range(8)]
        snaps.append(snap(8 * MIN, price=0.01, volume=snaps[-1].volume + 600,
                          oi=1000, mid="LONG"))
        for s in snaps:
            self.store.insert_snapshot(s)
        self.assertFalse([s for s in self.det.on_snapshot(snaps[-1])
                          if s.type == "volume_surge"])


if __name__ == "__main__":
    unittest.main()
