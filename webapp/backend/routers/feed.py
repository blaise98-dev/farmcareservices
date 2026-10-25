from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from database import fetchall, fetchone, execute
from ws_manager import manager
from rbac import require_any, require_can_log_feed
from tenancy import farm_clause, cow_clause, ensure_cow_access, ensure_row_access

router = APIRouter(prefix="/api/feed", tags=["feed"])


def _safe(row: dict) -> dict:
    if not row:
        return {}
    out = {}
    for k, v in row.items():
        if hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        elif hasattr(v, "__float__"):
            out[k] = float(v)
        else:
            out[k] = v
    return out


class FeedEntry(BaseModel):
    cow_id: Optional[int] = None
    group_id: Optional[int] = None
    feed_amount_kg: float = Field(..., ge=0, le=10000)
    feed_type: Optional[str] = Field("Mixed Feed", max_length=100)
    methane_impact: Optional[str] = Field("Neutral", pattern="^(Increases|Reduces|Neutral)$")
    dispensed_by_system: Optional[bool] = False
    prescription_notes: Optional[str] = Field(None, max_length=1000)
    entry_date: Optional[str] = None


@router.get("/")
async def list_feed(days: int = 7, user=Depends(require_any())):
    # Group feedings have no cow_id, so they are scoped through their group
    cwhere, cargs = cow_clause(user, "f.cow_id")
    gwhere, gargs = farm_clause(user, "g.farm_id")
    rows = await fetchall(
        f"""
        SELECT f.*, c.cow_name
        FROM FeedingRecords f
        LEFT JOIN Cows c ON f.cow_id = c.cow_id
        LEFT JOIN AnimalGroups g ON f.group_id = g.group_id
        WHERE f.recorded_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
          AND ({cwhere} OR (f.cow_id IS NULL AND {gwhere}))
        ORDER BY f.recorded_at DESC
        """,
        (days, *cargs, *gargs),
    )
    return [_safe(r) for r in rows]


@router.get("/daily-summary")
async def daily_summary(user=Depends(require_any())):
    where, args = farm_clause(user, "c.farm_id")
    rows = await fetchall(
        f"""
        SELECT DATE(f.recorded_at) AS feed_date,
               c.cow_name, c.cow_id,
               f.feed_type, f.methane_impact,
               SUM(f.feed_amount_kg) AS total_kg,
               AVG(f.feed_amount_kg) AS avg_kg
        FROM FeedingRecords f
        JOIN Cows c ON f.cow_id = c.cow_id
        WHERE f.recorded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND {where}
        GROUP BY DATE(f.recorded_at), c.cow_id, c.cow_name, f.feed_type, f.methane_impact
        ORDER BY feed_date DESC, c.cow_id
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.get("/water")
async def water_intake(days: int = 7, user=Depends(require_any())):
    where, args = farm_clause(user, "c.farm_id")
    rows = await fetchall(
        f"""
        SELECT w.*, c.cow_name
        FROM WaterIntakeRecords w
        JOIN Cows c ON w.cow_id = c.cow_id
        WHERE w.recorded_at >= DATE_SUB(NOW(), INTERVAL %s DAY) AND {where}
        ORDER BY w.recorded_at DESC
        """,
        (days, *args),
    )
    return [_safe(r) for r in rows]


@router.get("/water/today")
async def water_today(user=Depends(require_any())):
    where, args = farm_clause(user, "c.farm_id")
    rows = await fetchall(
        f"""
        SELECT c.cow_id, c.cow_name,
               SUM(w.water_intake_liters) AS total_liters
        FROM WaterIntakeRecords w
        JOIN Cows c ON w.cow_id = c.cow_id
        WHERE DATE(w.recorded_at) = CURDATE() AND {where}
        GROUP BY c.cow_id, c.cow_name
        ORDER BY total_liters DESC
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.get("/methane-summary")
async def methane_summary(user=Depends(require_any())):
    """Methane impact breakdown per cow based on their feed history (last 30 days)."""
    where, args = farm_clause(user, "c.farm_id")
    rows = await fetchall(
        f"""
        SELECT c.cow_id, c.cow_name,
               SUM(CASE WHEN f.methane_impact='Increases' THEN f.feed_amount_kg ELSE 0 END) AS high_methane_kg,
               SUM(CASE WHEN f.methane_impact='Reduces'   THEN f.feed_amount_kg ELSE 0 END) AS low_methane_kg,
               SUM(CASE WHEN f.methane_impact='Neutral'   THEN f.feed_amount_kg ELSE 0 END) AS neutral_kg,
               SUM(f.feed_amount_kg) AS total_kg,
               ROUND(
                 100.0 * SUM(CASE WHEN f.methane_impact='Increases' THEN f.feed_amount_kg ELSE 0 END)
                 / NULLIF(SUM(f.feed_amount_kg), 0), 1
               ) AS high_methane_pct
        FROM FeedingRecords f
        JOIN Cows c ON f.cow_id = c.cow_id
        WHERE f.recorded_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND {where}
        GROUP BY c.cow_id, c.cow_name
        ORDER BY high_methane_pct DESC
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.post("/")
async def add_feed_record(
    entry: FeedEntry,
    current_user: dict = Depends(require_can_log_feed()),
):
    """Admin and Farmer can log feed records."""
    # The cow and group must be visible, and on the same farm when both are given
    farm_id = None
    if entry.cow_id is not None:
        farm_id = (await ensure_cow_access(current_user, entry.cow_id))["farm_id"]
    if entry.group_id is not None:
        group = await ensure_row_access(current_user, "AnimalGroups", "group_id", entry.group_id)
        if entry.cow_id is not None and group["farm_id"] != farm_id:
            raise HTTPException(400, "Cow and group must be on the same farm")
        farm_id = group["farm_id"]
    rid = await execute(
        """
        INSERT INTO FeedingRecords
        (cow_id, group_id, feed_amount_kg, feed_type, methane_impact,
         dispensed_by_system, prescription_notes, entry_date, recorded_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (entry.cow_id, entry.group_id, entry.feed_amount_kg, entry.feed_type,
         entry.methane_impact, entry.dispensed_by_system,
         entry.prescription_notes, entry.entry_date, current_user["username"]),
    )
    await manager.broadcast("feed_update", {
        "cow_id": entry.cow_id,
        "kg": entry.feed_amount_kg,
        "feed_type": entry.feed_type,
        "methane_impact": entry.methane_impact,
        "logged_by": current_user["username"],
    }, farm_id=farm_id)
    return {"id": rid}
