"""
Field settings (milk container calibration, tank thresholds, temperature
rules, farm boundary) and the device registry with online status.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from database import execute, fetchall, fetchone
from farm_config import DEFAULT_SETTINGS, ONLINE_SECONDS, ROLES, db_now, get_settings, save_settings, seconds_since
from rbac import require_admin_or_technician, require_any
from tenancy import ensure_row_access, farm_clause, farm_for_write, is_admin

router = APIRouter(prefix="/api/field", tags=["field_settings"])


def _device_row(r: dict, now) -> dict:
    last = r.get("last_seen")
    age = seconds_since(now, last)
    return {
        "device_id": r["device_id"], "role": r["role"], "label": r.get("label"),
        "cow_id": r.get("cow_id"), "cow_name": r.get("cow_name"), "farm_id": r.get("farm_id"),
        "last_seen": last.isoformat() if last else None,
        "seconds_since_seen": round(age) if age is not None else None,
        "online": age is not None and age <= ONLINE_SECONDS,
    }


@router.get("/settings")
async def read_settings(farm_id: Optional[int] = Query(None), user=Depends(require_any())):
    """The user's farm settings; an Admin picks the farm with ?farm_id= when there are several."""
    return await get_settings(await farm_for_write(user, farm_id), fresh=True)


@router.patch("/settings")
async def update_settings(body: dict, farm_id: Optional[int] = Query(None), user=Depends(require_admin_or_technician())):
    unknown = [k for k in body if k not in DEFAULT_SETTINGS]
    if unknown:
        raise HTTPException(400, f"Unknown setting(s): {', '.join(unknown)}")
    for k, v in body.items():
        if v in (None, ""):
            continue
        try:
            float(v)
        except (TypeError, ValueError):
            raise HTTPException(400, f"{k} must be a number")
    return await save_settings(await farm_for_write(user, farm_id), body, user["username"])


@router.get("/devices")
async def devices(user=Depends(require_any())):
    where, args = farm_clause(user, "d.farm_id")
    rows = await fetchall(
        f"""
        SELECT d.*, c.cow_name FROM IoTDevices d LEFT JOIN Cows c ON c.cow_id = d.cow_id
        WHERE {where}
        ORDER BY FIELD(d.role, 'milking', 'barn', 'collar'), d.device_id
        """,
        args,
    )
    now = await db_now()
    return [_device_row(r, now) for r in rows]


@router.get("/device-status")
async def device_status(user=Depends(require_any())):
    """One entry per role for the header chips: online if any of the farm's devices of that role is."""
    where, args = farm_clause(user)
    rows = await fetchall(f"SELECT * FROM IoTDevices WHERE {where}", args)
    now = await db_now()
    out = {}
    for role in ROLES:
        mine = [_device_row(r, now) for r in rows if r["role"] == role]
        latest = max((d for d in mine if d["last_seen"]), key=lambda d: d["last_seen"], default=None)
        out[role] = {
            "online": any(d["online"] for d in mine),
            "devices": len(mine),
            "last_seen": latest["last_seen"] if latest else None,
            "seconds_since_seen": latest["seconds_since_seen"] if latest else None,
        }
    return out


class DeviceUpdate(BaseModel):
    role: Optional[str] = None
    label: Optional[str] = None
    cow_id: Optional[int] = None
    clear_cow: bool = False
    farm_id: Optional[int] = None      # Admin only: move the device to another farm


@router.patch("/devices/{device_id}")
async def update_device(device_id: str, body: DeviceUpdate, user=Depends(require_admin_or_technician())):
    device = await ensure_row_access(user, "IoTDevices", "device_id", device_id)
    if body.role is not None and body.role not in ROLES:
        raise HTTPException(400, f"role must be one of {', '.join(ROLES)}")
    if body.farm_id is not None:
        if not is_admin(user):
            raise HTTPException(403, "Only an administrator can move a device to another farm")
        target = await farm_for_write(user, body.farm_id)
        # A cow on the old farm cannot stay linked to the device
        await execute("UPDATE IoTDevices SET farm_id = %s, cow_id = NULL WHERE device_id = %s", (target, device_id))
        device["farm_id"] = target
    if body.cow_id is not None and not body.clear_cow:
        cow = await fetchone("SELECT farm_id FROM Cows WHERE cow_id = %s", (body.cow_id,))
        if not cow or cow["farm_id"] != device["farm_id"]:
            raise HTTPException(400, "That cow is not on the same farm as the device")
    if body.role is not None:
        await execute("UPDATE IoTDevices SET role = %s WHERE device_id = %s", (body.role, device_id))
    if body.label is not None:
        await execute("UPDATE IoTDevices SET label = %s WHERE device_id = %s", (body.label.strip()[:100], device_id))
    if body.clear_cow:
        await execute("UPDATE IoTDevices SET cow_id = NULL WHERE device_id = %s", (device_id,))
    elif body.cow_id is not None:
        await execute("UPDATE IoTDevices SET cow_id = %s WHERE device_id = %s", (body.cow_id, device_id))
    row = await fetchone(
        "SELECT d.*, c.cow_name FROM IoTDevices d LEFT JOIN Cows c ON c.cow_id = d.cow_id WHERE d.device_id = %s",
        (device_id,),
    )
    return _device_row(row, await db_now())
