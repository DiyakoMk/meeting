# bot/database.py
import sqlite3
import logging
from typing import Any, Iterable, Optional, Tuple
from config import DB_NAME, MAIN_ADMIN_ID

logger = logging.getLogger(__name__)


def get_connection() -> sqlite3.Connection:
    """Create a SQLite connection with sane defaults and enabled FK.
    WAL mode improves concurrency for bots, and foreign_keys enforces integrity.
    """
    conn = sqlite3.connect(DB_NAME)
    # Apply pragmas for each connection
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
    except sqlite3.Error as e:
        logger.warning(f"Failed to apply PRAGMA settings: {e}")
    return conn


def _table_columns(cur: sqlite3.Cursor, table: str) -> set:
    cur.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cur.fetchall()}


def init_db() -> None:
    """Initialize database schema and perform light migrations.
    Also ensure MAIN_ADMIN_ID is stored as the single main admin.
    """
    with get_connection() as conn:
        cur = conn.cursor()

        # Core tables
        cur.executescript(
            """
            CREATE TABLE IF NOT EXISTS admins (
                admin_id INTEGER PRIMARY KEY,
                is_main INTEGER DEFAULT 0 CHECK(is_main IN (0,1))
            );

            -- Single main admin enforced by partial unique index
            CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_single_main
                ON admins(is_main) WHERE is_main = 1;

            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                nickname TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS meetings (
                meeting_id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                admin_id INTEGER,
                group_id TEXT,
                description TEXT,
                is_active INTEGER DEFAULT 1 CHECK(is_active IN (0,1)),
                FOREIGN KEY(admin_id) REFERENCES admins(admin_id)
            );

            CREATE TABLE IF NOT EXISTS meeting_admins (
                admin_id INTEGER,
                meeting_id INTEGER,
                PRIMARY KEY (admin_id, meeting_id),
                FOREIGN KEY (admin_id) REFERENCES admins(admin_id) ON DELETE CASCADE,
                FOREIGN KEY (meeting_id) REFERENCES meetings(meeting_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS bits (
                bit_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                meeting_id INTEGER,
                beat_id TEXT,
                vibe TEXT,
                title TEXT,
                battle_participation INTEGER DEFAULT 0 CHECK(battle_participation IN (0,1)),
                freestyle_ability INTEGER DEFAULT 0 CHECK(freestyle_ability IN (0,1)),
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY(meeting_id) REFERENCES meetings(meeting_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS battles (
                battle_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                meeting_id INTEGER,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY(meeting_id) REFERENCES meetings(meeting_id) ON DELETE CASCADE
            );

            -- Pending group selection links (deep-link via startgroup)
            CREATE TABLE IF NOT EXISTS pending_group_links (
                token TEXT PRIMARY KEY,
                admin_user_id INTEGER NOT NULL,
                chat_id TEXT,
                title TEXT,
                username TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
            """
        )

        # Migrations for older databases
        try:
            # meetings: ensure columns exist
            meeting_cols = _table_columns(cur, "meetings")
            if "group_id" not in meeting_cols:
                cur.execute("ALTER TABLE meetings ADD COLUMN group_id TEXT")
            if "description" not in meeting_cols:
                cur.execute("ALTER TABLE meetings ADD COLUMN description TEXT")
            if "admin_id" not in meeting_cols:
                cur.execute("ALTER TABLE meetings ADD COLUMN admin_id INTEGER")
            if "is_active" not in meeting_cols:
                cur.execute("ALTER TABLE meetings ADD COLUMN is_active INTEGER DEFAULT 1")

            # Ensure meetings.admin_id DOES NOT have a foreign key to admins, so supervisors aren't forced to be system admins.
            try:
                cur.execute("PRAGMA foreign_key_list(meetings)")
                fk_rows = cur.fetchall()
                has_admin_fk = any(row[2] == 'admins' for row in fk_rows)
                if has_admin_fk:
                    # Rebuild meetings table without FK constraint on admin_id
                    cur.execute("PRAGMA foreign_keys = OFF")
                    cur.executescript(
                        """
                        CREATE TABLE IF NOT EXISTS meetings_new (
                            meeting_id INTEGER PRIMARY KEY AUTOINCREMENT,
                            title TEXT NOT NULL,
                            admin_id INTEGER,
                            group_id TEXT,
                            description TEXT,
                            is_active INTEGER DEFAULT 1 CHECK(is_active IN (0,1))
                        );
                        INSERT INTO meetings_new (meeting_id, title, admin_id, group_id, description, is_active)
                        SELECT meeting_id, title, admin_id, group_id, description, is_active FROM meetings;
                        DROP TABLE meetings;
                        ALTER TABLE meetings_new RENAME TO meetings;
                        """
                    )
                    cur.execute("PRAGMA foreign_keys = ON")
            except sqlite3.Error as m:
                logger.error(f"Failed to adjust meetings FK: {m}")

            # bits: add missing columns if DB was created with a partial schema
            bit_cols = _table_columns(cur, "bits")
            expected_bit_cols = {
                "beat_id": "TEXT",
                "vibe": "TEXT",
                "title": "TEXT",
                "battle_participation": "INTEGER DEFAULT 0",
                "freestyle_ability": "INTEGER DEFAULT 0",
            }
            for col, decl in expected_bit_cols.items():
                if col not in bit_cols:
                    cur.execute(f"ALTER TABLE bits ADD COLUMN {col} {decl}")
        except sqlite3.Error as e:
            logger.error(f"Migration step failed: {e}")

        # Seed main admin from config and enforce single-main invariant
        try:
            if MAIN_ADMIN_ID and isinstance(MAIN_ADMIN_ID, int):
                # Clear any other main admins
                cur.execute(
                    "UPDATE admins SET is_main = 0 WHERE is_main = 1 AND admin_id != ?",
                    (MAIN_ADMIN_ID,),
                )
                # Ensure main admin row exists
                cur.execute(
                    "INSERT OR IGNORE INTO admins (admin_id, is_main) VALUES (?, 1)",
                    (MAIN_ADMIN_ID,),
                )
                # Force main flag on the configured admin
                cur.execute("UPDATE admins SET is_main = 1 WHERE admin_id = ?", (MAIN_ADMIN_ID,))
            else:
                logger.warning("MAIN_ADMIN_ID is not set to a valid integer; skipping main admin seeding.")
        except sqlite3.Error as e:
            logger.error(f"Failed to seed main admin: {e}")

        logger.info("Database initialized and migrations applied")


def execute_query(
    query: str,
    params: Iterable[Any] = (),
    fetch: bool = False,
    fetch_one: bool = False,
) -> Optional[Iterable[Tuple[Any, ...]]]:
    """Execute a single SQL statement.

    - For SELECT, set fetch or fetch_one to retrieve results.
    - For INSERT/UPDATE/DELETE, leave both fetch flags False.
    - Returns fetched rows (list of tuples) for fetch, single tuple for fetch_one,
      or None for non-SELECT statements.
    """
    try:
        with get_connection() as conn:
            cur = conn.cursor()
            cur.execute(query, tuple(params) if params else ())
            if fetch_one:
                return cur.fetchone()
            if fetch:
                return cur.fetchall()
            return None
    except sqlite3.Error as e:
        # Log the query partially to avoid leaking data
        snippet = query.strip().split("\n", 1)[0]
        logger.error(f"DB error on query: {snippet}... | err: {e}")
        raise


def cleanup_meetings() -> None:
    """Clean up deleted meetings and reuse IDs by compacting the meeting_id sequence.
    This ensures that when meetings are deleted, their IDs can be reused for new meetings.
    """
    try:
        with get_connection() as conn:
            cur = conn.cursor()
            
            # Get all active meetings ordered by meeting_id
            cur.execute("SELECT meeting_id, title, admin_id, group_id, description FROM meetings WHERE is_active = 1 ORDER BY meeting_id")
            active_meetings = cur.fetchall()
            
            if not active_meetings:
                return
            
            # Check if IDs are already sequential starting from 1
            expected_ids = list(range(1, len(active_meetings) + 1))
            actual_ids = [row[0] for row in active_meetings]
            
            if actual_ids == expected_ids:
                # Already clean, no need to reorganize
                return
            
            # Create a temporary table with new sequential IDs
            cur.execute("DROP TABLE IF EXISTS meetings_temp")
            cur.execute("""
                CREATE TABLE meetings_temp (
                    meeting_id INTEGER PRIMARY KEY,
                    title TEXT NOT NULL,
                    admin_id INTEGER,
                    group_id TEXT,
                    description TEXT,
                    is_active INTEGER DEFAULT 1
                )
            """)
            
            # Insert active meetings with new sequential IDs
            for new_id, (old_id, title, admin_id, group_id, description) in enumerate(active_meetings, 1):
                cur.execute("""
                    INSERT INTO meetings_temp (meeting_id, title, admin_id, group_id, description, is_active)
                    VALUES (?, ?, ?, ?, ?, 1)
                """, (new_id, title, admin_id, group_id, description))
            
            # Update bits table to use new meeting IDs
            for new_id, (old_id, *_) in enumerate(active_meetings, 1):
                if old_id != new_id:
                    cur.execute("UPDATE bits SET meeting_id = ? WHERE meeting_id = ?", (new_id, old_id))
            
            # Update meeting_admins table
            for new_id, (old_id, *_) in enumerate(active_meetings, 1):
                if old_id != new_id:
                    cur.execute("UPDATE meeting_admins SET meeting_id = ? WHERE meeting_id = ?", (new_id, old_id))
            
            # Replace original table
            cur.execute("DROP TABLE meetings")
            cur.execute("ALTER TABLE meetings_temp RENAME TO meetings")
            
            # Reset the autoincrement counter
            cur.execute("DELETE FROM sqlite_sequence WHERE name = 'meetings'")
            cur.execute("INSERT INTO sqlite_sequence (name, seq) VALUES ('meetings', ?)", (len(active_meetings),))
            
            logger.info(f"Database cleanup completed. Reorganized {len(active_meetings)} meetings with sequential IDs.")
            
    except sqlite3.Error as e:
        logger.error(f"Database cleanup failed: {e}")
        raise
