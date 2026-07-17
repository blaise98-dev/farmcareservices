import aiomysql
from contextlib import asynccontextmanager
from config import settings

_pool: aiomysql.Pool | None = None


async def get_pool() -> aiomysql.Pool:
    global _pool
    if _pool is None:
        _pool = await aiomysql.create_pool(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            db=settings.DB_NAME,
            autocommit=True,
            minsize=1,
            maxsize=10,
            charset="utf8mb4",
            connect_timeout=10,
        )
    return _pool


async def log_remote_connection() -> None:
    """Confirm writes go to the remote MySQL server (via SSH tunnel)."""
    row = await fetchone(
        "SELECT @@hostname AS hostname, DATABASE() AS db_name, @@port AS port"
    )
    if not row:
        return
    print(
        f"Remote MySQL ready — server={row['hostname']} "
        f"database={row['db_name']} "
        f"(tunnel localhost:{settings.DB_PORT} → {settings.DB_REMOTE_HOST})"
    )


async def close_pool():
    global _pool
    if _pool:
        _pool.close()
        await _pool.wait_closed()
        _pool = None


@asynccontextmanager
async def get_db():
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            yield cursor


async def fetchall(sql: str, args=None):
    async with get_db() as cur:
        await cur.execute(sql, args)
        return await cur.fetchall()


async def fetchone(sql: str, args=None):
    async with get_db() as cur:
        await cur.execute(sql, args)
        return await cur.fetchone()


async def execute(sql: str, args=None):
    async with get_db() as cur:
        await cur.execute(sql, args)
        return cur.lastrowid


async def ensure_sensor_readings_table() -> None:
    """Create SensorReadings table if it does not exist (populated by ESP32 ingest)."""
    await execute(
        """
        CREATE TABLE IF NOT EXISTS SensorReadings (
            reading_id    INT AUTO_INCREMENT PRIMARY KEY,
            device_id     VARCHAR(50) NOT NULL DEFAULT 'esp32_main',
            temperature   FLOAT NULL,
            humidity      FLOAT NULL,
            mq5_pct       INT NULL,
            mq135_pct     INT NULL,
            flow_rate     FLOAT NULL,
            total_liters  FLOAT NULL,
            tank_level    FLOAT NULL,
            feed_weight   FLOAT NULL,
            pump_status   TINYINT(1) NOT NULL DEFAULT 0,
            fan_status    TINYINT(1) NOT NULL DEFAULT 0,
            spray_status  TINYINT(1) NOT NULL DEFAULT 0,
            buzzer_status TINYINT(1) NOT NULL DEFAULT 0,
            recorded_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_sr_time (device_id, recorded_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )


async def ensure_wearable_tables() -> None:
    """Create tables backing the RFID collar (ESP32) and vitals tag (ESP8266) wearables."""
    await execute(
        """
        CREATE TABLE IF NOT EXISTS RfidScans (
            scan_id     INT AUTO_INCREMENT PRIMARY KEY,
            device_id   VARCHAR(50) NOT NULL,
            rfid_tag    VARCHAR(50) NOT NULL,
            cow_id      INT NULL,
            found       TINYINT(1) NOT NULL DEFAULT 0,
            scanned_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_rs_device (device_id, scanned_at),
            INDEX idx_rs_cow (cow_id, scanned_at),
            CONSTRAINT fk_rs_cow FOREIGN KEY (cow_id) REFERENCES Cows(cow_id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    await execute(
        """
        CREATE TABLE IF NOT EXISTS WaterQualityReadings (
            reading_id   INT AUTO_INCREMENT PRIMARY KEY,
            device_id    VARCHAR(50) NOT NULL,
            cow_id       INT NULL,
            tds_ppm      FLOAT NULL,
            distance_cm  FLOAT NULL,
            recorded_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_wq_device (device_id, recorded_at),
            INDEX idx_wq_cow (cow_id, recorded_at),
            CONSTRAINT fk_wq_cow FOREIGN KEY (cow_id) REFERENCES Cows(cow_id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    await execute(
        """
        CREATE TABLE IF NOT EXISTS LocationReadings (
            reading_id   INT AUTO_INCREMENT PRIMARY KEY,
            device_id    VARCHAR(50) NOT NULL,
            cow_id       INT NULL,
            latitude     DOUBLE NULL,
            longitude    DOUBLE NULL,
            altitude_m   FLOAT NULL,
            speed_kmph   FLOAT NULL,
            satellites   INT NULL,
            hdop         FLOAT NULL,
            recorded_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_loc_device (device_id, recorded_at),
            INDEX idx_loc_cow (cow_id, recorded_at),
            CONSTRAINT fk_loc_cow FOREIGN KEY (cow_id) REFERENCES Cows(cow_id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    await execute(
        """
        CREATE TABLE IF NOT EXISTS VitalsReadings (
            reading_id     INT AUTO_INCREMENT PRIMARY KEY,
            device_id      VARCHAR(50) NOT NULL,
            cow_id         INT NULL,
            heart_rate_bpm FLOAT NULL,
            spo2_pct       FLOAT NULL,
            body_temp_c    FLOAT NULL,
            recorded_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_vit_device (device_id, recorded_at),
            INDEX idx_vit_cow (cow_id, recorded_at),
            CONSTRAINT fk_vit_cow FOREIGN KEY (cow_id) REFERENCES Cows(cow_id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    await execute(
        """
        CREATE TABLE IF NOT EXISTS MotionReadings (
            reading_id   INT AUTO_INCREMENT PRIMARY KEY,
            device_id    VARCHAR(50) NOT NULL,
            cow_id       INT NULL,
            accel_x_g    FLOAT NULL,
            accel_y_g    FLOAT NULL,
            accel_z_g    FLOAT NULL,
            gyro_x_dps   FLOAT NULL,
            gyro_y_dps   FLOAT NULL,
            gyro_z_dps   FLOAT NULL,
            is_moving    TINYINT(1) NOT NULL DEFAULT 0,
            recorded_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_mot_device (device_id, recorded_at),
            INDEX idx_mot_cow (cow_id, recorded_at),
            CONSTRAINT fk_mot_cow FOREIGN KEY (cow_id) REFERENCES Cows(cow_id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )


async def ensure_password_reset_table() -> None:
    """Create PasswordResetTokens table if it does not exist."""
    await execute(
        """
        CREATE TABLE IF NOT EXISTS PasswordResetTokens (
            token_id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            token_hash VARCHAR(64) NOT NULL,
            expires_at DATETIME NOT NULL,
            used_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_token_hash (token_hash),
            INDEX idx_user_id (user_id),
            CONSTRAINT fk_prt_user FOREIGN KEY (user_id)
                REFERENCES Users(user_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
