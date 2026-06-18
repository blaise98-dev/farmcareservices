from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from database import fetchall, fetchone, execute
from rbac import require_any

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


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


@router.get("/")
async def my_notifications(current_user: dict = Depends(require_any())):
    rows = await fetchall(
        """
        SELECT n.*,
               CASE WHEN n.notif_type = 'SymptomReport'
                    THEN (SELECT a.cow_id FROM Alerts a WHERE a.alert_id = n.ref_id)
               END AS cow_id,
               CASE WHEN n.notif_type = 'SymptomReport'
                    THEN (SELECT c.cow_name FROM Alerts a JOIN Cows c ON a.cow_id=c.cow_id WHERE a.alert_id = n.ref_id)
               END AS cow_name
        FROM Notifications n
        WHERE n.user_id = %s OR n.user_id IS NULL
        ORDER BY n.created_at DESC
        LIMIT 50
        """,
        (current_user["user_id"],),
    )
    return [_safe(r) for r in rows]


@router.get("/unread-count")
async def unread_count(current_user: dict = Depends(require_any())):
    row = await fetchone(
        """
        SELECT COUNT(*) AS cnt FROM Notifications
        WHERE (user_id = %s OR user_id IS NULL) AND is_read = FALSE
        """,
        (current_user["user_id"],),
    )
    return {"count": row["cnt"] if row else 0}


@router.patch("/{notif_id}/read")
async def mark_read(notif_id: int, _=Depends(require_any())):
    await execute(
        "UPDATE Notifications SET is_read=TRUE WHERE notif_id=%s",
        (notif_id,),
    )
    return {"ok": True}


@router.patch("/read-all")
async def mark_all_read(current_user: dict = Depends(require_any())):
    await execute(
        "UPDATE Notifications SET is_read=TRUE WHERE user_id=%s OR user_id IS NULL",
        (current_user["user_id"],),
    )
    return {"ok": True}
