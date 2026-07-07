from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from typing import Optional
from database import fetchall, fetchone, execute
from ws_manager import manager
from rbac import require_any, require_can_log_milk

router = APIRouter(prefix="/api/milk", tags=["milk"])


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


class MilkEntry(BaseModel):
    cow_id: int
    milk_amount_liters: float = Field(..., ge=0, le=200)
    milking_session: str = Field(..., pattern="^(Morning|Evening|Midday)$")
    milk_quality: Optional[str] = Field("Normal", max_length=50)
    milk_sold_liters: Optional[float] = Field(0, ge=0, le=200)
    milk_consumed_liters: Optional[float] = Field(0, ge=0, le=200)
    milk_calves_liters: Optional[float] = Field(0, ge=0, le=200)
    milk_lost_liters: Optional[float] = Field(0, ge=0, le=200)
    price_per_liter_rwf: Optional[float] = Field(400, ge=0, le=100000)
    entry_date: Optional[str] = None


@router.get("/")
async def list_milk(days: int = 7, _=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT m.*, c.cow_name, c.breed
        FROM MilkProductionRecords m
        JOIN Cows c ON m.cow_id = c.cow_id
        WHERE m.recorded_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
        ORDER BY m.recorded_at DESC
        """,
        (days,),
    )
    return [_safe(r) for r in rows]


@router.get("/daily-summary")
async def daily_summary(days: int = 7, _=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT c.cow_id, c.cow_name,
               CAST(m.recorded_at AS DATE) AS milk_date,
               SUM(CASE WHEN m.milking_session='Morning' THEN m.milk_amount_liters ELSE 0 END) AS morning_milk,
               SUM(CASE WHEN m.milking_session='Evening' THEN m.milk_amount_liters ELSE 0 END) AS evening_milk,
               SUM(m.milk_amount_liters) AS total_daily_milk
        FROM Cows c
        JOIN MilkProductionRecords m ON c.cow_id = m.cow_id
        WHERE CAST(m.recorded_at AS DATE) >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
        GROUP BY c.cow_id, c.cow_name, CAST(m.recorded_at AS DATE)
        ORDER BY milk_date DESC, c.cow_id
        """,
        (days,),
    )
    return [_safe(r) for r in rows]


@router.get("/top-producers")
async def top_producers(_=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT c.cow_id, c.cow_name, c.breed,
               SUM(m.milk_amount_liters) AS total_weekly_milk,
               AVG(m.milk_amount_liters) AS avg_session_milk,
               COUNT(m.milk_id) AS sessions
        FROM Cows c
        JOIN MilkProductionRecords m ON c.cow_id = m.cow_id
        WHERE m.recorded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY c.cow_id, c.cow_name, c.breed
        ORDER BY total_weekly_milk DESC
        LIMIT 5
        """
    )
    return [_safe(r) for r in rows]


@router.get("/sessions/today")
async def today_sessions(_=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT m.milking_session,
               SUM(m.milk_amount_liters) AS total_liters,
               COUNT(DISTINCT m.cow_id) AS cows_milked,
               AVG(m.milk_amount_liters) AS avg_liters
        FROM MilkProductionRecords m
        WHERE DATE(m.recorded_at) = CURDATE()
        GROUP BY m.milking_session
        """
    )
    return [_safe(r) for r in rows]


@router.post("/")
async def add_milk_record(
    entry: MilkEntry,
    current_user: dict = Depends(require_can_log_milk()),
):
    """Admin and Farmer can log milk records."""
    rid = await execute(
        """
        INSERT INTO MilkProductionRecords
        (cow_id, milk_amount_liters, milking_session, milk_quality,
         milk_sold_liters, milk_consumed_liters, milk_calves_liters,
         milk_lost_liters, price_per_liter_rwf, entry_date)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (entry.cow_id, entry.milk_amount_liters, entry.milking_session,
         entry.milk_quality, entry.milk_sold_liters or 0,
         entry.milk_consumed_liters or 0, entry.milk_calves_liters or 0,
         entry.milk_lost_liters or 0, entry.price_per_liter_rwf or 400,
         entry.entry_date),
    )
    await execute("UPDATE Cows SET last_milk_date=CURDATE() WHERE cow_id=%s", (entry.cow_id,))
    await manager.broadcast("milk_update", {
        "cow_id": entry.cow_id,
        "liters": entry.milk_amount_liters,
        "session": entry.milking_session,
        "logged_by": current_user["username"],
    })
    return {"id": rid}
