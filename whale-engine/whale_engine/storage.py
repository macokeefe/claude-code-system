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
    question  TEXT,
    contracts REAL DEFAULT 0,
    notional  REAL DEFAULT 0,
    side      TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_signal_market_type_ts ON signals(market_id, type, ts);
"""


class Storage:
    def __init__(self, db_path: str) -> None:
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(_SCHEMA)
        self._migrate()
        self.conn.commit()

    def _migrate(self) -> None:
        """Add newer columns to a signals table created by an older version."""
        existing = {r["name"] for r in self.conn.execute("PRAGMA table_info(signals)")}
        for col, decl in (("contracts", "REAL DEFAULT 0"),
                          ("notional", "REAL DEFAULT 0"),
                          ("side", "TEXT DEFAULT ''")):
            if col not in existing:
                self.conn.execute(f"ALTER TABLE signals ADD COLUMN {col} {decl}")

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
            "INSERT INTO signals (platform, market_id, ts, type, severity, reason, "
            "price, question, contracts, notional, side) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (sig.platform, sig.market_id, sig.ts, sig.type,
             sig.severity, sig.reason, sig.price, sig.question,
             sig.contracts, sig.notional, sig.side),
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

    # --- dashboard reads (across all markets) ---
    def recent_signals(self, limit: int = 100) -> list[sqlite3.Row]:
        cur = self.conn.execute(
            "SELECT * FROM signals ORDER BY ts DESC LIMIT ?", (limit,)
        )
        return list(cur.fetchall())

    def latest_markets(self, limit: int = 200) -> list[sqlite3.Row]:
        """Most-recent snapshot for each market, busiest first."""
        cur = self.conn.execute(
            """
            SELECT s.* FROM snapshots s
            JOIN (
                SELECT market_id, MAX(ts) AS mx FROM snapshots GROUP BY market_id
            ) last ON s.market_id = last.market_id AND s.ts = last.mx
            ORDER BY s.volume DESC LIMIT ?
            """,
            (limit,),
        )
        return list(cur.fetchall())

    def signal_counts(self) -> dict[str, int]:
        cur = self.conn.execute(
            "SELECT type, COUNT(*) AS n FROM signals GROUP BY type"
        )
        return {row["type"]: row["n"] for row in cur.fetchall()}

    def totals(self) -> dict[str, int]:
        out = {}
        for name, table in (("markets", "snapshots"), ("trades", "trades"),
                            ("signals", "signals")):
            if table == "snapshots":
                cur = self.conn.execute("SELECT COUNT(DISTINCT market_id) AS n FROM snapshots")
            else:
                cur = self.conn.execute(f"SELECT COUNT(*) AS n FROM {table}")
            out[name] = cur.fetchone()["n"]
        return out
