from fastapi import APIRouter, Depends, HTTPException
from form_model import FormModel
from typing import Optional
from database import fetchall, fetchone, execute
from ws_manager import manager
from rbac import require_any, require_can_update_health
from tenancy import ensure_cow_access, ensure_row_access, farm_clause, farm_for_write

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


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


class AlertCreate(FormModel):
    alert_type: str
    cow_id: Optional[int] = None
    severity: Optional[str] = "Warning"
    message: str
    assigned_vet_id: Optional[int] = None   # for Symptom Report notifications to a specific vet
    farm_id: Optional[int] = None           # Admin only, for alerts not tied to a cow


@router.get("/")
async def list_alerts(resolved: bool = False, limit: int = 50, user=Depends(require_any())):
    where, args = farm_clause(user, "a.farm_id")
    rows = await fetchall(
        f"""
        SELECT a.*, c.cow_name
        FROM Alerts a
        LEFT JOIN Cows c ON a.cow_id = c.cow_id
        WHERE a.is_resolved = %s AND {where}
        ORDER BY
            FIELD(a.severity,'Emergency','Critical','Warning','Info'),
            a.created_at DESC
        LIMIT %s
        """,
        (resolved, *args, limit),
    )
    return [_safe(r) for r in rows]


@router.get("/sms-logs")
async def sms_logs(limit: int = 50, user=Depends(require_any())):
    where, args = farm_clause(user, "s.farm_id")
    rows = await fetchall(
        f"""
        SELECT s.*, a.alert_type, a.severity
        FROM SmsLogs s
        LEFT JOIN Alerts a ON s.alert_id = a.alert_id
        WHERE {where}
        ORDER BY s.created_at DESC
        LIMIT %s
        """,
        (*args, limit),
    )
    return [_safe(r) for r in rows]


@router.get("/vet-reports")
async def vet_symptom_reports(current_user: dict = Depends(require_any())):
    """Symptom reports assigned to the current vet (or all if Admin)."""
    role = current_user["role"]
    where, args = farm_clause(current_user, "a.farm_id")
    if role == "Admin":
        rows = await fetchall(
            f"""
            SELECT a.*, c.cow_name, c.rfid_tag
            FROM Alerts a LEFT JOIN Cows c ON a.cow_id = c.cow_id
            WHERE a.alert_type = 'Symptom Report' AND {where}
            ORDER BY a.created_at DESC LIMIT 50
            """,
            args,
        )
    else:
        rows = await fetchall(
            f"""
            SELECT a.*, c.cow_name, c.rfid_tag
            FROM Alerts a LEFT JOIN Cows c ON a.cow_id = c.cow_id
            WHERE a.alert_type = 'Symptom Report' AND a.assigned_vet_id = %s AND {where}
            ORDER BY a.created_at DESC LIMIT 50
            """,
            (current_user["user_id"], *args),
        )
    return [_safe(r) for r in rows]


@router.get("/stats")
async def alert_stats(user=Depends(require_any())):
    where, args = farm_clause(user)
    rows = await fetchall(
        f"""
        SELECT severity, alert_type, COUNT(*) AS cnt
        FROM Alerts
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND {where}
        GROUP BY severity, alert_type
        ORDER BY cnt DESC
        """,
        args,
    )
    return rows


@router.patch("/{alert_id}/resolve")
async def resolve_alert(
    alert_id: int,
    current_user: dict = Depends(require_any()),
):
    """All roles can resolve alerts on a farm they can see."""
    alert = await ensure_row_access(current_user, "Alerts", "alert_id", alert_id)
    await execute(
        "UPDATE Alerts SET is_resolved=TRUE, resolved_at=NOW() WHERE alert_id=%s",
        (alert_id,),
    )
    await manager.broadcast("alert_resolved", {
        "alert_id": alert_id,
        "resolved_by": current_user["username"],
    }, farm_id=alert["farm_id"])
    return {"ok": True}


@router.post("/")
async def create_alert(
    body: AlertCreate,
    current_user: dict = Depends(require_any()),
):
    """
    All roles can create general alerts.
    Farmer and Technician cannot create 'Health' type alerts: that's restricted to
    Admin and Veterinarian to keep health diagnostics authoritative.
    """
    role = current_user["role"]
    if body.alert_type == "Health" and role not in ("Admin", "Veterinarian"):
        raise HTTPException(403, "Only Admin or Veterinarian can create Health-type alerts")

    # An alert about a cow belongs to the cow's farm; otherwise to the writer's farm
    if body.cow_id is not None:
        farm_id = (await ensure_cow_access(current_user, body.cow_id))["farm_id"]
    else:
        farm_id = await farm_for_write(current_user, body.farm_id)

    # The vet must work on the same farm as the alert
    if body.assigned_vet_id and not await fetchone(
        "SELECT user_id FROM Users WHERE user_id=%s AND farm_id=%s",
        (body.assigned_vet_id, farm_id),
    ):
        raise HTTPException(404, "Veterinarian not found")

    rid = await execute(
        """
        INSERT INTO Alerts (alert_type, cow_id, assigned_vet_id, severity, message, created_by, farm_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (body.alert_type, body.cow_id, body.assigned_vet_id,
         body.severity, body.message, current_user["username"], farm_id),
    )

    # If this is a Symptom Report directed at a specific vet, create an in-app notification
    if body.alert_type == "Symptom Report" and body.assigned_vet_id:
        cow_info = await fetchone("SELECT cow_name FROM Cows WHERE cow_id=%s", (body.cow_id,)) if body.cow_id else None
        cow_label = f" for {cow_info['cow_name']}" if cow_info else ""
        await execute(
            """
            INSERT INTO Notifications (user_id, title, message, notif_type, ref_id)
            VALUES (%s, %s, %s, 'SymptomReport', %s)
            """,
            (body.assigned_vet_id,
             f"Symptom Report{cow_label} from {current_user['username']}",
             body.message, rid),
        )

    await manager.broadcast("new_alert", {
        "alert_id": rid,
        "severity": body.severity,
        "message": body.message,
        "alert_type": body.alert_type,
        "created_by": current_user["username"],
        "assigned_vet_id": body.assigned_vet_id,
    }, farm_id=farm_id)
    return {"id": rid}
