"""
Wearable ingest endpoints — no authentication, same convention as iot_ingest.py.

Two physical devices post here:
  - ESP32 RFID collar (testing_____________mome.ino): RFID scan, DS18B20 temp,
    TDS water quality, HC-SR04 ultrasonic distance.
  - ESP8266 vitals tag (full_test_umukandanara___mome.ino): DS18B20 temp,
    GPS location, MAX30102 heart-rate/SpO2, MPU6050 motion.

Each device scans an RFID tag to resolve which cow it is currently on;
subsequent sensor posts include that cow_id (resolved client-side from the
/rfid-scan response) so readings land against the right animal.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from database import execute, fetchall, fetchone
from ws_manager import manager
from rbac import require_any

router = APIRouter(prefix="/api/iot", tags=["iot_wearable"])


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

# ── Thresholds ────────────────────────────────────────────────────────────
THRESH_TEMP_FEVER   = 39.5
THRESH_TEMP_HIGH    = 39.0
THRESH_TDS_WARN     = 1000.0   # ppm
THRESH_TDS_CRIT     = 2000.0   # ppm
THRESH_HR_LOW       = 48       # bpm, cattle resting HR ~48-84
THRESH_HR_HIGH      = 100
THRESH_SPO2_WARN    = 90       # %


async def _resolve_cow(rfid_tag: str) -> Optional[dict]:
    return await fetchone(
        "SELECT cow_id, cow_name, breed, health_status, lactating FROM Cows "
        "WHERE rfid_tag = %s AND is_active = TRUE LIMIT 1",
        (rfid_tag,),
    )


async def _log_alert(alert_type: str, cow_id, severity: str, message: str):
    # Dedup on the exact message, not just (alert_type, cow_id) — otherwise a
    # fever alert would silence an unrelated heart-rate alert fired moments
    # later for the same cow, since both share alert_type="Health".
    dup = await fetchone(
        """
        SELECT alert_id FROM Alerts
        WHERE alert_type = %s
          AND (cow_id = %s OR (cow_id IS NULL AND %s IS NULL))
          AND message = %s
          AND is_resolved = FALSE
          AND created_at > NOW() - INTERVAL 10 MINUTE
        LIMIT 1
        """,
        (alert_type, cow_id, cow_id, message),
    )
    if dup:
        return
    await execute(
        "INSERT INTO Alerts (alert_type, cow_id, severity, message) VALUES (%s, %s, %s, %s)",
        (alert_type, cow_id, severity, message),
    )


# ── RFID scan (both devices call this to resolve/refresh cow_id) ───────────
class RfidScanPayload(BaseModel):
    device_id: str
    rfid_tag: str


@router.post("/rfid-scan")
async def rfid_scan(payload: RfidScanPayload):
    cow = await _resolve_cow(payload.rfid_tag)

    await execute(
        "INSERT INTO RfidScans (device_id, rfid_tag, cow_id, found) VALUES (%s, %s, %s, %s)",
        (payload.device_id, payload.rfid_tag, cow["cow_id"] if cow else None, 1 if cow else 0),
    )

    if not cow:
        return {"status": "success", "found": False, "cow_name": "Unknown",
                "message": f"RFID {payload.rfid_tag} not registered"}

    return {
        "status": "success",
        "found": True,
        "cow_id": cow["cow_id"],
        "cow_name": cow["cow_name"],
        "breed": cow["breed"],
        "health_status": cow["health_status"],
        "lactating": cow["lactating"],
        "rfid_tag": payload.rfid_tag,
    }


# ── ESP32 collar: DS18B20 temp + TDS + ultrasonic distance ─────────────────
class CollarPayload(BaseModel):
    device_id: str
    cow_id: Optional[int] = None
    temperature: Optional[float] = None
    tds_ppm: Optional[float] = None
    distance_cm: Optional[float] = None


@router.post("/wearable-collar")
async def wearable_collar(payload: CollarPayload):
    d = payload

    temp_reading_id = None
    if d.temperature is not None and d.cow_id is not None:
        status = "Normal"
        if d.temperature >= THRESH_TEMP_FEVER:
            status = "Fever"
        elif d.temperature >= THRESH_TEMP_HIGH:
            status = "Elevated"
        temp_reading_id = await execute(
            "INSERT INTO TemperatureReadings (cow_id, body_temp_celsius, status) VALUES (%s, %s, %s)",
            (d.cow_id, d.temperature, status),
        )
        if status == "Fever":
            await _log_alert("Health", d.cow_id, "Critical",
                             f"Fever detected: {d.temperature}°C")
        elif status == "Elevated":
            await _log_alert("Health", d.cow_id, "Warning",
                             f"Elevated body temp: {d.temperature}°C")

    wq_reading_id = await execute(
        "INSERT INTO WaterQualityReadings (device_id, cow_id, tds_ppm, distance_cm) VALUES (%s, %s, %s, %s)",
        (d.device_id, d.cow_id, d.tds_ppm, d.distance_cm),
    )

    if d.tds_ppm is not None:
        if d.tds_ppm >= THRESH_TDS_CRIT:
            await _log_alert("Water", d.cow_id, "Critical",
                             f"CRITICAL water quality: TDS {d.tds_ppm} ppm")
        elif d.tds_ppm >= THRESH_TDS_WARN:
            await _log_alert("Water", d.cow_id, "Warning",
                             f"Water quality degraded: TDS {d.tds_ppm} ppm")

    await manager.broadcast("wearable_collar_live", {
        "device_id": d.device_id,
        "cow_id": d.cow_id,
        "temperature": d.temperature,
        "tds_ppm": d.tds_ppm,
        "distance_cm": d.distance_cm,
    })

    return {"status": "success", "temp_reading_id": temp_reading_id, "wq_reading_id": wq_reading_id}


# ── ESP8266 vitals tag: DS18B20 temp + GPS + heart rate/SpO2 + motion ──────
class VitalsPayload(BaseModel):
    device_id: str
    cow_id: Optional[int] = None
    temperature: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    altitude_m: Optional[float] = None
    speed_kmph: Optional[float] = None
    satellites: Optional[int] = None
    hdop: Optional[float] = None
    heart_rate_bpm: Optional[float] = None
    spo2_pct: Optional[float] = None
    accel_x_g: Optional[float] = None
    accel_y_g: Optional[float] = None
    accel_z_g: Optional[float] = None
    gyro_x_dps: Optional[float] = None
    gyro_y_dps: Optional[float] = None
    gyro_z_dps: Optional[float] = None
    is_moving: bool = False


@router.post("/wearable-vitals")
async def wearable_vitals(payload: VitalsPayload):
    d = payload

    if d.temperature is not None and d.cow_id is not None:
        status = "Normal"
        if d.temperature >= THRESH_TEMP_FEVER:
            status = "Fever"
        elif d.temperature >= THRESH_TEMP_HIGH:
            status = "Elevated"
        await execute(
            "INSERT INTO TemperatureReadings (cow_id, body_temp_celsius, status) VALUES (%s, %s, %s)",
            (d.cow_id, d.temperature, status),
        )
        if status == "Fever":
            await _log_alert("Health", d.cow_id, "Critical",
                             f"Fever detected: {d.temperature}°C")
        elif status == "Elevated":
            await _log_alert("Health", d.cow_id, "Warning",
                             f"Elevated body temp: {d.temperature}°C")

    if d.latitude is not None and d.longitude is not None:
        await execute(
            """
            INSERT INTO LocationReadings
                (device_id, cow_id, latitude, longitude, altitude_m, speed_kmph, satellites, hdop)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (d.device_id, d.cow_id, d.latitude, d.longitude, d.altitude_m, d.speed_kmph, d.satellites, d.hdop),
        )

    vitals_reading_id = None
    if d.heart_rate_bpm is not None or d.spo2_pct is not None:
        vitals_reading_id = await execute(
            "INSERT INTO VitalsReadings (device_id, cow_id, heart_rate_bpm, spo2_pct, body_temp_c) VALUES (%s,%s,%s,%s,%s)",
            (d.device_id, d.cow_id, d.heart_rate_bpm, d.spo2_pct, d.temperature),
        )
        if d.heart_rate_bpm is not None and (d.heart_rate_bpm < THRESH_HR_LOW or d.heart_rate_bpm > THRESH_HR_HIGH):
            await _log_alert("Health", d.cow_id, "Warning",
                             f"Abnormal heart rate: {d.heart_rate_bpm} bpm")
        if d.spo2_pct is not None and d.spo2_pct < THRESH_SPO2_WARN:
            await _log_alert("Health", d.cow_id, "Warning",
                             f"Low SpO2: {d.spo2_pct}%")

    if any(v is not None for v in (d.accel_x_g, d.accel_y_g, d.accel_z_g)):
        await execute(
            """
            INSERT INTO MotionReadings
                (device_id, cow_id, accel_x_g, accel_y_g, accel_z_g, gyro_x_dps, gyro_y_dps, gyro_z_dps, is_moving)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (d.device_id, d.cow_id, d.accel_x_g, d.accel_y_g, d.accel_z_g,
             d.gyro_x_dps, d.gyro_y_dps, d.gyro_z_dps, 1 if d.is_moving else 0),
        )

    await manager.broadcast("wearable_vitals_live", {
        "device_id": d.device_id,
        "cow_id": d.cow_id,
        "latitude": d.latitude,
        "longitude": d.longitude,
        "heart_rate_bpm": d.heart_rate_bpm,
        "spo2_pct": d.spo2_pct,
        "is_moving": d.is_moving,
    })

    return {"status": "success", "vitals_reading_id": vitals_reading_id}


# ── Read endpoints for the dashboard ────────────────────────────────────────
@router.get("/water-quality/latest")
async def latest_water_quality(cow_id: Optional[int] = None, _=Depends(require_any())):
    if cow_id is not None:
        row = await fetchone(
            "SELECT * FROM WaterQualityReadings WHERE cow_id=%s ORDER BY recorded_at DESC LIMIT 1",
            (cow_id,),
        )
    else:
        row = await fetchone("SELECT * FROM WaterQualityReadings ORDER BY recorded_at DESC LIMIT 1")
    return _safe(row)


@router.get("/water-quality/history")
async def water_quality_history(hours: int = 24, cow_id: Optional[int] = None, _=Depends(require_any())):
    if cow_id is not None:
        rows = await fetchall(
            """
            SELECT * FROM WaterQualityReadings
            WHERE cow_id=%s AND recorded_at >= DATE_SUB(NOW(), INTERVAL %s HOUR)
            ORDER BY recorded_at ASC
            """,
            (cow_id, hours),
        )
    else:
        rows = await fetchall(
            """
            SELECT * FROM WaterQualityReadings
            WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL %s HOUR)
            ORDER BY recorded_at ASC
            """,
            (hours,),
        )
    return [_safe(r) for r in rows]


@router.get("/location/latest/{cow_id}")
async def latest_location(cow_id: int, _=Depends(require_any())):
    row = await fetchone(
        "SELECT * FROM LocationReadings WHERE cow_id=%s ORDER BY recorded_at DESC LIMIT 1",
        (cow_id,),
    )
    return _safe(row)


@router.get("/location/history/{cow_id}")
async def location_history(cow_id: int, hours: int = 24, _=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT * FROM LocationReadings
        WHERE cow_id=%s AND recorded_at >= DATE_SUB(NOW(), INTERVAL %s HOUR)
        ORDER BY recorded_at ASC
        """,
        (cow_id, hours),
    )
    return [_safe(r) for r in rows]


@router.get("/vitals/history/{cow_id}")
async def vitals_history(cow_id: int, hours: int = 24, _=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT * FROM VitalsReadings
        WHERE cow_id=%s AND recorded_at >= DATE_SUB(NOW(), INTERVAL %s HOUR)
        ORDER BY recorded_at ASC
        """,
        (cow_id, hours),
    )
    return [_safe(r) for r in rows]


@router.get("/motion/history/{cow_id}")
async def motion_history(cow_id: int, hours: int = 24, _=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT * FROM MotionReadings
        WHERE cow_id=%s AND recorded_at >= DATE_SUB(NOW(), INTERVAL %s HOUR)
        ORDER BY recorded_at ASC
        """,
        (cow_id, hours),
    )
    return [_safe(r) for r in rows]
