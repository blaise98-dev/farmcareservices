"""
Field configuration shared by the IoT routers.

- FarmSettings: key/value settings the web dashboard can change (milk container
  calibration, water-tank thresholds, temperature rules, farm boundary), stored
  per farm. Rows with farm_id 0 are shared defaults. Devices receive their
  farm's values in the response to their regular 10 s post.
- IoTDevices: registry of physical devices and their role (milking, barn,
  collar). The role decides how a device's readings are interpreted: the same
  ESP32 sketch posts "distance_cm", which is milk depth on a Milking Station.
- MilkStationReadings, MilkingSessions, DeviceCommands: tables behind the
  Milking page and remote device control.
"""
import time
from typing import Optional

from database import execute, fetchall, fetchone

# ── Defaults ──────────────────────────────────────────────────────────────────
# Milk container: calibrated from the field demo (Kanyinya, Aug 2026). The
# ultrasonic sensor on the rim of the 4 L container read 16.5 cm at 9% and
# 2.6 cm at 91%, which puts "empty" at about 18 cm and "full" at about 1 cm.
DEFAULT_SETTINGS = {
    "milk_container_capacity_l": "4.0",
    "milk_container_empty_cm":   "18.0",
    "milk_container_full_cm":    "1.0",
    "milk_tds_min_ppm":          "",      # blank = no milk TDS alert
    "milk_tds_max_ppm":          "",
    "tank_stop_pct":             "90",
    "tank_start_pct":            "70",
    "barn_fan_on_c":             "30",
    "barn_buzzer_on_c":          "28",
    "feed_low_kg":               "0.5",
    "cow_hypothermia_c":         "37.0",
    "cow_temp_high_c":           "39.0",
    "cow_fever_c":               "39.5",
    "geofence_lat":              "",      # blank = no boundary alert
    "geofence_lng":              "",
    "geofence_radius_m":         "",
}

# Settings each device role receives in its post response.
DEVICE_CONFIG_KEYS = {
    "barn":    ["tank_stop_pct", "tank_start_pct", "barn_fan_on_c", "barn_buzzer_on_c"],
    "milking": ["milk_container_capacity_l", "milk_container_empty_cm", "milk_container_full_cm"],
    "collar":  [],
}

# Devices known from the field demo. Admins can change roles and labels later.
DEFAULT_DEVICES = [
    ("esp32_main",       "barn",    "Barn Monitor"),
    ("esp32_collar_1",   "milking", "Milking Station"),
    ("esp8266_vitals_1", "collar",  "Health Collar"),
]

ROLES = ("milking", "barn", "collar")
ONLINE_SECONDS = 60          # a device is "online" if it posted in the last minute

_cache: dict = {}            # farm_id -> (monotonic time, values)
_CACHE_TTL = 10.0
SHARED = 0                   # FarmSettings.farm_id for defaults every farm inherits


# ── Schema ────────────────────────────────────────────────────────────────────
async def ensure_field_tables() -> None:
    await execute(
        """
        CREATE TABLE IF NOT EXISTS FarmSettings (
            farm_id       INT NOT NULL DEFAULT 0,
            setting_key   VARCHAR(64) NOT NULL,
            setting_value VARCHAR(255) NOT NULL DEFAULT '',
            updated_by    VARCHAR(100) NULL,
            updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (farm_id, setting_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    # Settings saved before farms existed become the shared defaults.
    if "farm_id" not in {c["Field"] for c in await fetchall("SHOW COLUMNS FROM FarmSettings")}:
        await execute(
            "ALTER TABLE FarmSettings ADD COLUMN farm_id INT NOT NULL DEFAULT 0 FIRST, "
            "DROP PRIMARY KEY, ADD PRIMARY KEY (farm_id, setting_key)"
        )
    await execute(
        """
        CREATE TABLE IF NOT EXISTS IoTDevices (
            device_id   VARCHAR(50) PRIMARY KEY,
            role        ENUM('milking','barn','collar') NOT NULL,
            label       VARCHAR(100) NULL,
            cow_id      INT NULL,
            last_seen   DATETIME NULL,
            created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_iotdev_cow FOREIGN KEY (cow_id) REFERENCES Cows(cow_id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    await execute(
        """
        CREATE TABLE IF NOT EXISTS MilkStationReadings (
            reading_id   INT AUTO_INCREMENT PRIMARY KEY,
            device_id    VARCHAR(50) NOT NULL,
            session_id   INT NULL,
            cow_id       INT NULL,
            distance_cm  FLOAT NULL,
            level_pct    FLOAT NULL,
            volume_l     FLOAT NULL,
            tds_ppm      FLOAT NULL,
            milk_temp_c  FLOAT NULL,
            recorded_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_msr_device (device_id, recorded_at),
            INDEX idx_msr_session (session_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    # Same shape the earlier PHP API created, so existing rows stay readable.
    await execute(
        """
        CREATE TABLE IF NOT EXISTS MilkingSessions (
            session_id       INT AUTO_INCREMENT PRIMARY KEY,
            cow_id           INT NULL,
            rfid_tag         VARCHAR(50) NULL,
            cow_name         VARCHAR(100) NULL,
            device_id        VARCHAR(50) NOT NULL DEFAULT 'trs_node',
            start_time       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            end_time         DATETIME NULL,
            duration_seconds INT NULL,
            milk_liters      FLOAT NOT NULL DEFAULT 0,
            tank_distance_cm FLOAT NULL,
            status ENUM('Active','Complete','Aborted') NOT NULL DEFAULT 'Active',
            INDEX idx_ms_status (status),
            INDEX idx_ms_cow    (cow_id, start_time)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    cols = {c["Field"] for c in await fetchall("SHOW COLUMNS FROM MilkingSessions")}
    for name, ddl in (
        ("milk_record_id", "INT NULL"),
        ("tds_ppm", "FLOAT NULL"),
        ("milk_temp_c", "FLOAT NULL"),
        ("recorded_by", "VARCHAR(100) NULL"),
    ):
        if name not in cols:
            await execute(f"ALTER TABLE MilkingSessions ADD COLUMN {name} {ddl}")

    await execute(
        """
        CREATE TABLE IF NOT EXISTS DeviceCommands (
            command_id    INT AUTO_INCREMENT PRIMARY KEY,
            device_id     VARCHAR(50) NOT NULL DEFAULT 'esp32_main',
            command_type  ENUM('pump','fan','spray','buzzer') NOT NULL,
            command_value ENUM('ON','OFF','AUTO') NOT NULL,
            is_executed   BOOLEAN NOT NULL DEFAULT FALSE,
            executed_at   DATETIME NULL,
            created_by    VARCHAR(100) NOT NULL DEFAULT 'web_dashboard',
            created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_dc_pending (device_id, is_executed, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )

    # SMS tables: created by an earlier SQL migration on the live server; make
    # sure a fresh install has them with the columns the SMS Config page reads.
    await execute(
        """
        CREATE TABLE IF NOT EXISTS SmsSubscribers (
            subscriber_id INT AUTO_INCREMENT PRIMARY KEY,
            phone_number  VARCHAR(20) NOT NULL UNIQUE,
            full_name     VARCHAR(100) NULL,
            min_severity  VARCHAR(20) NOT NULL DEFAULT 'Critical',
            alert_types   VARCHAR(255) NOT NULL DEFAULT 'All',
            is_active     BOOLEAN NOT NULL DEFAULT TRUE,
            added_by      VARCHAR(100) NULL,
            created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    await execute(
        """
        CREATE TABLE IF NOT EXISTS SmsLogs (
            sms_id          INT AUTO_INCREMENT PRIMARY KEY,
            alert_id        INT NULL,
            recipient_phone VARCHAR(20) NOT NULL,
            message_content TEXT NOT NULL,
            status          VARCHAR(20) NOT NULL DEFAULT 'Pending',
            created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_sms_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )

    for device_id, role, label in DEFAULT_DEVICES:
        await execute(
            "INSERT IGNORE INTO IoTDevices (device_id, role, label) VALUES (%s, %s, %s)",
            (device_id, role, label),
        )


# ── Settings ──────────────────────────────────────────────────────────────────
async def get_settings(farm_id: Optional[int], fresh: bool = False) -> dict:
    """A farm's settings as strings: built-in defaults, then shared, then the farm's own. Cached for 10 s."""
    key = farm_id or SHARED
    now = time.monotonic()
    hit = _cache.get(key)
    if not fresh and hit and now - hit[0] < _CACHE_TTL:
        return dict(hit[1])
    rows = await fetchall(
        "SELECT farm_id, setting_key, setting_value FROM FarmSettings WHERE farm_id IN (%s, %s) ORDER BY farm_id",
        (SHARED, key),
    )
    values = dict(DEFAULT_SETTINGS)
    for r in rows:   # shared rows first, so the farm's own value wins
        if r["setting_key"] in values:
            values[r["setting_key"]] = r["setting_value"] or ""
    _cache[key] = (now, values)
    return dict(values)


def as_float(values: dict, key: str) -> Optional[float]:
    raw = (values.get(key) or "").strip()
    if raw == "":
        return None
    try:
        return float(raw)
    except ValueError:
        return None


async def save_settings(farm_id: int, changes: dict, username: str) -> dict:
    for key, value in changes.items():
        if key not in DEFAULT_SETTINGS:
            continue
        await execute(
            """
            INSERT INTO FarmSettings (farm_id, setting_key, setting_value, updated_by)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)
            """,
            (farm_id, key, "" if value is None else str(value), username),
        )
    _cache.clear()
    return await get_settings(farm_id, fresh=True)


async def device_config(role: str, farm_id: Optional[int]) -> dict:
    values = await get_settings(farm_id)
    return {k: as_float(values, k) for k in DEVICE_CONFIG_KEYS.get(role, [])}


# ── Device registry ───────────────────────────────────────────────────────────
async def touch_device(device_id: str, default_role: str) -> dict:
    """Mark a device as seen and return its registry row (creating it if new)."""
    await execute(
        """
        INSERT INTO IoTDevices (device_id, role, last_seen) VALUES (%s, %s, NOW())
        ON DUPLICATE KEY UPDATE last_seen = NOW()
        """,
        (device_id, default_role),
    )
    return await fetchone("SELECT * FROM IoTDevices WHERE device_id = %s", (device_id,))


async def device_role(device_id: str, default_role: str) -> str:
    row = await touch_device(device_id, default_role)
    return (row or {}).get("role") or default_role


async def db_now():
    """The database clock. Device timestamps are written with NOW(), so ages and
    "today" must be measured on the same clock as the app server's may differ."""
    row = await fetchone("SELECT NOW() AS now")
    return row["now"]


def seconds_since(now, then) -> Optional[float]:
    return (now - then).total_seconds() if (now and then) else None


# ── Pure helpers (unit-tested) ────────────────────────────────────────────────
def milk_level(distance_cm: Optional[float], empty_cm: float, full_cm: float, capacity_l: float):
    """Convert the rim sensor's distance to (level %, litres). Linear between calibrated points."""
    if distance_cm is None or distance_cm < 0 or empty_cm <= full_cm:
        return None, None
    pct = (empty_cm - distance_cm) / (empty_cm - full_cm) * 100.0
    pct = max(0.0, min(100.0, pct))
    return round(pct, 1), round(capacity_l * pct / 100.0, 3)


def milking_session_name(hour: int) -> str:
    """Map the hour of day to the MilkProductionRecords session enum."""
    if hour < 11:
        return "Morning"
    if hour < 15:
        return "Midday"
    return "Evening"
