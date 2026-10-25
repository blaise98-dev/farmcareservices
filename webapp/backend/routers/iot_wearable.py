"""
Wearable and Milking Station ingest endpoints: no authentication, same
convention as iot_ingest.py.

Two sketches post here:
  - ESP32 station (testing_____________mome.ino): RFID reader, DS18B20
    temperature, TDS probe, HC-SR04 ultrasonic. In the field it is the Milking
    Station: the ultrasonic sensor sits on the rim of the milk container, so
    distance_cm is milk depth and the probes read the milk.
  - ESP8266 Health Collar (full_test_umukandanara___mome.ino): DS18B20
    temperature, GPS, MAX30102 heart rate/SpO2, MPU6050 motion.

The IoTDevices registry decides how a device's readings are interpreted. A
device registered with role "collar" that posts to /wearable-collar keeps the
original behaviour (cow body temperature + water quality). A device only
resolves cows on its own farm; a device not yet assigned to a farm resolves none.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from alerting import log_alert
from database import execute, fetchall, fetchone
from farm_config import as_float, device_config, get_settings, milk_level, touch_device
from health_risk import distance_m
from periods import bucketed_series, period_hours
from rbac import require_any
from tenancy import cow_clause, ensure_cow_access, farm_of_device
from ws_manager import manager

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


# ── Thresholds (temperature rules come from FarmSettings) ─────────────────
THRESH_TDS_WARN     = 1000.0   # ppm, drinking water
THRESH_TDS_CRIT     = 2000.0   # ppm
THRESH_HR_LOW       = 48       # bpm, cattle resting HR ~48-84
THRESH_HR_HIGH      = 100
THRESH_SPO2_WARN    = 90       # %
SESSION_MAX_HOURS   = 2        # an Active milking session older than this is stale


async def _resolve_cow(rfid_tag: str, farm_id) -> Optional[dict]:
    if farm_id is None:
        return None
    return await fetchone(
        "SELECT cow_id, cow_name, breed, health_status, lactating, farm_id FROM Cows "
        "WHERE rfid_tag = %s AND is_active = TRUE AND farm_id = %s LIMIT 1",
        (rfid_tag, farm_id),
    )


async def _farm_cow(cow_id: Optional[int], farm_id) -> Optional[int]:
    """The cow_id a device reported, only if that cow is on the device's farm."""
    if cow_id is None or farm_id is None:
        return None
    row = await fetchone("SELECT cow_id FROM Cows WHERE cow_id = %s AND farm_id = %s", (cow_id, farm_id))
    return row["cow_id"] if row else None


async def _insert_temperature(cow_id: int, temp: float, status: str) -> Optional[int]:
    """TemperatureReadings.status may be an ENUM without 'Hypothermia' on older servers."""
    try:
        return await execute(
            "INSERT INTO TemperatureReadings (cow_id, body_temp_celsius, status) VALUES (%s, %s, %s)",
            (cow_id, temp, status),
        )
    except Exception:  # noqa: BLE001
        return await execute(
            "INSERT INTO TemperatureReadings (cow_id, body_temp_celsius, status) VALUES (%s, %s, %s)",
            (cow_id, temp, "Normal" if status == "Hypothermia" else status),
        )


async def _record_body_temperature(cow_id: int, temp: float, farm_id) -> Optional[int]:
    s = await get_settings(farm_id)
    hypo = as_float(s, "cow_hypothermia_c") or 37.0
    high = as_float(s, "cow_temp_high_c") or 39.0
    fever = as_float(s, "cow_fever_c") or 39.5
    status = "Normal"
    if temp >= fever:
        status = "Fever"
    elif temp >= high:
        status = "Elevated"
    elif temp <= hypo:
        status = "Hypothermia"
    rid = await _insert_temperature(cow_id, temp, status)
    if status == "Fever":
        await log_alert("Health", cow_id, "Critical", f"Fever detected: {temp}°C")
    elif status == "Elevated":
        await log_alert("Health", cow_id, "Warning", f"Elevated body temp: {temp}°C")
    elif status == "Hypothermia":
        await log_alert("Health", cow_id, "Warning",
                        f"Body temperature {temp}°C is at/below the {hypo}°C hypothermia threshold")
    return rid


async def active_session(device_id: str) -> Optional[dict]:
    return await fetchone(
        """
        SELECT * FROM MilkingSessions
        WHERE device_id = %s AND status = 'Active'
          AND start_time > NOW() - INTERVAL %s HOUR
        ORDER BY start_time DESC LIMIT 1
        """,
        (device_id, SESSION_MAX_HOURS),
    )


async def start_session(device_id: str, cow: dict, rfid_tag: str, farm_id) -> int:
    """Open a milking session for a cow on a station, closing any unfinished one."""
    await execute(
        """
        UPDATE MilkingSessions SET status = 'Aborted', end_time = NOW(),
               duration_seconds = TIMESTAMPDIFF(SECOND, start_time, NOW())
        WHERE device_id = %s AND status = 'Active'
        """,
        (device_id,),
    )
    sid = await execute(
        "INSERT INTO MilkingSessions (cow_id, rfid_tag, cow_name, device_id) VALUES (%s, %s, %s, %s)",
        (cow["cow_id"], rfid_tag, cow["cow_name"], device_id),
    )
    await manager.broadcast("milking_session", {
        "event": "started", "session_id": sid, "device_id": device_id,
        "cow_id": cow["cow_id"], "cow_name": cow["cow_name"],
    }, farm_id=farm_id)
    return sid


# ── RFID scan (both devices call this to resolve/refresh cow_id) ───────────
class RfidScanPayload(BaseModel):
    device_id: str
    rfid_tag: str


async def handle_rfid_scan(device_id: str, rfid_tag: str) -> dict:
    reg = await touch_device(device_id, "milking")
    role, farm_id = reg.get("role") or "milking", reg.get("farm_id")
    cow = await _resolve_cow(rfid_tag, farm_id)
    await execute(
        "INSERT INTO RfidScans (device_id, rfid_tag, cow_id, found) VALUES (%s, %s, %s, %s)",
        (device_id, rfid_tag, cow["cow_id"] if cow else None, 1 if cow else 0),
    )
    await manager.broadcast("rfid_scan", {
        "device_id": device_id, "rfid_tag": rfid_tag, "found": bool(cow),
        "cow_id": cow["cow_id"] if cow else None, "cow_name": cow["cow_name"] if cow else None,
    }, farm_id=farm_id)
    if not cow:
        return {"status": "success", "found": False, "cow_name": "Unknown",
                "message": f"RFID {rfid_tag} not registered"
                           + ("" if farm_id is not None else " (this device is not assigned to a farm yet)")}

    session_id = None
    if role == "milking":
        session_id = await start_session(device_id, cow, rfid_tag, farm_id)
    elif role == "collar":
        await execute("UPDATE IoTDevices SET cow_id = %s WHERE device_id = %s", (cow["cow_id"], device_id))

    return {
        "status": "success",
        "found": True,
        "cow_id": cow["cow_id"],
        "cow_name": cow["cow_name"],
        "breed": cow["breed"],
        "health_status": cow["health_status"],
        "lactating": cow["lactating"],
        "rfid_tag": rfid_tag,
        "session_id": session_id,
    }


@router.post("/rfid-scan")
async def rfid_scan(payload: RfidScanPayload):
    return await handle_rfid_scan(payload.device_id, payload.rfid_tag)


# ── ESP32 station: DS18B20 temp + TDS + ultrasonic distance ────────────────
class CollarPayload(BaseModel):
    device_id: str
    cow_id: Optional[int] = None
    temperature: Optional[float] = None
    tds_ppm: Optional[float] = None
    distance_cm: Optional[float] = None


async def _milking_station_reading(d: CollarPayload, farm_id) -> dict:
    s = await get_settings(farm_id)
    pct, litres = milk_level(
        d.distance_cm,
        as_float(s, "milk_container_empty_cm") or 18.0,
        as_float(s, "milk_container_full_cm") or 1.0,
        as_float(s, "milk_container_capacity_l") or 4.0,
    )
    sess = await active_session(d.device_id)
    session_id = sess["session_id"] if sess else None
    cow_id = sess["cow_id"] if sess else await _farm_cow(d.cow_id, farm_id)
    rid = await execute(
        """
        INSERT INTO MilkStationReadings
            (device_id, session_id, cow_id, distance_cm, level_pct, volume_l, tds_ppm, milk_temp_c)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (d.device_id, session_id, cow_id, d.distance_cm, pct, litres, d.tds_ppm, d.temperature),
    )
    if sess and litres is not None:
        await execute(
            "UPDATE MilkingSessions SET milk_liters=%s, tank_distance_cm=%s, tds_ppm=%s, milk_temp_c=%s WHERE session_id=%s",
            (litres, d.distance_cm, d.tds_ppm, d.temperature, session_id),
        )

    tds_min, tds_max = as_float(s, "milk_tds_min_ppm"), as_float(s, "milk_tds_max_ppm")
    if d.tds_ppm is not None and litres:
        if tds_min is not None and d.tds_ppm < tds_min:
            await log_alert("Milk", cow_id, "Warning",
                            f"Milk TDS {d.tds_ppm:.0f} ppm is below {tds_min:.0f} ppm: possible added water")
        elif tds_max is not None and d.tds_ppm > tds_max:
            await log_alert("Milk", cow_id, "Warning",
                            f"Milk TDS {d.tds_ppm:.0f} ppm is above {tds_max:.0f} ppm: check for contamination")

    await manager.broadcast("milk_level_live", {
        "device_id": d.device_id, "session_id": session_id, "cow_id": cow_id,
        "distance_cm": d.distance_cm, "level_pct": pct, "volume_l": litres,
        "tds_ppm": d.tds_ppm, "milk_temp_c": d.temperature,
    }, farm_id=farm_id)
    return {"status": "success", "reading_id": rid, "level_pct": pct, "volume_l": litres,
            "session_id": session_id, "config": await device_config("milking", farm_id)}


@router.post("/wearable-collar")
async def wearable_collar(payload: CollarPayload):
    d = payload
    reg = await touch_device(d.device_id, "milking")
    farm_id = reg.get("farm_id")
    if (reg.get("role") or "milking") == "milking":
        return await _milking_station_reading(d, farm_id)

    cow_id = await _farm_cow(d.cow_id, farm_id)
    temp_reading_id = None
    if d.temperature is not None and cow_id is not None:
        temp_reading_id = await _record_body_temperature(cow_id, d.temperature, farm_id)

    wq_reading_id = await execute(
        "INSERT INTO WaterQualityReadings (device_id, cow_id, tds_ppm, distance_cm) VALUES (%s, %s, %s, %s)",
        (d.device_id, cow_id, d.tds_ppm, d.distance_cm),
    )
    if d.tds_ppm is not None:
        if d.tds_ppm >= THRESH_TDS_CRIT:
            await log_alert("Water", cow_id, "Critical", f"CRITICAL water quality: TDS {d.tds_ppm} ppm", farm_id=farm_id)
        elif d.tds_ppm >= THRESH_TDS_WARN:
            await log_alert("Water", cow_id, "Warning", f"Water quality degraded: TDS {d.tds_ppm} ppm", farm_id=farm_id)

    await manager.broadcast("wearable_collar_live", {
        "device_id": d.device_id, "cow_id": cow_id, "temperature": d.temperature,
        "tds_ppm": d.tds_ppm, "distance_cm": d.distance_cm,
    }, farm_id=farm_id)
    return {"status": "success", "temp_reading_id": temp_reading_id, "wq_reading_id": wq_reading_id}


# ── Station button: "Record Milk" pressed on the device itself ─────────────
class StationRecordPayload(BaseModel):
    device_id: str


@router.post("/milking-record")
async def station_record(payload: StationRecordPayload):
    from routers.milking import finish_session   # local import: milking imports this module
    await touch_device(payload.device_id, "milking")
    return await finish_session(payload.device_id, None, None, "milking_station")


# ── ESP8266 Health Collar: DS18B20 temp + GPS + heart rate/SpO2 + motion ───
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


async def _check_geofence(cow_id: Optional[int], lat: float, lng: float, farm_id) -> Optional[float]:
    s = await get_settings(farm_id)
    c_lat, c_lng, radius = as_float(s, "geofence_lat"), as_float(s, "geofence_lng"), as_float(s, "geofence_radius_m")
    if None in (c_lat, c_lng, radius) or cow_id is None:
        return None
    dist = distance_m(c_lat, c_lng, lat, lng)
    if dist > radius:
        cow = await fetchone("SELECT cow_name FROM Cows WHERE cow_id = %s", (cow_id,))
        name = (cow or {}).get("cow_name") or f"Cow {cow_id}"
        await log_alert("Location", cow_id, "Critical",
                        f"{name} is outside the farm boundary ({dist:.0f} m from the centre, limit {radius:.0f} m)")
    return dist


@router.post("/wearable-vitals")
async def wearable_vitals(payload: VitalsPayload):
    d = payload
    reg = await touch_device(d.device_id, "collar")
    farm_id = reg.get("farm_id")
    reported = await _farm_cow(d.cow_id, farm_id)
    cow_id = reported if reported is not None else reg.get("cow_id")
    if reported is not None and reg.get("cow_id") != reported:
        await execute("UPDATE IoTDevices SET cow_id = %s WHERE device_id = %s", (reported, d.device_id))

    if d.temperature is not None and cow_id is not None:
        await _record_body_temperature(cow_id, d.temperature, farm_id)

    distance_from_centre = None
    if d.latitude is not None and d.longitude is not None:
        await execute(
            """
            INSERT INTO LocationReadings
                (device_id, cow_id, latitude, longitude, altitude_m, speed_kmph, satellites, hdop)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (d.device_id, cow_id, d.latitude, d.longitude, d.altitude_m, d.speed_kmph, d.satellites, d.hdop),
        )
        distance_from_centre = await _check_geofence(cow_id, d.latitude, d.longitude, farm_id)

    vitals_reading_id = None
    if d.heart_rate_bpm is not None or d.spo2_pct is not None or d.temperature is not None:
        vitals_reading_id = await execute(
            "INSERT INTO VitalsReadings (device_id, cow_id, heart_rate_bpm, spo2_pct, body_temp_c) VALUES (%s,%s,%s,%s,%s)",
            (d.device_id, cow_id, d.heart_rate_bpm, d.spo2_pct, d.temperature),
        )
        if d.heart_rate_bpm is not None and (d.heart_rate_bpm < THRESH_HR_LOW or d.heart_rate_bpm > THRESH_HR_HIGH):
            await log_alert("Health", cow_id, "Warning", f"Abnormal heart rate: {d.heart_rate_bpm} bpm")
        if d.spo2_pct is not None and d.spo2_pct < THRESH_SPO2_WARN:
            await log_alert("Health", cow_id, "Warning", f"Low SpO2: {d.spo2_pct}%")

    if any(v is not None for v in (d.accel_x_g, d.accel_y_g, d.accel_z_g)):
        await execute(
            """
            INSERT INTO MotionReadings
                (device_id, cow_id, accel_x_g, accel_y_g, accel_z_g, gyro_x_dps, gyro_y_dps, gyro_z_dps, is_moving)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (d.device_id, cow_id, d.accel_x_g, d.accel_y_g, d.accel_z_g,
             d.gyro_x_dps, d.gyro_y_dps, d.gyro_z_dps, 1 if d.is_moving else 0),
        )

    await manager.broadcast("wearable_vitals_live", {
        "device_id": d.device_id, "cow_id": cow_id, "temperature": d.temperature,
        "latitude": d.latitude, "longitude": d.longitude,
        "heart_rate_bpm": d.heart_rate_bpm, "spo2_pct": d.spo2_pct, "is_moving": d.is_moving,
        "recorded_at": datetime.now().isoformat(timespec="seconds"),
    }, farm_id=farm_id)
    return {"status": "success", "vitals_reading_id": vitals_reading_id, "cow_id": cow_id,
            "distance_from_centre_m": distance_from_centre}


# ── Read endpoints for the dashboard ────────────────────────────────────────
@router.get("/water-quality/latest")
async def latest_water_quality(cow_id: Optional[int] = None, user=Depends(require_any())):
    if cow_id is not None:
        await ensure_cow_access(user, cow_id)
        row = await fetchone(
            "SELECT * FROM WaterQualityReadings WHERE cow_id=%s ORDER BY recorded_at DESC LIMIT 1",
            (cow_id,),
        )
    else:
        where, args = cow_clause(user)
        row = await fetchone(f"SELECT * FROM WaterQualityReadings WHERE {where} ORDER BY recorded_at DESC LIMIT 1", args)
    return _safe(row)


@router.get("/water-quality/history")
async def water_quality_history(hours: int = 24, cow_id: Optional[int] = None, user=Depends(require_any())):
    """Readings over the last `hours`, or since the first reading when hours=0."""
    if cow_id is not None:
        await ensure_cow_access(user, cow_id)
        where, args = "cow_id = %s", (cow_id,)
    else:
        where, args = cow_clause(user)
    rows = await bucketed_series("WaterQualityReadings", "recorded_at", ["tds_ppm", "distance_cm"], [], where, args, hours)
    return [_safe(r) for r in rows]


async def _cow_readings(user: dict, table: str, cow_id: int, hours: int) -> list:
    """A cow's readings over the last `hours`, or all of them when hours=0."""
    await ensure_cow_access(user, cow_id)
    hours = period_hours(hours)
    cond, cargs = ("AND recorded_at >= DATE_SUB(NOW(), INTERVAL %s HOUR)", (hours,)) if hours else ("", ())
    rows = await fetchall(
        f"""
        SELECT * FROM {table}
        WHERE cow_id=%s {cond}
        ORDER BY recorded_at ASC
        LIMIT 20000
        """,
        (cow_id, *cargs),
    )
    return [_safe(r) for r in rows]


@router.get("/location/latest/{cow_id}")
async def latest_location(cow_id: int, user=Depends(require_any())):
    await ensure_cow_access(user, cow_id)
    row = await fetchone(
        "SELECT * FROM LocationReadings WHERE cow_id=%s ORDER BY recorded_at DESC LIMIT 1",
        (cow_id,),
    )
    return _safe(row)


@router.get("/location/history/{cow_id}")
async def location_history(cow_id: int, hours: int = 24, user=Depends(require_any())):
    return await _cow_readings(user, "LocationReadings", cow_id, hours)


@router.get("/vitals/history/{cow_id}")
async def vitals_history(cow_id: int, hours: int = 24, user=Depends(require_any())):
    return await _cow_readings(user, "VitalsReadings", cow_id, hours)


@router.get("/motion/history/{cow_id}")
async def motion_history(cow_id: int, hours: int = 24, user=Depends(require_any())):
    return await _cow_readings(user, "MotionReadings", cow_id, hours)
