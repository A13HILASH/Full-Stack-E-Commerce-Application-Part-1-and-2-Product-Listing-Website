import sqlite3
from pathlib import Path

from fastapi import HTTPException

DB_PATH = Path(__file__).resolve().parent.parent / "db" / "shop.sqlite3"


def get_conn() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise HTTPException(503, "Database not initialised. Run: python db/init_db.py")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn
