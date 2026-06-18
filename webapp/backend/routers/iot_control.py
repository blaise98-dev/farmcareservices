"""
IoT Device Control router — manual overrides for Fan, WaterPump, FeedMotor, SprayNozzle.
Admin and Technician only. Every action is logged to SystemControlLogs.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import fetchall, fetchone, execute
from rbac import require_admin_or_technician, require_any

router = APIRouter(prefix="/api/iot", tags=["iot_control"])


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


DEVICE_TYPES = {"Fan", "WaterPump", "FeedMotor", "SprayNozzle", "Relay"}
ACTIONS      = {"ON", "OFF", "SPEED_CHANGE", "ERROR"}


class DeviceCommand(BaseModel):
    device_type: str
    device_id:   Optional[int] = None
    action:      str
    value:       Optional[float] = None
    trigger_reason: Optional[str] = "Manual override"


class CalibrationEntry(BaseModel):
    device_type: str
    device_id:   Optional[int] = None
    notes:       Optional[str] = None


@router.get("/devices")
async def list_device_status(_=Depends(require_any())):
    """Return last known state for every device from the control log."""
    rows = await fetchall(
        """
        SELECT s1.*
        FROM SystemControlLogs s1
        INNER JOIN (
            SELECT device_type, COALESCE(device_id, -1) AS did, MAX(recorded_at) AS last_at
            FROM SystemControlLogs
            GROUP BY device_type, COALESCE(device_id, -1)
        ) s2 ON s1.device_type = s2.device_type
             AND COALESCE(s1.device_id, -1) = s2.did
             AND s1.recorded_at = s2.last_at
        ORDER BY s1.device_type, s1.device_id
        """
    )
    return [_safe(r) for r in rows]


@router.get("/logs")
async def control_logs(limit: int = 100, _=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT * FROM SystemControlLogs
        ORDER BY recorded_at DESC
        LIMIT %s
        """,
        (limit,),
    )
    return [_safe(r) for r in rows]


@router.post("/command")
async def send_command(
    body: DeviceCommand,
    current_user: dict = Depends(require_admin_or_technician()),
):
    """Send a manual command to a device and log it."""
    if body.device_type not in DEVICE_TYPES:
        raise HTTPException(400, f"Unknown device type. Valid: {', '.join(DEVICE_TYPES)}")
    if body.action not in ACTIONS:
        raise HTTPException(400, f"Unknown action. Valid: {', '.join(ACTIONS)}")

    reason = f"{body.trigger_reason} (by {current_user['username']})"
    rid = await execute(
        """
        INSERT INTO SystemControlLogs
        (device_type, device_id, action, value, trigger_reason)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (body.device_type, body.device_id, body.action, body.value, reason),
    )
    return {"ok": True, "log_id": rid, "device": body.device_type, "action": body.action}


@router.post("/calibrate")
async def log_calibration(
    body: CalibrationEntry,
    current_user: dict = Depends(require_admin_or_technician()),
):
    """Log a sensor calibration event."""
    reason = f"Calibration{(' — ' + body.notes) if body.notes else ''} (by {current_user['username']})"
    rid = await execute(
        """
        INSERT INTO SystemControlLogs
        (device_type, device_id, action, trigger_reason)
        VALUES (%s, %s, 'ON', %s)
        """,
        (body.device_type, body.device_id, reason),
    )
    return {"ok": True, "log_id": rid}
