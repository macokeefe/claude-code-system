"""SQLite persistence — the history store that makes backtesting possible.

Every snapshot, trade, and signal is recorded so Phase 3 can later ask
"did this signal actually predict the move?" against real resolutions.
Stdlib sqlite3 only; zero external deps.
"""

from __future__ import annotations

import sqlite3
from typing import Iterable

from .models import MarketSnapshot, Signal, TradeEvent, now_ms

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
    liquidity     REAL,
    close_ts      INTEGER DEFAULT 0
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

CREATE TABLE IF NOT EXISTS titles (
    ticker TEXT PRIMARY KEY,
    title  TEXT
);

CREATE TABLE IF NOT EXISTS paper_trades (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          INTEGER NOT NULL,
    market_id   TEXT NOT NULL,
    question    TEXT,
    side        TEXT NOT NULL,        -- 'yes' | 'no'
    contracts   REAL NOT NULL,
    entry_price REAL NOT NULL,        -- price of the side bought, 0..1
    status      TEXT NOT NULL DEFAULT 'open',
    exit_price  REAL,
    exit_ts     INTEGER,
    target_exit REAL                  -- auto-close when side price reaches this (take-profit)
);
CREATE INDEX IF NOT EXISTS idx_paper_status ON paper_trades(status);

CREATE TABLE IF NOT EXISTS recommendations (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           INTEGER NOT NULL,
    market_id    TEXT NOT NULL,
    question     TEXT,
    side         TEXT NOT NULL,       -- 'yes' | 'no'
    market_price REAL,                -- side price in the market now
    model_price  REAL,                -- side's grounded fair value
    edge         REAL,                -- |model - market| in probability
    target_exit  REAL,               -- side price to cash out at (fair value)
    reason       TEXT,
    status       TEXT NOT NULL DEFAULT 'open'   -- open | taken | dismissed
);
CREATE INDEX IF NOT EXISTS idx_rec_status ON recommendations(status, edge);
"""


class Storage:
    def __init__(self, db_path: str) -> None:
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(_SCHEMA)
        self._migrate()
        self.conn.commit()

    def _migrate(self) -> None:
        """Add newer columns to tables created by an older version."""
        sig_cols = {r["name"] for r in self.conn.execute("PRAGMA table_info(signals)")}
        for col, decl in (("contracts", "REAL DEFAULT 0"),
                          ("notional", "REAL DEFAULT 0"),
                          ("side", "TEXT DEFAULT ''")):
            if col not in sig_cols:
                self.conn.execute(f"ALTER TABLE signals ADD COLUMN {col} {decl}")
        snap_cols = {r["name"] for r in self.conn.execute("PRAGMA table_info(snapshots)")}
        if "close_ts" not in snap_cols:
            self.conn.execute("ALTER TABLE snapshots ADD COLUMN close_ts INTEGER DEFAULT 0")
        paper_cols = {r["name"] for r in self.conn.execute("PRAGMA table_info(paper_trades)")}
        if "target_exit" not in paper_cols:
            self.conn.execute("ALTER TABLE paper_trades ADD COLUMN target_exit REAL")

    def close(self) -> None:
        self.conn.close()

    # --- writes ---
    def insert_snapshot(self, s: MarketSnapshot) -> None:
        self.conn.execute(
            "INSERT INTO snapshots (platform, market_id, ts, question, status, "
            "yes_price, volume, open_interest, liquidity, close_ts) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (s.platform, s.market_id, s.ts, s.question, s.status,
             s.yes_price, s.volume, s.open_interest, s.liquidity, s.close_ts),
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

    def recent_trades_all(self, limit: int = 20) -> list[sqlite3.Row]:
        """Latest trades across all markets — the live 'it's recording' feed."""
        cur = self.conn.execute(
            "SELECT * FROM trades ORDER BY ts DESC LIMIT ?", (limit,)
        )
        return list(cur.fetchall())

    # --- market titles (for the global trade feed, where markets aren't tracked) ---
    def upsert_titles(self, items) -> None:
        rows = [(t, title) for t, title in items if t and title]
        if rows:
            self.conn.executemany(
                "INSERT OR REPLACE INTO titles (ticker, title) VALUES (?,?)", rows)
            self.conn.commit()

    def title_map(self, tickers) -> dict:
        tickers = list({t for t in tickers if t})
        if not tickers:
            return {}
        out: dict = {}
        for i in range(0, len(tickers), 400):  # bound the IN-clause size
            batch = tickers[i:i + 400]
            ph = ",".join("?" * len(batch))
            cur = self.conn.execute(
                f"SELECT ticker, title FROM titles WHERE ticker IN ({ph})", batch)
            out.update({r["ticker"]: r["title"] for r in cur.fetchall()})
        return out

    def biggest_trades(self, since_ms: int, limit: int = 40) -> list[sqlite3.Row]:
        """Largest single trades by contract count since a timestamp — a
        candidate pool; the caller ranks by side-aware dollar value."""
        cur = self.conn.execute(
            "SELECT * FROM trades WHERE ts>=? AND count>0 ORDER BY count DESC LIMIT ?",
            (since_ms, limit),
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

    def get_signal(self, market_id: str, ts: int, sig_type: str) -> sqlite3.Row | None:
        cur = self.conn.execute(
            "SELECT * FROM signals WHERE market_id=? AND ts=? AND type=? LIMIT 1",
            (market_id, ts, sig_type),
        )
        return cur.fetchone()

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

    # --- paper trading (no real money; the place a strategy graduates to) ---
    def latest_price(self, market_id: str):
        """Most recent YES price for a market, or None if untracked."""
        cur = self.conn.execute(
            "SELECT yes_price FROM snapshots WHERE market_id=? ORDER BY ts DESC LIMIT 1",
            (market_id,))
        r = cur.fetchone()
        return r["yes_price"] if r else None

    def paper_open(self, market_id: str, question: str, side: str,
                   contracts: float, entry_price: float,
                   target_exit: float | None = None) -> int:
        cur = self.conn.execute(
            "INSERT INTO paper_trades (ts, market_id, question, side, contracts, "
            "entry_price, status, target_exit) VALUES (?,?,?,?,?,?, 'open', ?)",
            (now_ms(), market_id, question, side, contracts, entry_price, target_exit))
        self.conn.commit()
        return cur.lastrowid

    # --- recommendations (evidence-backed trade ideas with a target cash-out) ---
    def add_recommendation(self, market_id, question, side, market_price,
                           model_price, edge, target_exit, reason) -> int:
        cur = self.conn.execute(
            "INSERT INTO recommendations (ts, market_id, question, side, "
            "market_price, model_price, edge, target_exit, reason, status) "
            "VALUES (?,?,?,?,?,?,?,?,?, 'open')",
            (now_ms(), market_id, question, side, market_price, model_price,
             edge, target_exit, reason))
        self.conn.commit()
        return cur.lastrowid

    def recommendations(self, status: str = "open") -> list[sqlite3.Row]:
        cur = self.conn.execute(
            "SELECT * FROM recommendations WHERE status=? ORDER BY edge DESC", (status,))
        return list(cur.fetchall())

    def rec_one(self, rec_id: int) -> sqlite3.Row | None:
        return self.conn.execute(
            "SELECT * FROM recommendations WHERE id=?", (rec_id,)).fetchone()

    def set_rec_status(self, rec_id: int, status: str) -> None:
        self.conn.execute("UPDATE recommendations SET status=? WHERE id=?",
                          (status, rec_id))
        self.conn.commit()

    def open_recommendation_keys(self) -> set:
        """(market_id, side) of open recs — to avoid duplicate inserts on re-scan."""
        cur = self.conn.execute(
            "SELECT market_id, side FROM recommendations WHERE status='open'")
        return {(r["market_id"], r["side"]) for r in cur.fetchall()}

    def paper_one(self, trade_id: int) -> sqlite3.Row | None:
        cur = self.conn.execute("SELECT * FROM paper_trades WHERE id=?", (trade_id,))
        return cur.fetchone()

    def paper_close(self, trade_id: int, exit_price: float) -> None:
        self.conn.execute(
            "UPDATE paper_trades SET status='closed', exit_price=?, exit_ts=? "
            "WHERE id=? AND status='open'", (exit_price, now_ms(), trade_id))
        self.conn.commit()

    def paper_rows(self, status: str | None = None) -> list[sqlite3.Row]:
        if status:
            cur = self.conn.execute(
                "SELECT * FROM paper_trades WHERE status=? ORDER BY ts DESC", (status,))
        else:
            cur = self.conn.execute("SELECT * FROM paper_trades ORDER BY ts DESC")
        return list(cur.fetchall())

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
