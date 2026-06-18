from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from database import fetchall, fetchone, execute
from rbac import require_any, require_admin_or_farmer

router = APIRouter(prefix="/api/groups", tags=["groups"])


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


class GroupCreate(BaseModel):
    group_name: str
    group_type: Optional[str] = "Custom"
    description: Optional[str] = None


class MemberBody(BaseModel):
    cow_ids: List[int]


@router.get("/")
async def list_groups(_=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT g.*,
               COUNT(m.cow_id) AS member_count
        FROM AnimalGroups g
        LEFT JOIN GroupMembers m ON g.group_id = m.group_id
        GROUP BY g.group_id
        ORDER BY g.group_type, g.group_name
        """
    )
    return [_safe(r) for r in rows]


@router.get("/{group_id}/members")
async def group_members(group_id: int, _=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT c.cow_id, c.cow_name, c.breed, c.cow_category, c.health_status,
               c.lactating, c.weight_kg,
               TIMESTAMPDIFF(MONTH, c.birth_date, CURDATE()) AS age_months
        FROM GroupMembers m
        JOIN Cows c ON m.cow_id = c.cow_id
        WHERE m.group_id = %s AND c.is_active = TRUE
        ORDER BY c.cow_name
        """,
        (group_id,),
    )
    return [_safe(r) for r in rows]


@router.post("/")
async def create_group(
    body: GroupCreate,
    current_user: dict = Depends(require_admin_or_farmer()),
):
    rid = await execute(
        "INSERT INTO AnimalGroups (group_name, group_type, description, created_by) VALUES (%s,%s,%s,%s)",
        (body.group_name, body.group_type, body.description, current_user["username"]),
    )
    return {"ok": True, "group_id": rid}


@router.post("/{group_id}/members")
async def add_members(
    group_id: int,
    body: MemberBody,
    _=Depends(require_admin_or_farmer()),
):
    for cow_id in body.cow_ids:
        try:
            await execute(
                "INSERT IGNORE INTO GroupMembers (group_id, cow_id) VALUES (%s,%s)",
                (group_id, cow_id),
            )
        except Exception:
            pass
    return {"ok": True}


@router.delete("/{group_id}/members/{cow_id}")
async def remove_member(
    group_id: int,
    cow_id: int,
    _=Depends(require_admin_or_farmer()),
):
    await execute(
        "DELETE FROM GroupMembers WHERE group_id=%s AND cow_id=%s",
        (group_id, cow_id),
    )
    return {"ok": True}


@router.delete("/{group_id}")
async def delete_group(
    group_id: int,
    _=Depends(require_admin_or_farmer()),
):
    await execute("DELETE FROM AnimalGroups WHERE group_id=%s", (group_id,))
    return {"ok": True}
