"""Public Contact Us form — no authentication required."""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional

from database import execute, fetchall
from email_service import send_contact_message
from rbac import require_admin

router = APIRouter(prefix="/api/contact", tags=["contact"])


class ContactRequest(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    subject: Optional[str] = None
    message: str


def _safe(row: dict) -> dict:
    out = {}
    for k, v in row.items():
        out[k] = v.isoformat() if hasattr(v, "isoformat") else v
    return out


@router.post("/")
async def submit_contact(body: ContactRequest, background_tasks: BackgroundTasks):
    if not body.name.strip() or not body.message.strip():
        raise HTTPException(400, "Name and message are required")

    await execute(
        "INSERT INTO ContactMessages (name, email, phone, subject, message) VALUES (%s,%s,%s,%s,%s)",
        (body.name, body.email, body.phone, body.subject, body.message),
    )
    background_tasks.add_task(
        send_contact_message, body.name, body.email, body.phone, body.subject, body.message
    )
    return {"ok": True, "message": "Thanks for reaching out — we'll get back to you soon."}


@router.get("/", dependencies=[Depends(require_admin())])
async def list_contact_messages(limit: int = 100):
    rows = await fetchall(
        "SELECT * FROM ContactMessages ORDER BY created_at DESC LIMIT %s", (limit,)
    )
    return [_safe(r) for r in rows]
