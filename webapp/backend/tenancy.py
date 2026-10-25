"""
Farm tenancy for FarmCare.

Every user, cow and field device belongs to a farm. An Admin sees every farm;
any other user sees only the farm they are assigned to, and a user with no
farm yet sees nothing until an Admin assigns one.

Tables fall into three groups:
  * farm tables carry their own farm_id column (FARM_TABLES)
  * cow tables are scoped through cow_id -> Cows.farm_id
  * device tables are scoped through device_id -> IoTDevices.farm_id

Admins choose which farm they are looking at with the X-Farm-Id request
header (the farm picker in the app header). Without it they see every farm.

Router usage:
    where, args = farm_clause(user, "c.farm_id")
    rows = await fetchall(f"SELECT ... FROM Cows c WHERE {where} AND ...", (*args, ...))
"""

import logging
from contextvars import ContextVar
from typing import Optional

from fastapi import HTTPException

from database import execute, fetchall, fetchone

log = logging.getLogger(__name__)

ADMIN = "Admin"
PILOT_FARM_NAME = "Kanyinya Pilot Farm"
PILOT_FARM_LOCATION = "Kanyinya, Nyarugenge, Kigali"

# Tables that hold a farm_id of their own. Created on startup when missing.
FARM_TABLES = (
    "Users", "Cows", "IoTDevices", "Alerts", "AnimalGroups", "Tanks",
    "FeedInventory", "WeeklyPlan", "Components", "SmsSubscribers", "SmsLogs",
    "EnvironmentalReadings", "SystemControlLogs", "DeviceCommands",
    "PredictionsAnalytics",
)


# The farm an Admin picked for this request (X-Farm-Id), set by FarmHeaderMiddleware.
_admin_farm: ContextVar[Optional[int]] = ContextVar("admin_farm", default=None)


class FarmHeaderMiddleware:
    """Pure ASGI middleware: read X-Farm-Id into a context variable for the request."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            raw = dict(scope.get("headers") or []).get(b"x-farm-id", b"").decode().strip()
            token = _admin_farm.set(int(raw) if raw.isdigit() else None)
            try:
                await self.app(scope, receive, send)
            finally:
                _admin_farm.reset(token)
            return
        await self.app(scope, receive, send)


# ── Schema ────────────────────────────────────────────────────────────────────
async def _table_exists(name: str) -> bool:
    row = await fetchone(
        "SELECT COUNT(*) AS n FROM information_schema.tables "
        "WHERE table_schema = DATABASE() AND table_name = %s",
        (name,),
    )
    return bool(row and row["n"])


async def column_exists(table: str, column: str) -> bool:
    row = await fetchone(
        "SELECT COUNT(*) AS n FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = %s AND column_name = %s",
        (table, column),
    )
    return bool(row and row["n"])


async def _ensure_farm_table() -> None:
    if not await _table_exists("Farm"):
        await execute(
            """
            CREATE TABLE Farm (
                farm_id             INT AUTO_INCREMENT PRIMARY KEY,
                farm_name           VARCHAR(150) NOT NULL,
                location            VARCHAR(255) NULL,
                established_year    INT NULL,
                total_area_hectares FLOAT NULL,
                created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        return
    if not await column_exists("Farm", "farm_id"):
        # An older Farm table keyed by another column: give it a farm_id too.
        pk = await fetchone(
            "SELECT column_name AS col FROM information_schema.key_column_usage "
            "WHERE table_schema = DATABASE() AND table_name = 'Farm' AND constraint_name = 'PRIMARY'"
        )
        if pk:
            await execute("ALTER TABLE Farm ADD COLUMN farm_id INT NULL UNIQUE FIRST")
            await execute(f"UPDATE Farm SET farm_id = `{pk['col']}`")
        else:
            await execute("ALTER TABLE Farm ADD COLUMN farm_id INT AUTO_INCREMENT PRIMARY KEY FIRST")
    # Older Farm tables lack the optional details the Farms card edits
    for name, ddl in (("location", "VARCHAR(255) NULL"), ("established_year", "INT NULL"), ("total_area_hectares", "FLOAT NULL")):
        if not await column_exists("Farm", name):
            try:
                await execute(f"ALTER TABLE Farm ADD COLUMN {name} {ddl}")
            except Exception:  # noqa: BLE001 - optional detail; the farms API copes without it
                log.exception("tenancy: could not add Farm.%s", name)


async def pilot_farm_id() -> int:
    """The first farm; created as the Kanyinya pilot farm when there is none."""
    row = await fetchone("SELECT MIN(farm_id) AS id FROM Farm")
    if row and row["id"] is not None:
        return int(row["id"])
    await execute(
        "INSERT INTO Farm (farm_id, farm_name, location) VALUES (1, %s, %s)",
        (PILOT_FARM_NAME, PILOT_FARM_LOCATION),
    )
    return 1


async def ensure_farm_tenancy() -> None:
    """Add farm_id everywhere it is needed and move existing data into the pilot farm.

    Existing rows are backfilled only in the run that adds the column, so users
    and devices that arrive later stay unassigned until an Admin places them.
    """
    await _ensure_farm_table()
    pilot = await pilot_farm_id()
    for table in FARM_TABLES:
        if not await _table_exists(table) or await column_exists(table, "farm_id"):
            continue
        try:
            await execute(f"ALTER TABLE {table} ADD COLUMN farm_id INT NULL, ADD INDEX idx_{table.lower()}_farm (farm_id)")
            await execute(f"UPDATE {table} SET farm_id = %s WHERE farm_id IS NULL", (pilot,))
            log.info("tenancy: added farm_id to %s and assigned existing rows to farm %s", table, pilot)
        except Exception:  # noqa: BLE001 - one table must not stop the others
            log.exception("tenancy: could not add farm_id to %s", table)


# ── Who sees what ─────────────────────────────────────────────────────────────
def is_admin(user: dict) -> bool:
    return user.get("role") == ADMIN


def user_farm(user: dict):
    fid = user.get("farm_id")
    return int(fid) if fid is not None else None


def _visible_farm(user: dict):
    """(everything?, farm_id): Admins see all farms unless they picked one."""
    if is_admin(user):
        picked = _admin_farm.get()
        return picked is None, picked
    return False, user_farm(user)


def farm_clause(user: dict, column: str = "farm_id"):
    """SQL condition limiting `column` (a farm_id) to what the user may see."""
    everything, fid = _visible_farm(user)
    if everything:
        return "1=1", ()
    if fid is None:
        return "1=0", ()
    return f"{column} = %s", (fid,)


def cow_clause(user: dict, column: str = "cow_id"):
    """SQL condition limiting a cow_id column to the user's farm."""
    everything, fid = _visible_farm(user)
    if everything:
        return "1=1", ()
    if fid is None:
        return "1=0", ()
    return f"{column} IN (SELECT cow_id FROM Cows WHERE farm_id = %s)", (fid,)


def device_clause(user: dict, column: str = "device_id"):
    """SQL condition limiting a device_id column to the user's farm."""
    everything, fid = _visible_farm(user)
    if everything:
        return "1=1", ()
    if fid is None:
        return "1=0", ()
    return f"{column} IN (SELECT device_id FROM IoTDevices WHERE farm_id = %s)", (fid,)


async def ensure_cow_access(user: dict, cow_id) -> dict:
    """Return the cow row, or 404 when it does not exist or is on another farm."""
    where, args = farm_clause(user)
    cow = await fetchone(f"SELECT * FROM Cows WHERE cow_id = %s AND {where}", (cow_id, *args))
    if not cow:
        raise HTTPException(status_code=404, detail="Cow not found")
    return cow


async def ensure_row_access(user: dict, table: str, key: str, value, column: str = "farm_id") -> dict:
    """Return a row of a farm table, or 404 when it is not visible to the user."""
    where, args = farm_clause(user, column)
    row = await fetchone(f"SELECT * FROM {table} WHERE {key} = %s AND {where}", (value, *args))
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return row


async def farm_for_write(user: dict, requested=None) -> int:
    """The farm a new record belongs to.

    Non-admins always write to their own farm. An Admin names the farm (in the
    request or with the header farm picker); with a single farm it is implied.
    """
    if not is_admin(user):
        fid = user_farm(user)
        if fid is None:
            raise HTTPException(status_code=403, detail="Your account is not assigned to a farm yet. Ask an administrator.")
        return fid
    if requested is None:
        requested = _admin_farm.get()
    if requested is not None:
        if not await fetchone("SELECT farm_id FROM Farm WHERE farm_id = %s", (requested,)):
            raise HTTPException(status_code=400, detail="Unknown farm")
        return int(requested)
    farms = await fetchall("SELECT farm_id FROM Farm ORDER BY farm_id LIMIT 2")
    if len(farms) == 1:
        return int(farms[0]["farm_id"])
    raise HTTPException(status_code=400, detail="Choose the farm this record belongs to (farm_id)")


async def view_farm(user: dict, requested=None):
    """The single farm a one-farm page (Barn, Milking live view) shows.

    Non-admins get their own farm (None when unassigned). An Admin gets the farm
    named in ?farm_id=, else their own, else the first farm.
    """
    if not is_admin(user):
        return user_farm(user)
    if requested is None:
        requested = _admin_farm.get()
    if requested is not None:
        return int(requested)
    return user_farm(user) or await pilot_farm_id()


async def farm_of_cow(cow_id):
    if cow_id is None:
        return None
    row = await fetchone("SELECT farm_id FROM Cows WHERE cow_id = %s", (cow_id,))
    return row["farm_id"] if row else None


async def farm_of_device(device_id):
    if not device_id:
        return None
    row = await fetchone("SELECT farm_id FROM IoTDevices WHERE device_id = %s", (device_id,))
    return row["farm_id"] if row else None
