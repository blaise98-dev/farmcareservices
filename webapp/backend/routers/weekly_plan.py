from fastapi import APIRouter, Depends, HTTPException
from form_model import FormModel
from typing import Optional
from database import fetchall, fetchone, execute
from rbac import require_any
from tenancy import farm_clause, ensure_cow_access, ensure_row_access, farm_for_write

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


class TaskCreate(FormModel):
    title: str
    description: Optional[str] = None
    task_type: Optional[str] = "Other"
    assigned_to: Optional[str] = None
    due_date: str
    due_time: Optional[str] = None
    cow_id: Optional[int] = None
    group_id: Optional[int] = None
    priority: Optional[str] = "Medium"
    farm_id: Optional[int] = None    # Admin only; others use their own farm


class TaskUpdate(FormModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None


@router.get("/")
async def list_tasks(days: int = 7, user=Depends(require_any())):
    where, args = farm_clause(user, "p.farm_id")
    rows = await fetchall(
        f"""
        SELECT p.*,
               c.cow_name,
               g.group_name
        FROM WeeklyPlan p
        LEFT JOIN Cows c ON p.cow_id = c.cow_id
        LEFT JOIN AnimalGroups g ON p.group_id = g.group_id
        WHERE p.due_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 1 DAY)
                              AND DATE_ADD(CURDATE(), INTERVAL %s DAY)
          AND {where}
        ORDER BY p.due_date ASC, p.due_time ASC
        """,
        (days, *args),
    )
    return [_safe(r) for r in rows]


@router.get("/today")
async def today_tasks(user=Depends(require_any())):
    where, args = farm_clause(user, "p.farm_id")
    rows = await fetchall(
        f"""
        SELECT p.*, c.cow_name, g.group_name
        FROM WeeklyPlan p
        LEFT JOIN Cows c ON p.cow_id = c.cow_id
        LEFT JOIN AnimalGroups g ON p.group_id = g.group_id
        WHERE p.due_date = CURDATE() AND {where}
        ORDER BY p.due_time ASC, p.priority DESC
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.post("/")
async def create_task(
    body: TaskCreate,
    current_user: dict = Depends(require_any()),
):
    # A linked cow or group must be visible; an Admin's task follows it to its farm
    cow = await ensure_cow_access(current_user, body.cow_id) if body.cow_id is not None else None
    group = (await ensure_row_access(current_user, "AnimalGroups", "group_id", body.group_id)
             if body.group_id is not None else None)
    linked = cow or group
    farm_id = await farm_for_write(
        current_user, body.farm_id if body.farm_id is not None else (linked["farm_id"] if linked else None)
    )
    if (cow and cow["farm_id"] != farm_id) or (group and group["farm_id"] != farm_id):
        raise HTTPException(400, "The cow and group must be on the task's farm")
    rid = await execute(
        """
        INSERT INTO WeeklyPlan
        (title, description, task_type, assigned_to, due_date, due_time,
         cow_id, group_id, priority, created_by, farm_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (body.title, body.description, body.task_type, body.assigned_to,
         body.due_date, body.due_time, body.cow_id, body.group_id,
         body.priority, current_user["username"], farm_id),
    )
    return {"ok": True, "task_id": rid}


@router.patch("/{task_id}")
async def update_task(
    task_id: int,
    body: TaskUpdate,
    user=Depends(require_any()),
):
    await ensure_row_access(user, "WeeklyPlan", "task_id", task_id)
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
async def delete_task(task_id: int, user=Depends(require_any())):
    await ensure_row_access(user, "WeeklyPlan", "task_id", task_id)
    await execute("DELETE FROM WeeklyPlan WHERE task_id=%s", (task_id,))
    return {"ok": True}
