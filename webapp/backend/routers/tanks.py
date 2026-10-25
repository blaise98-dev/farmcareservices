from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import fetchall, fetchone, execute
from rbac import require_any, require_admin_or_technician
from tenancy import farm_clause, ensure_row_access, farm_for_write

router = APIRouter(prefix="/api/tanks", tags=["tanks"])


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


class TankReading(BaseModel):
    tank_id: int
    level_liters: float
    action: Optional[str] = "Reading"
    notes: Optional[str] = None


class TankCreate(BaseModel):
    tank_name: str
    tank_type: Optional[str] = "Water"
    capacity_liters: float
    current_level_liters: Optional[float] = 0
    min_level_liters: Optional[float] = 0
    location: Optional[str] = None
    farm_id: Optional[int] = None    # Admin only; others use their own farm


@router.get("/")
async def list_tanks(user=Depends(require_admin_or_technician())):
    where, args = farm_clause(user, "t.farm_id")
    rows = await fetchall(
        f"""
        SELECT t.*,
               ROUND((t.current_level_liters / t.capacity_liters) * 100, 1) AS fill_pct,
               (t.current_level_liters <= t.min_level_liters) AS is_low
        FROM Tanks t
        WHERE t.is_active = TRUE AND {where}
        ORDER BY t.tank_type, t.tank_name
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.get("/{tank_id}/history")
async def tank_history(tank_id: int, user=Depends(require_admin_or_technician())):
    await ensure_row_access(user, "Tanks", "tank_id", tank_id)
    rows = await fetchall(
        """
        SELECT * FROM TankReadings
        WHERE tank_id = %s
        ORDER BY recorded_at DESC
        LIMIT 30
        """,
        (tank_id,),
    )
    return [_safe(r) for r in rows]


@router.post("/readings")
async def add_reading(
    body: TankReading,
    current_user: dict = Depends(require_admin_or_technician()),
):
    await ensure_row_access(current_user, "Tanks", "tank_id", body.tank_id)
    await execute(
        """
        INSERT INTO TankReadings (tank_id, level_liters, action, notes, recorded_by)
        VALUES (%s,%s,%s,%s,%s)
        """,
        (body.tank_id, body.level_liters, body.action, body.notes,
         current_user["username"]),
    )
    await execute(
        "UPDATE Tanks SET current_level_liters=%s, updated_at=NOW() WHERE tank_id=%s",
        (body.level_liters, body.tank_id),
    )
    if body.action == "Refill":
        await execute(
            "UPDATE Tanks SET last_refill_at=NOW() WHERE tank_id=%s",
            (body.tank_id,),
        )
    return {"ok": True}


@router.post("/")
async def create_tank(
    body: TankCreate,
    user=Depends(require_admin_or_technician()),
):
    farm_id = await farm_for_write(user, body.farm_id)
    rid = await execute(
        """
        INSERT INTO Tanks
        (tank_name, tank_type, capacity_liters, current_level_liters, min_level_liters, location, farm_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
        """,
        (body.tank_name, body.tank_type, body.capacity_liters,
         body.current_level_liters, body.min_level_liters, body.location, farm_id),
    )
    return {"ok": True, "tank_id": rid}
