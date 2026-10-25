"""
SMS Alert Configuration router.
Admin can manage which phone numbers receive SMS alerts and for which severity levels.
Uses a new SmsSubscribers table (added in additions SQL).
Each subscriber belongs to a farm and is texted about that farm's alerts.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import fetchall, fetchone, execute
from rbac import require_admin
from tenancy import ensure_row_access, farm_clause, farm_for_write

router = APIRouter(prefix="/api/sms-config", tags=["sms_config"])


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


class SubscriberCreate(BaseModel):
    phone_number: str
    full_name:    Optional[str] = None
    min_severity: Optional[str] = "Critical"   # Info | Warning | Critical | Emergency
    alert_types:  Optional[str] = "All"        # comma-separated or "All"
    is_active:    Optional[bool] = True
    farm_id:      Optional[int] = None         # needed when there is more than one farm


class SubscriberUpdate(BaseModel):
    full_name:    Optional[str] = None
    min_severity: Optional[str] = None
    alert_types:  Optional[str] = None
    is_active:    Optional[bool] = None


@router.get("/subscribers")
async def list_subscribers(user=Depends(require_admin())):
    where, args = farm_clause(user)
    rows = await fetchall(f"SELECT * FROM SmsSubscribers WHERE {where} ORDER BY created_at DESC", args)
    return [_safe(r) for r in rows]


@router.post("/subscribers")
async def add_subscriber(
    body: SubscriberCreate,
    current_user: dict = Depends(require_admin()),
):
    existing = await fetchone(
        "SELECT subscriber_id FROM SmsSubscribers WHERE phone_number=%s",
        (body.phone_number,),
    )
    if existing:
        raise HTTPException(409, f"Phone number {body.phone_number} already registered")
    farm_id = await farm_for_write(current_user, body.farm_id)
    rid = await execute(
        """
        INSERT INTO SmsSubscribers
        (phone_number, full_name, min_severity, alert_types, is_active, added_by, farm_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
        """,
        (body.phone_number, body.full_name, body.min_severity,
         body.alert_types, body.is_active, current_user["username"], farm_id),
    )
    return {"ok": True, "subscriber_id": rid}


@router.patch("/subscribers/{sub_id}")
async def update_subscriber(
    sub_id: int,
    body: SubscriberUpdate,
    user=Depends(require_admin()),
):
    await ensure_row_access(user, "SmsSubscribers", "subscriber_id", sub_id)
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    set_clause = ", ".join(f"{k}=%s" for k in fields)
    await execute(
        f"UPDATE SmsSubscribers SET {set_clause} WHERE subscriber_id=%s",
        list(fields.values()) + [sub_id],
    )
    return {"ok": True}


@router.delete("/subscribers/{sub_id}")
async def delete_subscriber(sub_id: int, user=Depends(require_admin())):
    await ensure_row_access(user, "SmsSubscribers", "subscriber_id", sub_id)
    await execute("DELETE FROM SmsSubscribers WHERE subscriber_id=%s", (sub_id,))
    return {"ok": True}


@router.get("/sms-logs")
async def sms_history(limit: int = 100, user=Depends(require_admin())):
    where, args = farm_clause(user, "s.farm_id")
    rows = await fetchall(
        f"""
        SELECT s.*, a.alert_type, a.severity, a.message AS alert_message
        FROM SmsLogs s
        LEFT JOIN Alerts a ON s.alert_id = a.alert_id
        WHERE {where}
        ORDER BY s.created_at DESC
        LIMIT %s
        """,
        (*args, limit),
    )
    return [_safe(r) for r in rows]
