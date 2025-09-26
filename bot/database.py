# bot/database.py
"""
PostgreSQL database layer for the bot (replacing the previous SQLite implementation).

Key improvements:
- Uses a real connection pool for concurrency and performance.
- Clean PostgreSQL schema (identity columns, TIMESTAMPTZ, proper indexes).
- No PK compaction or sequence hacks (avoid past DB mistakes).
- Backward-compatible query adapter for existing "?" placeholders and
  common SQLite-specific patterns used in handlers.

Env configuration:
- DATABASE_URL must be defined (e.g., postgresql://user:pass@host:5432/dbname)

Note: This module provides a synchronous API to avoid refactoring all handlers.
      For production at scale, consider moving to an async driver and making DB
      calls non-blocking.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Iterable, Optional, Tuple

import psycopg
from psycopg_pool import ConnectionPool

from config import DATABASE_URL, MAIN_ADMIN_ID

logger = logging.getLogger(__name__)

_pool: Optional[ConnectionPool] = None


def _ensure_pool() -> ConnectionPool:
    global _pool
    if _pool is not None:
        return _pool
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL is not set. Define DATABASE_URL in your environment or .env,\n"
            "for example: postgresql://username:password@host:5432/database"
        )
    # Use a small pool by default; adjust via env if needed
    _pool = ConnectionPool(conninfo=DATABASE_URL, min_size=1, max_size=10, timeout=10)
    logger.info("PostgreSQL connection pool initialized")
    return _pool


def get_connection() -> psycopg.Connection:
    """Get a pooled PostgreSQL connection (context manager).

    Usage:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(...)
    """
    pool = _ensure_pool()
    return pool.connection()


# ---------- SQL normalization helpers (compat layer) ----------

_qmark_re = re.compile(r"\?")
_datetime_now_re = re.compile(r"datetime\('now'\)", re.IGNORECASE)
_insert_or_replace_users = re.compile(r"^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+users\s*\(([^)]+)\)\s*VALUES\s*\(([^)]*)\)", re.IGNORECASE)
_insert_or_ignore_admins = re.compile(r"^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+admins\s*\(([^)]+)\)\s*VALUES\s*\(([^)]*)\)", re.IGNORECASE)


def _adapt_sql(sql: str) -> str:
    """Adapt a subset of SQLite-flavored SQL used in the codebase to PostgreSQL.

    - Replace '?' placeholders with '%s'.
    - Replace datetime('now') with now().
    - Translate 'INSERT OR REPLACE INTO users (...) VALUES (...)' to
      'INSERT ... ON CONFLICT (user_id) DO UPDATE ...'.
    - Translate 'INSERT OR IGNORE INTO admins (...)' to '... ON CONFLICT DO NOTHING'.
    """
    s = sql

    # Specific statement rewrites first
    m = _insert_or_replace_users.match(s)
    if m:
        cols = [c.strip() for c in m.group(1).split(',')]
        placeholders = m.group(2)
        # Conflict target is the PK of users: user_id
        if 'user_id' not in [c.lower() for c in cols]:
            # Fallback to basic replace
            pass
        else:
            # Build update set for all non-PK columns
            updates = [f"{c} = EXCLUDED.{c}" for c in cols if c.lower() != 'user_id']
            s = _insert_or_replace_users.sub(
                f"INSERT INTO users ({', '.join(cols)}) VALUES ({placeholders}) ON CONFLICT (user_id) DO UPDATE SET {', '.join(updates)}",
                s,
            )

    m = _insert_or_ignore_admins.match(s)
    if m:
        cols = [c.strip() for c in m.group(1).split(',')]
        placeholders = m.group(2)
        # Conflict target: PK admin_id
        s = _insert_or_ignore_admins.sub(
            f"INSERT INTO admins ({', '.join(cols)}) VALUES ({placeholders}) ON CONFLICT (admin_id) DO NOTHING",
            s,
        )

    # Generic replacements
    s = _datetime_now_re.sub("now()", s)
    # Replace positional placeholders last
    s = _qmark_re.sub("%s", s)
    return s


# ---------- Schema management ----------

def init_db() -> None:
    """Initialize PostgreSQL schema and seed main admin.

    This function is idempotent.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Core tables
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS admins (
                    admin_id BIGINT PRIMARY KEY
                );
                """
            )
            # Ensure legacy column is removed if it existed
            try:
                cur.execute("ALTER TABLE admins DROP COLUMN IF EXISTS is_main")
            except Exception:
                pass

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    user_id BIGINT PRIMARY KEY,
                    nickname TEXT,
                    created_at TIMESTAMPTZ DEFAULT now()
                );
                """
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS meetings (
                    meeting_id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                    title TEXT NOT NULL,
                    admin_id BIGINT,
                    group_id TEXT,
                    description TEXT,
                    is_active INTEGER DEFAULT 1 CHECK(is_active IN (0,1)),
                    bit_count INTEGER DEFAULT 0,
                    battle_count INTEGER DEFAULT 0
                );
                """
            )
            # Add counter columns when migrating from older schema
            try:
                cur.execute("ALTER TABLE meetings ADD COLUMN IF NOT EXISTS bit_count INTEGER DEFAULT 0")
                cur.execute("ALTER TABLE meetings ADD COLUMN IF NOT EXISTS battle_count INTEGER DEFAULT 0")
            except Exception:
                pass

            
            # Drop deprecated tables no longer used
            cur.execute("DROP TABLE IF EXISTS meeting_admins")
            cur.execute("DROP TABLE IF EXISTS battles")
            cur.execute("DROP TABLE IF EXISTS pending_group_links")
            cur.execute("DROP TABLE IF EXISTS recent_groups")
            cur.execute("DROP TABLE IF EXISTS bits")

            
            
            
            # Do not store MAIN_ADMIN_ID in database as per requirements.

        conn.commit()
        logger.info("PostgreSQL database initialized")


# ---------- Query execution API ----------

def execute_query(
    query: str,
    params: Iterable[Any] | None = (),
    fetch: bool = False,
    fetch_one: bool = False,
) -> Optional[Iterable[Tuple[Any, ...]]]:
    """Execute a single SQL statement.

    - For SELECT, set fetch or fetch_one to retrieve results.
    - For INSERT/UPDATE/DELETE, leave both fetch flags False.
    - Returns fetched rows (list of tuples) for fetch, single tuple for fetch_one,
      or None for non-SELECT statements.

    The function also adapts a subset of SQLite-specific syntax used by the
    existing code to PostgreSQL-compatible SQL.
    """
    sql = _adapt_sql(query)
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, tuple(params) if params else ())
                result: Optional[Iterable[Tuple[Any, ...]]] = None
                if fetch_one:
                    result = cur.fetchone()
                elif fetch:
                    result = cur.fetchall()
                # Ensure transaction is closed (commit even after reads is safe)
                try:
                    conn.commit()
                except Exception:
                    pass
                return result
    except Exception as e:
        # Log the query partially to avoid leaking data
        snippet = sql.strip().split("\n", 1)[0]
        logger.error(f"DB error on query: {snippet}... | err: {e}")
        raise
