"""
ESP32 sensor ingest endpoint: no authentication required.
The ESP32 POSTs JSON to POST /api/iot/ingest every 10 seconds.

Mirrors all logic from api.php handleSensorData() + alert/control logging,
writing into the same tables the dashboard already reads.
"""
from fastapi import APIRouter
from pydantic import BaseModel, field_validator
from alerting import log_alert as _log_alert
from database import execute, fetchall, fetchone
from farm_config import as_float, device_config, get_settings, touch_device
from ws_manager import manager

router = APIRouter(prefix="/api/iot", tags=["iot_ingest"])

# ── Thresholds (mirror api.php constants) ────────────────────────────────────
THRESH_TEMP_WARN  = 28.0
THRESH_TEMP_FAN   = 30.0
THRESH_TEMP_CRIT  = 32.0
THRESH_TANK_FULL  = 90.0
THRESH_TANK_CRIT  = 20.0
THRESH_FEED_EMPTY = 0.5
THRESH_GAS_WARN   = 60.0
THRESH_GAS_CRIT   = 80.0
MQ135_PPM_MIN     = 300.0
MQ135_PPM_MAX     = 1200.0


class SensorPayload(BaseModel):
    device_id:     str   = "esp32_main"
    temperature:   float = 0.0
    humidity:      float = 0.0
    mq5_pct:       int   = 0
    mq135_pct:     int   = 0
    flow_rate:     float = 0.0
    total_liters:  float = 0.0
    tank_level:    float = 0.0
    feed_weight:   float = 0.0
    pump_status:   int   = 0
    fan_status:    int   = 0
    spray_status:  int   = 0
    buzzer_status: int   = 0

    @field_validator("tank_level")
    @classmethod
    def clamp_tank(cls, v):
        return max(v, 0.0)   # ESP32 returns -1 on ultrasonic timeout


def _mq135_to_ppm(pct: int) -> float:
    return round(MQ135_PPM_MIN + (pct / 100.0) * (MQ135_PPM_MAX - MQ135_PPM_MIN), 2)


async def _log_control(farm_id, device_type: str, action: str, value, reason: str):
    # Only log when state changes (same logic as api.php), per farm
    last = await fetchone(
        "SELECT action FROM SystemControlLogs WHERE device_type = %s AND farm_id <=> %s ORDER BY recorded_at DESC LIMIT 1",
        (device_type, farm_id),
    )
    if last and last["action"] == action:
        return
    try:
        await execute(
            "INSERT INTO SystemControlLogs (device_type, action, value, trigger_reason, farm_id) VALUES (%s, %s, %s, %s, %s)",
            (device_type, action, value, reason, farm_id),
        )
    except Exception:  # noqa: BLE001 - e.g. an older ENUM without 'Buzzer' must not break ingest
        pass


@router.post("/ingest")
async def ingest(payload: SensorPayload):
    """
    Receives sensor data from the ESP32 and writes it to the remote database.
    Replace SERVER_URL in the Arduino sketch with:
        https://farmcareservices.com/api/iot/ingest
    """
    d = payload
    farm_id = (await touch_device(d.device_id, "barn")).get("farm_id")
    cfg = await get_settings(farm_id)
    fan_on_c = as_float(cfg, "barn_fan_on_c") or THRESH_TEMP_FAN
    tank_full = as_float(cfg, "tank_stop_pct") or THRESH_TANK_FULL
    feed_low = as_float(cfg, "feed_low_kg") or THRESH_FEED_EMPTY
    air_ppm = _mq135_to_ppm(d.mq135_pct)
    alert_triggered = (
        d.temperature >= THRESH_TEMP_WARN or
        d.mq135_pct   >= THRESH_GAS_WARN  or
        d.mq5_pct     >= THRESH_GAS_WARN
    )

    # ── EnvironmentalReadings (existing table: keeps dashboard working) ───────
    env_id = await execute(
        """
        INSERT INTO EnvironmentalReadings
            (temperature_celsius, humidity_percent, air_quality_ppm, oxygen_percent, alert_triggered, farm_id)
        VALUES (%s, %s, %s, NULL, %s, %s)
        """,
        (d.temperature, d.humidity, air_ppm, 1 if alert_triggered else 0, farm_id),
    )

    # ── SensorReadings (full IoT snapshot) ────────────────────────────────────
    await execute(
        """
        INSERT INTO SensorReadings
            (device_id, temperature, humidity, mq5_pct, mq135_pct,
             flow_rate, total_liters, tank_level, feed_weight,
             pump_status, fan_status, spray_status, buzzer_status)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (
            d.device_id, d.temperature, d.humidity,
            d.mq5_pct, d.mq135_pct,
            d.flow_rate, d.total_liters, d.tank_level, d.feed_weight,
            d.pump_status, d.fan_status, d.spray_status, d.buzzer_status,
        ),
    )

    # ── Actuator state logging ─────────────────────────────────────────────────
    await _log_control(
        farm_id, "Fan", "ON" if d.fan_status else "OFF", None,
        f"Temp {d.temperature}°C ≥ {fan_on_c}°C" if d.fan_status else f"Temp normalized to {d.temperature}°C",
    )
    await _log_control(
        farm_id, "SprayNozzle", "ON" if d.spray_status else "OFF", None,
        f"Cooling spray ON at {d.temperature}°C" if d.spray_status else "Spray OFF",
    )
    await _log_control(
        farm_id, "WaterPump", "ON" if d.pump_status else "OFF", d.tank_level,
        f"Tank at {d.tank_level}%, pumping" if d.pump_status else f"Tank at {d.tank_level}%, pump stopped",
    )
    await _log_control(
        farm_id, "Buzzer", "ON" if d.buzzer_status else "OFF", None,
        f"Warning beep at {d.temperature}°C" if d.buzzer_status else "Buzzer silent",
    )

    # ── Alert generation ──────────────────────────────────────────────────────
    if d.temperature >= THRESH_TEMP_CRIT:
        await _log_alert("Temperature", None, "Critical",
                         f"CRITICAL: Barn temp {d.temperature}°C, cooling active", farm_id=farm_id)
    elif d.temperature >= THRESH_TEMP_WARN:
        await _log_alert("Temperature", None, "Warning",
                         f"Barn temp elevated: {d.temperature}°C", farm_id=farm_id)

    if d.mq135_pct >= THRESH_GAS_CRIT:
        await _log_alert("Air Quality", None, "Critical",
                         f"CRITICAL: Air quality {d.mq135_pct}% (~{air_ppm} PPM)", farm_id=farm_id)
    elif d.mq135_pct >= THRESH_GAS_WARN:
        await _log_alert("Air Quality", None, "Warning",
                         f"Air quality degraded: {d.mq135_pct}% (~{air_ppm} PPM)", farm_id=farm_id)

    if d.mq5_pct >= THRESH_GAS_CRIT:
        await _log_alert("Air Quality", None, "Critical",
                         f"CRITICAL: MQ5 {d.mq5_pct}%, possible gas leak", farm_id=farm_id)
    elif d.mq5_pct >= THRESH_GAS_WARN:
        await _log_alert("Air Quality", None, "Warning",
                         f"MQ5 elevated: {d.mq5_pct}%", farm_id=farm_id)

    if d.tank_level >= tank_full:
        await _log_alert("Water", None, "Info", f"Tank full at {d.tank_level}%, pump stopped", farm_id=farm_id)
    elif 0 < d.tank_level <= THRESH_TANK_CRIT:
        await _log_alert("Water", None, "Warning", f"Tank critically low: {d.tank_level}%", farm_id=farm_id)

    if d.feed_weight < feed_low:
        await _log_alert("Feed", None, "Warning", f"Feed hopper empty: {d.feed_weight} kg", farm_id=farm_id)

    # ── Broadcast live update to dashboard WebSocket clients ─────────────────
    await manager.broadcast("env_live", {
        "temperature":   d.temperature,
        "humidity":      d.humidity,
        "air_quality_ppm": air_ppm,
        "tank_level":    d.tank_level,
        "feed_weight":   d.feed_weight,
        "mq5_pct":       d.mq5_pct,
        "mq135_pct":     d.mq135_pct,
        "buzzer_status": d.buzzer_status,
        "pump_status":   d.pump_status,
        "fan_status":    d.fan_status,
        "spray_status":  d.spray_status,
        "alert_triggered": alert_triggered,
    }, farm_id=farm_id)

    # ── Hand the device its settings and any queued manual commands ──────────
    pending = await fetchall(
        """
        SELECT command_id, command_type, command_value FROM DeviceCommands
        WHERE device_id = %s AND is_executed = FALSE AND created_at > NOW() - INTERVAL 1 HOUR
        ORDER BY created_at ASC
        """,
        (d.device_id,),
    )
    if pending:
        ids = [c["command_id"] for c in pending]
        await execute(
            f"UPDATE DeviceCommands SET is_executed = TRUE, executed_at = NOW() WHERE command_id IN ({','.join(['%s'] * len(ids))})",
            tuple(ids),
        )

    return {
        "status":          "success",
        "env_reading_id":  env_id,
        "air_quality_ppm": air_ppm,
        "alert_triggered": alert_triggered,
        "config":          await device_config("barn", farm_id),
        "commands":        [{"type": c["command_type"], "value": c["command_value"]} for c in pending],
    }
