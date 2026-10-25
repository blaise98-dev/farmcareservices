from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from form_model import FormModel
from typing import Optional
from database import fetchall, fetchone, execute
from rbac import require_any, require_admin_or_farmer
from tenancy import farm_clause, ensure_row_access, farm_for_write

router = APIRouter(prefix="/api/feed-inventory", tags=["feed_inventory"])


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


class InventoryEntry(FormModel):
    item_name: str = Field(..., min_length=1, max_length=200)
    category: Optional[str] = Field("Hay", max_length=100)
    quantity_kg: float = Field(..., ge=0, le=1_000_000)
    dry_matter_pct: Optional[float] = Field(85.0, ge=0, le=100)
    crude_protein_pct: Optional[float] = Field(12.0, ge=0, le=100)
    unit_cost_rwf: Optional[float] = Field(0, ge=0)
    supplier: Optional[str] = Field(None, max_length=200)
    purchase_date: Optional[str] = None
    expiry_date: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=1000)
    farm_id: Optional[int] = None    # Admin only; others use their own farm


class InventoryUpdate(FormModel):
    quantity_kg: Optional[float] = None
    dry_matter_pct: Optional[float] = None
    crude_protein_pct: Optional[float] = None
    unit_cost_rwf: Optional[float] = None
    supplier: Optional[str] = None
    expiry_date: Optional[str] = None
    notes: Optional[str] = None


@router.get("/")
async def list_inventory(user=Depends(require_admin_or_farmer())):
    where, args = farm_clause(user, "farm_id")
    rows = await fetchall(
        f"SELECT * FROM FeedInventory WHERE {where} ORDER BY category, item_name",
        args,
    )
    return [_safe(r) for r in rows]


@router.get("/summary")
async def inventory_summary(user=Depends(require_admin_or_farmer())):
    """Totals: dry matter (kg), crude protein (kg), total stock value."""
    where, args = farm_clause(user, "farm_id")
    row = await fetchone(
        f"""
        SELECT
            SUM(quantity_kg)             AS total_kg,
            SUM(quantity_kg * COALESCE(unit_cost_rwf, 0)) AS total_value_rwf,
            COUNT(*)                     AS item_count,
            SUM(CASE WHEN quantity_kg <= reorder_level_kg THEN 1 ELSE 0 END) AS low_stock_count
        FROM FeedInventory
        WHERE quantity_kg >= 0 AND {where}
        """,
        args,
    )
    return _safe(row) if row else {}


@router.post("/")
async def add_item(
    body: InventoryEntry,
    current_user: dict = Depends(require_admin_or_farmer()),
):
    farm_id = await farm_for_write(current_user, body.farm_id)
    rid = await execute(
        """
        INSERT INTO FeedInventory
        (item_name, category, quantity_kg, dry_matter_pct, crude_protein_pct,
         unit_cost_rwf, supplier, purchase_date, expiry_date, notes, recorded_by, farm_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (body.item_name, body.category, body.quantity_kg, body.dry_matter_pct,
         body.crude_protein_pct, body.unit_cost_rwf, body.supplier,
         body.purchase_date, body.expiry_date, body.notes,
         current_user["username"], farm_id),
    )
    return {"ok": True, "inventory_id": rid}


@router.patch("/{inventory_id}")
async def update_item(
    inventory_id: int,
    body: InventoryUpdate,
    current_user: dict = Depends(require_admin_or_farmer()),
):
    await ensure_row_access(current_user, "FeedInventory", "inventory_id", inventory_id)
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    set_clause = ", ".join(f"{k}=%s" for k in fields)
    await execute(
        f"UPDATE FeedInventory SET {set_clause} WHERE inventory_id=%s",
        list(fields.values()) + [inventory_id],
    )
    return {"ok": True}


@router.delete("/{inventory_id}")
async def delete_item(
    inventory_id: int,
    user=Depends(require_admin_or_farmer()),
):
    await ensure_row_access(user, "FeedInventory", "inventory_id", inventory_id)
    await execute("DELETE FROM FeedInventory WHERE inventory_id=%s", (inventory_id,))
    return {"ok": True}
