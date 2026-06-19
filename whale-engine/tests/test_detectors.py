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


def snap(ts, price=0.50, volume=0, oi=0, mid="MKT"):
    return MarketSnapshot("test", mid, "Q?", "open", ts, price, volume, oi)


class DetectorTests(unittest.TestCase):
    def setUp(self):
        self.store = Storage(":memory:")
        self.det = Detectors(self.store, Thresholds(cooldown_min=0))

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


if __name__ == "__main__":
    unittest.main()
