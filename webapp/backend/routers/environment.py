from fastapi import APIRouter, Depends
from form_model import FormModel
from typing import Optional
from database import fetchall, fetchone, execute
from ws_manager import manager
from rbac import require_any, require_can_add_env
from tenancy import farm_clause, farm_for_write
from periods import bucketed_series, period_days

router = APIRouter(prefix="/api/environment", tags=["environment"])


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


class EnvReading(FormModel):
    temperature_celsius: float
    humidity_percent: float
    air_quality_ppm: Optional[float] = None
    oxygen_percent: Optional[float] = None
    farm_id: Optional[int] = None   # Admin only: the farm the reading was taken on


@router.get("/latest")
async def latest(user=Depends(require_any())):
    where, args = farm_clause(user)
    row = await fetchone(
        f"SELECT * FROM EnvironmentalReadings WHERE {where} ORDER BY recorded_at DESC LIMIT 1",
        args,
    )
    return _safe(row)


@router.get("/history")
async def history(hours: int = 24, user=Depends(require_any())):
    """Readings over the last `hours`, or since the first reading when hours=0."""
    where, args = farm_clause(user)
    rows = await bucketed_series(
        "EnvironmentalReadings", "recorded_at",
        ["temperature_celsius", "humidity_percent", "air_quality_ppm", "oxygen_percent"],
        ["alert_triggered"], where, args, hours,
    )
    return [_safe(r) for r in rows]


@router.get("/daily-averages")
async def daily_averages(days: int = 7, user=Depends(require_any())):
    """One row per day over the last `days`, or all time when days=0."""
    days = period_days(days)
    where, args = farm_clause(user)
    since, sargs = ("recorded_at >= CURDATE() - INTERVAL %s DAY", (days - 1,)) if days else ("1=1", ())
    rows = await fetchall(
        f"""
        SELECT DATE(recorded_at) AS reading_date,
               AVG(temperature_celsius) AS avg_temp,
               AVG(humidity_percent) AS avg_humidity,
               AVG(air_quality_ppm) AS avg_air_quality,
               AVG(oxygen_percent) AS avg_oxygen,
               MAX(air_quality_ppm) AS max_aq,
               MAX(temperature_celsius) AS max_temp
        FROM EnvironmentalReadings
        WHERE {since} AND {where}
        GROUP BY DATE(recorded_at)
        ORDER BY reading_date DESC
        """,
        (*sargs, *args),
    )
    return [_safe(r) for r in rows]


@router.get("/cow-temperatures")
async def cow_temperatures(user=Depends(require_any())):
    where, args = farm_clause(user, "c.farm_id")
    rows = await fetchall(
        f"""
        SELECT c.cow_id, c.cow_name, c.health_status,
               t.body_temp_celsius, t.status AS temp_status, t.recorded_at
        FROM Cows c
        LEFT JOIN TemperatureReadings t ON t.reading_id = (
                SELECT reading_id FROM TemperatureReadings WHERE cow_id = c.cow_id
                ORDER BY recorded_at DESC, reading_id DESC LIMIT 1
            )
        WHERE c.is_active = 1 AND {where}
        ORDER BY t.body_temp_celsius DESC
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.post("/")
async def add_reading(
    reading: EnvReading,
    current_user: dict = Depends(require_can_add_env()),
):
    """Admin and Technician can add environmental readings (IoT calibration / manual entry)."""
    farm_id = await farm_for_write(current_user, reading.farm_id)
    alert = reading.air_quality_ppm is not None and reading.air_quality_ppm > 600
    rid = await execute(
        """
        INSERT INTO EnvironmentalReadings
        (temperature_celsius, humidity_percent, air_quality_ppm, oxygen_percent, alert_triggered, farm_id)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (reading.temperature_celsius, reading.humidity_percent,
         reading.air_quality_ppm, reading.oxygen_percent, alert, farm_id),
    )
    await manager.broadcast("env_update", {
        **reading.model_dump(),
        "farm_id": farm_id,
        "added_by": current_user["username"],
    }, farm_id=farm_id)
    if alert:
        await execute(
            """
            INSERT INTO Alerts (alert_type, severity, message, farm_id)
            VALUES ('Air Quality', 'Warning', %s, %s)
            """,
            (f"Air quality elevated: {reading.air_quality_ppm:.0f} PPM (logged by {current_user['username']})", farm_id),
        )
    return {"id": rid}
