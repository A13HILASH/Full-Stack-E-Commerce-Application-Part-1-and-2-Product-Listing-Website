"""User analytics: simulated traffic, IP -> country lookup, country distribution."""
import ipaddress
import random
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .db import get_conn

router = APIRouter(prefix="/api/admin", tags=["analytics"])

# Relative traffic share used when simulating visitors.
WEIGHTS = {"IN": 25, "US": 22, "GB": 10, "BR": 7, "DE": 8, "FR": 6, "JP": 6, "CA": 5, "AU": 4, "SG": 3, "ZA": 2, "AE": 2}
PATHS = ["/api/products"] * 5 + [f"/api/products/{i}" for i in range(1, 13)]
FMT = "%Y-%m-%d %H:%M:%S"


def lookup_country(conn, ip: str) -> tuple[str, str]:
    """Resolve an IPv4 address to (country_code, country_name) using the geo_ranges table."""
    addr = ipaddress.ip_address(ip.strip())  # raises ValueError if invalid
    if addr.version != 4:
        return "??", "Unknown (IPv6 not in sample data)"
    if addr.is_private or addr.is_loopback:
        return "--", "Local / private network"
    n = int(addr)
    row = conn.execute(
        "SELECT country_code, country_name FROM geo_ranges WHERE start_ip <= ? AND end_ip >= ? LIMIT 1", (n, n)
    ).fetchone()
    return (row["country_code"], row["country_name"]) if row else ("??", "Unknown")


def log_visit(ip: str, path: str, source: str = "real") -> None:
    conn = get_conn()
    try:
        code, name = lookup_country(conn, ip)
        conn.execute(
            "INSERT INTO visits (ip, country_code, country_name, path, source) VALUES (?,?,?,?,?)",
            (ip.strip(), code, name, path, source),
        )
        conn.commit()
    finally:
        conn.close()


class SimulateRequest(BaseModel):
    count: int = Field(300, ge=1, le=5000, description="Number of visits to generate")
    days: int = Field(7, ge=1, le=90, description="Spread visits over the last N days")


@router.post("/simulate", status_code=201)
def simulate(req: SimulateRequest):
    conn = get_conn()
    try:
        blocks: dict[str, list] = {}
        for r in conn.execute("SELECT cidr, country_code, country_name FROM geo_ranges"):
            blocks.setdefault(r["country_code"], []).append((r["cidr"], r["country_name"]))
        codes = [c for c in WEIGHTS if c in blocks]
        now = datetime.utcnow()
        rows = []
        for _ in range(req.count):
            code = random.choices(codes, weights=[WEIGHTS[c] for c in codes])[0]
            cidr, name = random.choice(blocks[code])
            net = ipaddress.ip_network(cidr)
            ip = str(net.network_address + random.randint(1, net.num_addresses - 2))
            ts = now - timedelta(seconds=random.randint(0, req.days * 86400))
            rows.append((ip, code, name, random.choice(PATHS), "simulated", ts.strftime(FMT)))
        conn.executemany(
            "INSERT INTO visits (ip, country_code, country_name, path, source, created_at) VALUES (?,?,?,?,?,?)", rows
        )
        conn.commit()
        return {"inserted": len(rows)}
    finally:
        conn.close()


@router.get("/lookup")
def lookup(ip: str = Query(..., max_length=45)):
    conn = get_conn()
    try:
        try:
            code, name = lookup_country(conn, ip)
        except ValueError:
            raise HTTPException(422, f"'{ip}' is not a valid IP address")
        return {"ip": ip.strip(), "country_code": code, "country": name}
    finally:
        conn.close()


@router.get("/analytics/countries")
def countries(days: Optional[int] = Query(None, ge=1, le=365)):
    conn = get_conn()
    try:
        where, params = "", []
        if days:
            where = "WHERE created_at >= ?"
            params = [(datetime.utcnow() - timedelta(days=days)).strftime(FMT)]
        rows = conn.execute(
            f"""SELECT country_code, country_name, COUNT(*) AS visits, COUNT(DISTINCT ip) AS unique_ips
                FROM visits {where} GROUP BY country_code, country_name ORDER BY visits DESC""",
            params,
        ).fetchall()
        total = sum(r["visits"] for r in rows)
        unique = conn.execute(f"SELECT COUNT(DISTINCT ip) FROM visits {where}", params).fetchone()[0]
        return {
            "total_visits": total,
            "unique_ips": unique,
            "countries": [{**dict(r), "percent": round(100 * r["visits"] / total, 1) if total else 0} for r in rows],
        }
    finally:
        conn.close()


@router.get("/analytics/recent")
def recent(limit: int = Query(15, ge=1, le=100)):
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT ip, country_code, country_name, path, source, created_at FROM visits ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@router.delete("/analytics", status_code=204)
def clear_analytics():
    conn = get_conn()
    try:
        conn.execute("DELETE FROM visits")
        conn.commit()
    finally:
        conn.close()
