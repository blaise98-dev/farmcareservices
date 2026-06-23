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
