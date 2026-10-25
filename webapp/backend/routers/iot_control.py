"""
IoT Device Control router: manual overrides for Fan, WaterPump, FeedMotor, SprayNozzle.
Admin and Technician only. Every action is logged to SystemControlLogs, and
everything is limited to the user's farm (Admins see all farms).
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import fetchall, fetchone, execute
from rbac import require_admin_or_technician, require_any
from tenancy import farm_clause, farm_for_write

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


DEVICE_TYPES = {"Fan", "WaterPump", "FeedMotor", "SprayNozzle", "Relay", "Buzzer"}
ACTIONS      = {"ON", "OFF", "AUTO", "SPEED_CHANGE", "ERROR"}

# Actuators the barn node (arduinoscripts.txt) can switch remotely. Commands are
# queued in DeviceCommands and handed to the node in its next ingest response.
REMOTE_TYPES = {"WaterPump": "pump", "Fan": "fan", "SprayNozzle": "spray", "Buzzer": "buzzer"}


class DeviceCommand(BaseModel):
    device_type: str
    device_id:   Optional[int] = None
    action:      str
    value:       Optional[float] = None
    trigger_reason: Optional[str] = "Manual override"
    farm_id:     Optional[int] = None    # Admin only, when there are several farms


class CalibrationEntry(BaseModel):
    device_type: str
    device_id:   Optional[int] = None
    notes:       Optional[str] = None
    farm_id:     Optional[int] = None


@router.get("/devices")
async def list_device_status(user=Depends(require_admin_or_technician())):
    """Return last known state for every device from the control log."""
    where, args = farm_clause(user)
    where1, args1 = farm_clause(user, "s1.farm_id")
    rows = await fetchall(
        f"""
        SELECT s1.*
        FROM SystemControlLogs s1
        INNER JOIN (
            SELECT device_type, COALESCE(device_id, -1) AS did, COALESCE(farm_id, -1) AS fid, MAX(recorded_at) AS last_at
            FROM SystemControlLogs
            WHERE {where}
            GROUP BY device_type, COALESCE(device_id, -1), COALESCE(farm_id, -1)
        ) s2 ON s1.device_type = s2.device_type
             AND COALESCE(s1.device_id, -1) = s2.did
             AND COALESCE(s1.farm_id, -1) = s2.fid
             AND s1.recorded_at = s2.last_at
        WHERE {where1}
        ORDER BY s1.farm_id, s1.device_type, s1.device_id
        """,
        (*args, *args1),
    )
    return [_safe(r) for r in rows]


@router.get("/logs")
async def control_logs(limit: int = 100, user=Depends(require_admin_or_technician())):
    where, args = farm_clause(user)
    rows = await fetchall(
        f"""
        SELECT * FROM SystemControlLogs
        WHERE {where}
        ORDER BY recorded_at DESC
        LIMIT %s
        """,
        (*args, limit),
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

    farm_id = await farm_for_write(current_user, body.farm_id)
    reason = f"{body.trigger_reason} (by {current_user['username']})"
    queued_for = None
    remote = REMOTE_TYPES.get(body.device_type)
    if remote and body.action in ("ON", "OFF", "AUTO"):
        barn = await fetchone(
            "SELECT device_id FROM IoTDevices WHERE role = 'barn' AND farm_id = %s ORDER BY last_seen DESC LIMIT 1",
            (farm_id,),
        )
        if not barn:
            raise HTTPException(404, "This farm has no barn device registered")
        queued_for = barn["device_id"]
        await execute(
            "INSERT INTO DeviceCommands (device_id, command_type, command_value, created_by, farm_id) VALUES (%s, %s, %s, %s, %s)",
            (queued_for, remote, body.action, current_user["username"], farm_id),
        )
        if body.action == "AUTO":
            reason = f"Returned to automatic control (by {current_user['username']})"

    rid = None
    try:
        rid = await execute(
            """
            INSERT INTO SystemControlLogs
            (device_type, device_id, action, value, trigger_reason, farm_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (body.device_type, body.device_id, body.action, body.value, reason, farm_id),
        )
    except Exception:  # noqa: BLE001 - older servers' ENUMs lack 'AUTO'/'Buzzer'
        pass
    return {"ok": True, "log_id": rid, "device": body.device_type, "action": body.action,
            "queued_for_device": queued_for,
            "note": None if queued_for else "Logged only: this device type has no remote switch on the barn node"}


@router.get("/commands")
async def recent_commands(limit: int = 30, user=Depends(require_admin_or_technician())):
    where, args = farm_clause(user)
    rows = await fetchall(
        f"SELECT * FROM DeviceCommands WHERE {where} ORDER BY created_at DESC LIMIT %s",
        (*args, min(max(limit, 1), 200)),
    )
    return [_safe(r) for r in rows]


@router.post("/calibrate")
async def log_calibration(
    body: CalibrationEntry,
    current_user: dict = Depends(require_admin_or_technician()),
):
    """Log a sensor calibration event."""
    farm_id = await farm_for_write(current_user, body.farm_id)
    reason = f"Calibration{(': ' + body.notes) if body.notes else ''} (by {current_user['username']})"
    rid = await execute(
        """
        INSERT INTO SystemControlLogs
        (device_type, device_id, action, trigger_reason, farm_id)
        VALUES (%s, %s, 'ON', %s, %s)
        """,
        (body.device_type, body.device_id, reason, farm_id),
    )
    return {"ok": True, "log_id": rid}
