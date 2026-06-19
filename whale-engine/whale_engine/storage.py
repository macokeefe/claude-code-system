"""SQLite persistence — the history store that makes backtesting possible.

Every snapshot, trade, and signal is recorded so Phase 3 can later ask
"did this signal actually predict the move?" against real resolutions.
Stdlib sqlite3 only; zero external deps.
"""

from __future__ import annotations

import sqlite3
from typing import Iterable

from .models import MarketSnapshot, Signal, TradeEvent

_SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshots (
    platform      TEXT NOT NULL,
    market_id     TEXT NOT NULL,
    ts            INTEGER NOT NULL,
    question      TEXT,
    status        TEXT,
    yes_price     REAL,
    volume        INTEGER,
    open_interest INTEGER,
    liquidity     REAL
);
CREATE INDEX IF NOT EXISTS idx_snap_market_ts ON snapshots(market_id, ts);

CREATE TABLE IF NOT EXISTS trades (
    trade_id   TEXT PRIMARY KEY,
    platform   TEXT NOT NULL,
    market_id  TEXT NOT NULL,
    ts         INTEGER NOT NULL,
    price      REAL,
    count      INTEGER,
    taker_side TEXT
);
CREATE INDEX IF NOT EXISTS idx_trade_market_ts ON trades(market_id, ts);

CREATE TABLE IF NOT EXISTS signals (
    platform  TEXT NOT NULL,
    market_id TEXT NOT NULL,
    ts        INTEGER NOT NULL,
    type      TEXT NOT NULL,
    severity  REAL,
    reason    TEXT,
    price     REAL,
    question  TEXT
);
CREATE INDEX IF NOT EXISTS idx_signal_market_type_ts ON signals(market_id, type, ts);
"""


class Storage:
    def __init__(self, db_path: str) -> None:
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(_SCHEMA)
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    # --- writes ---
    def insert_snapshot(self, s: MarketSnapshot) -> None:
        self.conn.execute(
            "INSERT INTO snapshots VALUES (?,?,?,?,?,?,?,?,?)",
            (s.platform, s.market_id, s.ts, s.question, s.status,
             s.yes_price, s.volume, s.open_interest, s.liquidity),
        )
        self.conn.commit()

    def insert_trades(self, trades: Iterable[TradeEvent]) -> int:
        """Insert trades, ignoring ones already seen (by trade_id). Returns # new."""
        rows = [(t.trade_id, t.platform, t.market_id, t.ts, t.price, t.count, t.taker_side)
                for t in trades if t.trade_id]
        if not rows:
            return 0
        cur = self.conn.executemany(
            "INSERT OR IGNORE INTO trades VALUES (?,?,?,?,?,?,?)", rows
        )
        self.conn.commit()
        return cur.rowcount

    def insert_signal(self, sig: Signal) -> None:
        self.conn.execute(
            "INSERT INTO signals VALUES (?,?,?,?,?,?,?,?)",
            (sig.platform, sig.market_id, sig.ts, sig.type,
             sig.severity, sig.reason, sig.price, sig.question),
        )
        self.conn.commit()

    # --- reads ---
    def recent_snapshots(self, market_id: str, limit: int) -> list[sqlite3.Row]:
        cur = self.conn.execute(
            "SELECT * FROM snapshots WHERE market_id=? ORDER BY ts DESC LIMIT ?",
            (market_id, limit),
        )
        return list(cur.fetchall())

    def recent_trades(self, market_id: str, limit: int) -> list[sqlite3.Row]:
        cur = self.conn.execute(
            "SELECT * FROM trades WHERE market_id=? ORDER BY ts DESC LIMIT ?",
            (market_id, limit),
        )
        return list(cur.fetchall())

    def last_signal_ts(self, market_id: str, sig_type: str) -> int | None:
        cur = self.conn.execute(
            "SELECT MAX(ts) AS ts FROM signals WHERE market_id=? AND type=?",
            (market_id, sig_type),
        )
        row = cur.fetchone()
        return row["ts"] if row and row["ts"] is not None else None
