"""Create the SQLite database from schema.sql and seed.sql.

Usage:  python db/init_db.py [--reset]
"""
import argparse
import csv
import ipaddress
import sqlite3
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB_PATH = HERE / "shop.sqlite3"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="delete the existing database first")
    args = parser.parse_args()

    if args.reset and DB_PATH.exists():
        DB_PATH.unlink()

    conn = sqlite3.connect(DB_PATH)
    conn.executescript((HERE / "schema.sql").read_text())
    if conn.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
        conn.executescript((HERE / "seed.sql").read_text())
        print("Seeded sample data.")
    else:
        print("Database already has products; skipping seed (use --reset to start over).")
    if conn.execute("SELECT COUNT(*) FROM geo_ranges").fetchone()[0] == 0:
        with open(HERE / "geo_ranges.csv", newline="") as f:
            rows = []
            for r in csv.DictReader(f):
                net = ipaddress.ip_network(r["cidr"])
                rows.append((r["cidr"], int(net.network_address), int(net.broadcast_address), r["country_code"], r["country_name"]))
        conn.executemany("INSERT INTO geo_ranges (cidr,start_ip,end_ip,country_code,country_name) VALUES (?,?,?,?,?)", rows)
        print(f"Loaded {len(rows)} IP ranges for country lookup.")
    conn.commit()
    n = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    print(f"Database ready at {DB_PATH} ({n} products).")
    conn.close()


if __name__ == "__main__":
    main()
