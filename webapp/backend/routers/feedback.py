from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from database import fetchall, fetchone, execute
from rbac import require_any, require_admin

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


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


class FeedbackCreate(BaseModel):
    category: Optional[str] = Field("General", max_length=50)
    subject: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1, max_length=2000)
    rating: Optional[int] = Field(None, ge=1, le=5)


class FeedbackReply(BaseModel):
    admin_reply: str = Field(..., min_length=1, max_length=2000)
    status: Optional[str] = Field("Resolved", pattern="^(Resolved|Pending|In Progress)$")


@router.get("/")
async def list_feedback(_=Depends(require_admin())):
    rows = await fetchall(
        """
        SELECT f.*, u.full_name, u.username, u.role
        FROM Feedback f
        LEFT JOIN Users u ON f.user_id = u.user_id
        ORDER BY f.created_at DESC
        """
    )
    return [_safe(r) for r in rows]


@router.get("/my")
async def my_feedback(current_user: dict = Depends(require_any())):
    rows = await fetchall(
        "SELECT * FROM Feedback WHERE user_id=%s ORDER BY created_at DESC",
        (current_user["user_id"],),
    )
    return [_safe(r) for r in rows]


@router.post("/")
async def submit_feedback(
    body: FeedbackCreate,
    current_user: dict = Depends(require_any()),
):
    rid = await execute(
        """
        INSERT INTO Feedback (user_id, category, subject, message, rating)
        VALUES (%s,%s,%s,%s,%s)
        """,
        (current_user["user_id"], body.category, body.subject,
         body.message, body.rating),
    )
    return {"ok": True, "feedback_id": rid}


@router.patch("/{feedback_id}/reply")
async def reply_feedback(
    feedback_id: int,
    body: FeedbackReply,
    _=Depends(require_admin()),
):
    await execute(
        """
        UPDATE Feedback
        SET admin_reply=%s, status=%s,
            resolved_at=CASE WHEN %s='Resolved' THEN NOW() ELSE resolved_at END
        WHERE feedback_id=%s
        """,
        (body.admin_reply, body.status, body.status, feedback_id),
    )
    return {"ok": True}


@router.delete("/{feedback_id}")
async def delete_feedback(feedback_id: int, _=Depends(require_admin())):
    await execute("DELETE FROM Feedback WHERE feedback_id=%s", (feedback_id,))
    return {"ok": True}
