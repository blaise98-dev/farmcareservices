from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import fetchall, fetchone, execute
from rbac import require_any, require_admin_or_farmer

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


class InventoryEntry(BaseModel):
    item_name: str
    category: Optional[str] = "Hay"
    quantity_kg: float
    dry_matter_pct: Optional[float] = 85.0
    crude_protein_pct: Optional[float] = 12.0
    unit_cost_rwf: Optional[float] = 0
    supplier: Optional[str] = None
    purchase_date: Optional[str] = None
    expiry_date: Optional[str] = None
    notes: Optional[str] = None


class InventoryUpdate(BaseModel):
    quantity_kg: Optional[float] = None
    dry_matter_pct: Optional[float] = None
    crude_protein_pct: Optional[float] = None
    unit_cost_rwf: Optional[float] = None
    supplier: Optional[str] = None
    expiry_date: Optional[str] = None
    notes: Optional[str] = None


@router.get("/")
async def list_inventory(_=Depends(require_any())):
    rows = await fetchall(
        "SELECT * FROM FeedInventory ORDER BY category, item_name"
    )
    return [_safe(r) for r in rows]


@router.get("/summary")
async def inventory_summary(_=Depends(require_any())):
    """Totals: dry matter (kg), crude protein (kg), total stock value."""
    row = await fetchone(
        """
        SELECT
            SUM(quantity_kg)             AS total_kg,
            SUM(quantity_kg * COALESCE(unit_cost_rwf, 0)) AS total_value_rwf,
            COUNT(*)                     AS item_count,
            SUM(CASE WHEN quantity_kg <= reorder_level_kg THEN 1 ELSE 0 END) AS low_stock_count
        FROM FeedInventory
        WHERE quantity_kg >= 0
        """
    )
    return _safe(row) if row else {}


@router.post("/")
async def add_item(
    body: InventoryEntry,
    current_user: dict = Depends(require_admin_or_farmer()),
):
    rid = await execute(
        """
        INSERT INTO FeedInventory
        (item_name, category, quantity_kg, dry_matter_pct, crude_protein_pct,
         unit_cost_rwf, supplier, purchase_date, expiry_date, notes, recorded_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (body.item_name, body.category, body.quantity_kg, body.dry_matter_pct,
         body.crude_protein_pct, body.unit_cost_rwf, body.supplier,
         body.purchase_date, body.expiry_date, body.notes,
         current_user["username"]),
    )
    return {"ok": True, "inventory_id": rid}


@router.patch("/{inventory_id}")
async def update_item(
    inventory_id: int,
    body: InventoryUpdate,
    current_user: dict = Depends(require_admin_or_farmer()),
):
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
    _=Depends(require_admin_or_farmer()),
):
    await execute("DELETE FROM FeedInventory WHERE inventory_id=%s", (inventory_id,))
    return {"ok": True}
