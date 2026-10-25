"""
Farms: the tenants of FarmCare. Admins list, create and rename farms and see
how many users, cows and devices each holds; everyone else sees only their own.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from form_model import FormModel

from database import execute, fetchall, fetchone
from rbac import require_admin, require_any
from tenancy import is_admin, user_farm

router = APIRouter(prefix="/api/farms", tags=["farms"])


class FarmBody(FormModel):
    farm_name: Optional[str] = Field(None, min_length=2, max_length=150)
    location: Optional[str] = Field(None, max_length=255)
    established_year: Optional[int] = Field(None, ge=1900, le=2100)
    total_area_hectares: Optional[float] = Field(None, ge=0)


def _safe(row: dict) -> dict:
    return {k: (v.isoformat() if hasattr(v, "isoformat") else float(v) if hasattr(v, "__float__") and not isinstance(v, (int, bool)) else v)
            for k, v in (row or {}).items()}


@router.get("")
async def list_farms(user=Depends(require_any())):
    if is_admin(user):
        where, args = "1=1", ()
    elif user_farm(user) is not None:
        where, args = "f.farm_id = %s", (user_farm(user),)
    else:
        return []
    rows = await fetchall(
        f"""
        SELECT f.farm_id, f.farm_name, f.location, f.established_year, f.total_area_hectares,
               (SELECT COUNT(*) FROM Users u WHERE u.farm_id = f.farm_id) AS users,
               (SELECT COUNT(*) FROM Cows c WHERE c.farm_id = f.farm_id AND c.is_active = TRUE) AS cows,
               (SELECT COUNT(*) FROM IoTDevices d WHERE d.farm_id = f.farm_id) AS devices
        FROM Farm f
        WHERE {where}
        ORDER BY f.farm_id
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.get("/unassigned")
async def unassigned(_=Depends(require_admin())):
    """Users and devices that belong to no farm yet, so an Admin can place them."""
    users = await fetchall(
        "SELECT user_id, username, full_name, role, approval_status FROM Users "
        "WHERE farm_id IS NULL AND role <> 'Admin' ORDER BY created_at DESC"
    )
    devices = await fetchall(
        "SELECT device_id, role, label, last_seen FROM IoTDevices WHERE farm_id IS NULL ORDER BY last_seen DESC"
    )
    return {"users": [_safe(u) for u in users], "devices": [_safe(d) for d in devices]}


@router.post("")
async def create_farm(body: FarmBody, _=Depends(require_admin())):
    if not (body.farm_name or "").strip():
        raise HTTPException(400, "Farm name is required")
    if await fetchone("SELECT farm_id FROM Farm WHERE farm_name = %s", (body.farm_name.strip(),)):
        raise HTTPException(409, "A farm with that name already exists")
    fid = await execute(
        "INSERT INTO Farm (farm_name, location, established_year, total_area_hectares) VALUES (%s, %s, %s, %s)",
        (body.farm_name.strip(), body.location, body.established_year, body.total_area_hectares),
    )
    return _safe(await fetchone("SELECT * FROM Farm WHERE farm_id = %s", (fid,)))


@router.patch("/{farm_id}")
async def update_farm(farm_id: int, body: FarmBody, _=Depends(require_admin())):
    if not await fetchone("SELECT farm_id FROM Farm WHERE farm_id = %s", (farm_id,)):
        raise HTTPException(404, "Farm not found")
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    sets = ", ".join(f"{k} = %s" for k in fields)
    await execute(f"UPDATE Farm SET {sets} WHERE farm_id = %s", (*fields.values(), farm_id))
    return _safe(await fetchone("SELECT * FROM Farm WHERE farm_id = %s", (farm_id,)))
