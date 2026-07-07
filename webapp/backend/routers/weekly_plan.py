from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import fetchall, fetchone, execute
from rbac import require_any

router = APIRouter(prefix="/api/weekly-plan", tags=["weekly_plan"])


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


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    task_type: Optional[str] = "Other"
    assigned_to: Optional[str] = None
    due_date: str
    due_time: Optional[str] = None
    cow_id: Optional[int] = None
    group_id: Optional[int] = None
    priority: Optional[str] = "Medium"


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None


@router.get("/")
async def list_tasks(days: int = 7, _=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT p.*,
               c.cow_name,
               g.group_name
        FROM WeeklyPlan p
        LEFT JOIN Cows c ON p.cow_id = c.cow_id
        LEFT JOIN AnimalGroups g ON p.group_id = g.group_id
        WHERE p.due_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 1 DAY)
                              AND DATE_ADD(CURDATE(), INTERVAL %s DAY)
        ORDER BY p.due_date ASC, p.due_time ASC
        """,
        (days,),
    )
    return [_safe(r) for r in rows]


@router.get("/today")
async def today_tasks(_=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT p.*, c.cow_name, g.group_name
        FROM WeeklyPlan p
        LEFT JOIN Cows c ON p.cow_id = c.cow_id
        LEFT JOIN AnimalGroups g ON p.group_id = g.group_id
        WHERE p.due_date = CURDATE()
        ORDER BY p.due_time ASC, p.priority DESC
        """
    )
    return [_safe(r) for r in rows]


@router.post("/")
async def create_task(
    body: TaskCreate,
    current_user: dict = Depends(require_any()),
):
    rid = await execute(
        """
        INSERT INTO WeeklyPlan
        (title, description, task_type, assigned_to, due_date, due_time,
         cow_id, group_id, priority, created_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (body.title, body.description, body.task_type, body.assigned_to,
         body.due_date, body.due_time, body.cow_id, body.group_id,
         body.priority, current_user["username"]),
    )
    return {"ok": True, "task_id": rid}


@router.patch("/{task_id}")
async def update_task(
    task_id: int,
    body: TaskUpdate,
    _=Depends(require_any()),
):
    row = await fetchone("SELECT task_id FROM WeeklyPlan WHERE task_id=%s", (task_id,))
    if not row:
        raise HTTPException(404, "Task not found")
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    if "status" in fields and fields["status"] == "Completed":
        fields["completed_at"] = "NOW()"
    # Handle NOW() specially
    completed_now = fields.pop("completed_at", None)
    set_parts = [f"{k}=%s" for k in fields]
    vals = list(fields.values())
    if completed_now:
        set_parts.append("completed_at=NOW()")
    set_clause = ", ".join(set_parts)
    await execute(
        f"UPDATE WeeklyPlan SET {set_clause} WHERE task_id=%s",
        vals + [task_id],
    )
    return {"ok": True}


@router.delete("/{task_id}")
async def delete_task(task_id: int, _=Depends(require_any())):
    row = await fetchone("SELECT task_id FROM WeeklyPlan WHERE task_id=%s", (task_id,))
    if not row:
        raise HTTPException(404, "Task not found")
    await execute("DELETE FROM WeeklyPlan WHERE task_id=%s", (task_id,))
    return {"ok": True}
