from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from typing import Optional
from database import fetchall, fetchone, execute
from ws_manager import manager
from rbac import require_any, require_can_log_feed

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
async def list_feed(days: int = 7, _=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT f.*, c.cow_name
        FROM FeedingRecords f
        JOIN Cows c ON f.cow_id = c.cow_id
        WHERE f.recorded_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
        ORDER BY f.recorded_at DESC
        """,
        (days,),
    )
    return [_safe(r) for r in rows]


@router.get("/daily-summary")
async def daily_summary(_=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT DATE(f.recorded_at) AS feed_date,
               c.cow_name, c.cow_id,
               f.feed_type, f.methane_impact,
               SUM(f.feed_amount_kg) AS total_kg,
               AVG(f.feed_amount_kg) AS avg_kg
        FROM FeedingRecords f
        JOIN Cows c ON f.cow_id = c.cow_id
        WHERE f.recorded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(f.recorded_at), c.cow_id, c.cow_name, f.feed_type, f.methane_impact
        ORDER BY feed_date DESC, c.cow_id
        """,
    )
    return [_safe(r) for r in rows]


@router.get("/water")
async def water_intake(days: int = 7, _=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT w.*, c.cow_name
        FROM WaterIntakeRecords w
        JOIN Cows c ON w.cow_id = c.cow_id
        WHERE w.recorded_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
        ORDER BY w.recorded_at DESC
        """,
        (days,),
    )
    return [_safe(r) for r in rows]


@router.get("/water/today")
async def water_today(_=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT c.cow_id, c.cow_name,
               SUM(w.water_intake_liters) AS total_liters
        FROM WaterIntakeRecords w
        JOIN Cows c ON w.cow_id = c.cow_id
        WHERE DATE(w.recorded_at) = CURDATE()
        GROUP BY c.cow_id, c.cow_name
        ORDER BY total_liters DESC
        """
    )
    return [_safe(r) for r in rows]


@router.get("/methane-summary")
async def methane_summary(_=Depends(require_any())):
    """Methane impact breakdown per cow based on their feed history (last 30 days)."""
    rows = await fetchall(
        """
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
        WHERE f.recorded_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY c.cow_id, c.cow_name
        ORDER BY high_methane_pct DESC
        """
    )
    return [_safe(r) for r in rows]


@router.post("/")
async def add_feed_record(
    entry: FeedEntry,
    current_user: dict = Depends(require_can_log_feed()),
):
    """Admin and Farmer can log feed records."""
    rid = await execute(
        """
        INSERT INTO FeedingRecords
        (cow_id, group_id, feed_amount_kg, feed_type, methane_impact,
         dispensed_by_system, prescription_notes, entry_date)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (entry.cow_id, entry.group_id, entry.feed_amount_kg, entry.feed_type,
         entry.methane_impact, entry.dispensed_by_system,
         entry.prescription_notes, entry.entry_date),
    )
    await manager.broadcast("feed_update", {
        "cow_id": entry.cow_id,
        "kg": entry.feed_amount_kg,
        "feed_type": entry.feed_type,
        "methane_impact": entry.methane_impact,
        "logged_by": current_user["username"],
    })
    return {"id": rid}
