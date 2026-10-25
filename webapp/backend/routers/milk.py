from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from form_model import FormModel
from typing import Optional
from database import fetchall, fetchone, execute
from ws_manager import manager
from rbac import require_any, require_can_log_milk
from periods import period_days
from tenancy import farm_clause, cow_clause, ensure_cow_access

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


class MilkEntry(FormModel):
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


def _since(days: int, condition: str):
    """(SQL, args) for "within the last `days`"; no limit when days=0 (all time)."""
    days = period_days(days)
    return (condition, (days,)) if days else ("1=1", ())


@router.get("/")
async def list_milk(days: int = 7, user=Depends(require_any())):
    """Records from the last `days`, or all of them when days=0."""
    where, args = farm_clause(user, "c.farm_id")
    since, sargs = _since(days, "m.recorded_at >= DATE_SUB(NOW(), INTERVAL %s DAY)")
    rows = await fetchall(
        f"""
        SELECT m.*, c.cow_name, c.breed
        FROM MilkProductionRecords m
        JOIN Cows c ON m.cow_id = c.cow_id
        WHERE {since} AND {where}
        ORDER BY m.recorded_at DESC
        """,
        (*sargs, *args),
    )
    return [_safe(r) for r in rows]


@router.get("/daily-summary")
async def daily_summary(days: int = 7, user=Depends(require_any())):
    """Litres per cow per day over the last `days`, or all time when days=0."""
    where, args = farm_clause(user, "c.farm_id")
    since, sargs = _since(days, "CAST(m.recorded_at AS DATE) >= DATE_SUB(CURDATE(), INTERVAL %s DAY)")
    rows = await fetchall(
        f"""
        SELECT c.cow_id, c.cow_name,
               CAST(m.recorded_at AS DATE) AS milk_date,
               SUM(CASE WHEN m.milking_session='Morning' THEN m.milk_amount_liters ELSE 0 END) AS morning_milk,
               SUM(CASE WHEN m.milking_session='Midday' THEN m.milk_amount_liters ELSE 0 END) AS midday_milk,
               SUM(CASE WHEN m.milking_session='Evening' THEN m.milk_amount_liters ELSE 0 END) AS evening_milk,
               SUM(m.milk_amount_liters) AS total_daily_milk
        FROM Cows c
        JOIN MilkProductionRecords m ON c.cow_id = m.cow_id
        WHERE {since} AND {where}
        GROUP BY c.cow_id, c.cow_name, CAST(m.recorded_at AS DATE)
        ORDER BY milk_date DESC, c.cow_id
        """,
        (*sargs, *args),
    )
    return [_safe(r) for r in rows]


@router.get("/top-producers")
async def top_producers(days: int = 7, user=Depends(require_any())):
    """The five cows that gave the most milk over the last `days` (0 = all time)."""
    where, args = farm_clause(user, "c.farm_id")
    since, sargs = _since(days, "m.recorded_at >= DATE_SUB(NOW(), INTERVAL %s DAY)")
    rows = await fetchall(
        f"""
        SELECT c.cow_id, c.cow_name, c.breed,
               SUM(m.milk_amount_liters) AS total_weekly_milk,
               AVG(m.milk_amount_liters) AS avg_session_milk,
               COUNT(m.milk_id) AS sessions
        FROM Cows c
        JOIN MilkProductionRecords m ON c.cow_id = m.cow_id
        WHERE {since} AND {where}
        GROUP BY c.cow_id, c.cow_name, c.breed
        ORDER BY total_weekly_milk DESC
        LIMIT 5
        """,
        (*sargs, *args),
    )
    return [_safe(r) for r in rows]


@router.get("/sessions/today")
async def today_sessions(user=Depends(require_any())):
    where, args = cow_clause(user, "m.cow_id")
    rows = await fetchall(
        f"""
        SELECT m.milking_session,
               SUM(m.milk_amount_liters) AS total_liters,
               COUNT(DISTINCT m.cow_id) AS cows_milked,
               AVG(m.milk_amount_liters) AS avg_liters
        FROM MilkProductionRecords m
        WHERE DATE(m.recorded_at) = CURDATE() AND {where}
        GROUP BY m.milking_session
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.post("/")
async def add_milk_record(
    entry: MilkEntry,
    current_user: dict = Depends(require_can_log_milk()),
):
    """Admin and Farmer can log milk records.

    The record is dated on the milking day chosen in the form (recorded_at is
    set to that day at the current time), so it lands on the right day in the
    daily table and charts, which group by recorded_at.
    """
    cow = await ensure_cow_access(current_user, entry.cow_id)
    if entry.milk_amount_liters <= 0:
        raise HTTPException(400, "Enter the litres milked (more than 0)")
    day = None
    if entry.entry_date:
        try:
            day = date.fromisoformat(entry.entry_date[:10])
        except ValueError:
            raise HTTPException(400, "Date must be YYYY-MM-DD")
        today = (await fetchone("SELECT CURDATE() AS d"))["d"]
        if day > today:
            raise HTTPException(400, "The milking date cannot be in the future")
    rid = await execute(
        """
        INSERT INTO MilkProductionRecords
        (cow_id, milk_amount_liters, milking_session, milk_quality,
         milk_sold_liters, milk_consumed_liters, milk_calves_liters,
         milk_lost_liters, price_per_liter_rwf, entry_date, recorded_by, recorded_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                IF(%s IS NULL, NOW(), TIMESTAMP(%s, CURTIME())))
        """,
        (entry.cow_id, entry.milk_amount_liters, entry.milking_session,
         entry.milk_quality, entry.milk_sold_liters or 0,
         entry.milk_consumed_liters or 0, entry.milk_calves_liters or 0,
         entry.milk_lost_liters or 0, entry.price_per_liter_rwf or 400,
         day, current_user["username"], day, day),
    )
    # Keep the newest milking day (a back-dated record must not move it backwards)
    await execute(
        """
        UPDATE Cows SET last_milk_date = GREATEST(COALESCE(last_milk_date, COALESCE(%s, CURDATE())), COALESCE(%s, CURDATE()))
        WHERE cow_id=%s
        """,
        (day, day, entry.cow_id),
    )
    await manager.broadcast("milk_update", {
        "cow_id": entry.cow_id,
        "liters": entry.milk_amount_liters,
        "session": entry.milking_session,
        "logged_by": current_user["username"],
    }, farm_id=cow["farm_id"])
    return {"id": rid, "cow_name": cow["cow_name"], "liters": entry.milk_amount_liters,
            "date": (day.isoformat() if day else None)}
