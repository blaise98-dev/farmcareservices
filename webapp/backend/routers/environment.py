from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from database import fetchall, fetchone, execute
from ws_manager import manager
from rbac import require_any, require_can_add_env

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


class EnvReading(BaseModel):
    temperature_celsius: float
    humidity_percent: float
    air_quality_ppm: Optional[float] = None
    oxygen_percent: Optional[float] = None


@router.get("/latest")
async def latest(_=Depends(require_any())):
    row = await fetchone(
        "SELECT * FROM EnvironmentalReadings ORDER BY recorded_at DESC LIMIT 1"
    )
    return _safe(row)


@router.get("/history")
async def history(hours: int = 24, _=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT * FROM EnvironmentalReadings
        WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL %s HOUR)
        ORDER BY recorded_at ASC
        """,
        (hours,),
    )
    return [_safe(r) for r in rows]


@router.get("/daily-averages")
async def daily_averages(_=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT DATE(recorded_at) AS reading_date,
               AVG(temperature_celsius) AS avg_temp,
               AVG(humidity_percent) AS avg_humidity,
               AVG(air_quality_ppm) AS avg_air_quality,
               AVG(oxygen_percent) AS avg_oxygen,
               MAX(air_quality_ppm) AS max_aq,
               MAX(temperature_celsius) AS max_temp
        FROM EnvironmentalReadings
        WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(recorded_at)
        ORDER BY reading_date DESC
        """
    )
    return [_safe(r) for r in rows]


@router.get("/cow-temperatures")
async def cow_temperatures(_=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT c.cow_id, c.cow_name, c.health_status,
               t.body_temp_celsius, t.status AS temp_status, t.recorded_at
        FROM Cows c
        LEFT JOIN TemperatureReadings t ON c.cow_id = t.cow_id
            AND t.recorded_at = (
                SELECT MAX(recorded_at) FROM TemperatureReadings WHERE cow_id = c.cow_id
            )
        WHERE c.is_active = 1
        ORDER BY t.body_temp_celsius DESC
        """
    )
    return [_safe(r) for r in rows]


@router.post("/")
async def add_reading(
    reading: EnvReading,
    current_user: dict = Depends(require_can_add_env()),
):
    """Admin and Technician can add environmental readings (IoT calibration / manual entry)."""
    alert = reading.air_quality_ppm is not None and reading.air_quality_ppm > 600
    rid = await execute(
        """
        INSERT INTO EnvironmentalReadings
        (temperature_celsius, humidity_percent, air_quality_ppm, oxygen_percent, alert_triggered)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (reading.temperature_celsius, reading.humidity_percent,
         reading.air_quality_ppm, reading.oxygen_percent, alert),
    )
    await manager.broadcast("env_update", {
        **reading.model_dump(),
        "added_by": current_user["username"],
    })
    if alert:
        await execute(
            """
            INSERT INTO Alerts (alert_type, severity, message)
            VALUES ('Air Quality', 'Warning', %s)
            """,
            (f"Air quality elevated: {reading.air_quality_ppm:.0f} PPM (logged by {current_user['username']})",),
        )
    return {"id": rid}
