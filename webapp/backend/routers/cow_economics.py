"""
Cow-level economics: lifetime costs and revenues per cow.
- Farmer: feed, treatment, labour, transport, insemination costs; milk, offspring, manure, sale revenues
- Veterinarian: medicine/procedure costs; veterinary fee revenues (what they charged)
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from database import fetchall, fetchone, execute
from rbac import require_any, require_admin_or_farmer

router = APIRouter(prefix="/api/cow-economics", tags=["cow_economics"])


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


class CostEntry(BaseModel):
    cow_id: int
    cost_date: str
    cost_category: str = Field(..., max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    amount_rwf: float = Field(..., ge=0, le=100_000_000)


class RevenueEntry(BaseModel):
    cow_id: int
    revenue_date: str
    revenue_category: str = Field(..., max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    amount_rwf: float = Field(..., ge=0, le=100_000_000)
    quantity: Optional[float] = Field(None, ge=0)
    unit: Optional[str] = Field(None, max_length=50)


# ── Summary per cow ───────────────────────────────────────────────────────────

@router.get("/summary")
async def economics_summary(_=Depends(require_any())):
    """Lifetime P&L summary per cow — total costs, revenues, profit."""
    rows = await fetchall(
        """
        SELECT
            c.cow_id, c.cow_name, c.rfid_tag, c.breed, c.cow_stage,
            c.sex, c.birth_date, c.is_active, c.health_status,
            TIMESTAMPDIFF(MONTH, c.birth_date, CURDATE()) AS age_months,
            COALESCE(cc.total_costs, 0)    AS total_costs_rwf,
            COALESCE(cr.total_revenues, 0) AS total_revenues_rwf,
            COALESCE(cr.total_revenues, 0) - COALESCE(cc.total_costs, 0) AS net_profit_rwf,
            COALESCE(milk_r.milk_revenue, 0) AS milk_revenue_rwf,
            COALESCE(cc.feed_cost, 0)      AS feed_cost_rwf,
            COALESCE(cc.treat_cost, 0)     AS treatment_cost_rwf,
            COALESCE(cc.med_cost, 0)       AS medicine_cost_rwf
        FROM Cows c
        LEFT JOIN (
            SELECT cow_id,
                SUM(amount_rwf) AS total_costs,
                SUM(CASE WHEN cost_category='Feed' THEN amount_rwf ELSE 0 END) AS feed_cost,
                SUM(CASE WHEN cost_category IN ('Treatment','Medicine','Veterinary Fee','Vaccination') THEN amount_rwf ELSE 0 END) AS treat_cost,
                SUM(CASE WHEN cost_category='Medicine' THEN amount_rwf ELSE 0 END) AS med_cost
            FROM CowCosts GROUP BY cow_id
        ) cc ON c.cow_id = cc.cow_id
        LEFT JOIN (
            SELECT cow_id,
                SUM(amount_rwf) AS total_revenues,
                SUM(CASE WHEN revenue_category='Milk Sale' THEN amount_rwf ELSE 0 END) AS milk_revenue
            FROM CowRevenues GROUP BY cow_id
        ) cr ON c.cow_id = cr.cow_id
        LEFT JOIN (
            SELECT cow_id, SUM(milk_amount_liters * 400) AS milk_revenue
            FROM MilkProductionRecords GROUP BY cow_id
        ) milk_r ON c.cow_id = milk_r.cow_id
        ORDER BY net_profit_rwf DESC
        """
    )
    return [_safe(r) for r in rows]


@router.get("/cow/{cow_id}")
async def cow_detail(cow_id: int, _=Depends(require_any())):
    """Full cost + revenue breakdown for one cow."""
    cow = await fetchone(
        """
        SELECT c.*, TIMESTAMPDIFF(MONTH, c.birth_date, CURDATE()) AS age_months
        FROM Cows c WHERE c.cow_id = %s
        """,
        (cow_id,),
    )
    if not cow:
        raise HTTPException(404, "Cow not found")

    costs = await fetchall(
        "SELECT * FROM CowCosts WHERE cow_id=%s ORDER BY cost_date DESC",
        (cow_id,),
    )
    revenues = await fetchall(
        "SELECT * FROM CowRevenues WHERE cow_id=%s ORDER BY revenue_date DESC",
        (cow_id,),
    )

    # Aggregated milk revenue from MilkProductionRecords
    milk = await fetchone(
        """
        SELECT SUM(milk_amount_liters) AS total_liters,
               SUM(milk_amount_liters * COALESCE(price_per_liter_rwf, 400)) AS est_revenue
        FROM MilkProductionRecords WHERE cow_id=%s
        """,
        (cow_id,),
    )

    # Timeline: costs + revenues merged by month
    timeline = await fetchall(
        """
        SELECT ym, SUM(costs) AS costs, SUM(revenues) AS revenues
        FROM (
            SELECT DATE_FORMAT(cost_date,'%Y-%m') AS ym, SUM(amount_rwf) AS costs, 0 AS revenues
            FROM CowCosts WHERE cow_id=%s GROUP BY ym
            UNION ALL
            SELECT DATE_FORMAT(revenue_date,'%Y-%m') AS ym, 0 AS costs, SUM(amount_rwf) AS revenues
            FROM CowRevenues WHERE cow_id=%s GROUP BY ym
        ) t
        GROUP BY ym ORDER BY ym
        """,
        (cow_id, cow_id),
    )

    # Category breakdown
    cost_by_cat = await fetchall(
        "SELECT cost_category, SUM(amount_rwf) AS total FROM CowCosts WHERE cow_id=%s GROUP BY cost_category ORDER BY total DESC",
        (cow_id,),
    )
    rev_by_cat = await fetchall(
        "SELECT revenue_category, SUM(amount_rwf) AS total FROM CowRevenues WHERE cow_id=%s GROUP BY revenue_category ORDER BY total DESC",
        (cow_id,),
    )

    return {
        "cow":           _safe(cow),
        "costs":         [_safe(r) for r in costs],
        "revenues":      [_safe(r) for r in revenues],
        "milk_summary":  _safe(milk) if milk else {},
        "timeline":      [_safe(r) for r in timeline],
        "cost_by_cat":   [_safe(r) for r in cost_by_cat],
        "rev_by_cat":    [_safe(r) for r in rev_by_cat],
    }


@router.get("/fleet")
async def fleet_overview(_=Depends(require_any())):
    """Aggregated fleet-level analytics for the executive dashboard."""
    total = await fetchone(
        """
        SELECT
            COALESCE(SUM(cc.amount_rwf),0) AS total_costs,
            COALESCE(SUM(cr.amount_rwf),0) AS total_revenues,
            COALESCE(SUM(cr.amount_rwf),0) - COALESCE(SUM(cc.amount_rwf),0) AS net_profit
        FROM (SELECT 1) dummy
        LEFT JOIN CowCosts cc ON TRUE
        LEFT JOIN CowRevenues cr ON TRUE
        """
    )

    by_cost_cat = await fetchall(
        "SELECT cost_category, SUM(amount_rwf) AS total FROM CowCosts GROUP BY cost_category ORDER BY total DESC"
    )
    by_rev_cat = await fetchall(
        "SELECT revenue_category, SUM(amount_rwf) AS total FROM CowRevenues GROUP BY revenue_category ORDER BY total DESC"
    )
    monthly = await fetchall(
        """
        SELECT ym, SUM(costs) AS costs, SUM(revenues) AS revenues,
               SUM(revenues) - SUM(costs) AS net
        FROM (
            SELECT DATE_FORMAT(cost_date,'%Y-%m') AS ym, SUM(amount_rwf) AS costs, 0 AS revenues
            FROM CowCosts GROUP BY ym
            UNION ALL
            SELECT DATE_FORMAT(revenue_date,'%Y-%m') AS ym, 0 AS costs, SUM(amount_rwf) AS revenues
            FROM CowRevenues GROUP BY ym
        ) t GROUP BY ym ORDER BY ym
        """
    )
    top_profit = await fetchall(
        """
        SELECT c.cow_id, c.cow_name, c.breed, c.cow_stage,
               COALESCE(cr.rev,0) - COALESCE(cc.cost,0) AS net_profit
        FROM Cows c
        LEFT JOIN (SELECT cow_id, SUM(amount_rwf) AS cost FROM CowCosts GROUP BY cow_id) cc ON c.cow_id=cc.cow_id
        LEFT JOIN (SELECT cow_id, SUM(amount_rwf) AS rev FROM CowRevenues GROUP BY cow_id) cr ON c.cow_id=cr.cow_id
        WHERE c.is_active=TRUE
        ORDER BY net_profit DESC LIMIT 10
        """
    )
    return {
        "total":        _safe(total) if total else {},
        "by_cost_cat":  [_safe(r) for r in by_cost_cat],
        "by_rev_cat":   [_safe(r) for r in by_rev_cat],
        "monthly":      [_safe(r) for r in monthly],
        "top_profit":   [_safe(r) for r in top_profit],
    }


# ── Write endpoints ───────────────────────────────────────────────────────────

@router.post("/costs")
async def add_cost(body: CostEntry, current_user: dict = Depends(require_any())):
    rid = await execute(
        """
        INSERT INTO CowCosts (cow_id, cost_date, cost_category, description, amount_rwf, recorded_by, role_type)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
        """,
        (body.cow_id, body.cost_date, body.cost_category, body.description,
         body.amount_rwf, current_user["username"], current_user["role"]),
    )
    return {"ok": True, "cost_id": rid}


@router.post("/revenues")
async def add_revenue(body: RevenueEntry, current_user: dict = Depends(require_any())):
    rid = await execute(
        """
        INSERT INTO CowRevenues (cow_id, revenue_date, revenue_category, description, amount_rwf, quantity, unit, recorded_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (body.cow_id, body.revenue_date, body.revenue_category, body.description,
         body.amount_rwf, body.quantity, body.unit, current_user["username"]),
    )
    return {"ok": True, "revenue_id": rid}


@router.delete("/costs/{cost_id}")
async def delete_cost(cost_id: int, current_user: dict = Depends(require_admin_or_farmer())):
    row = await fetchone("SELECT cost_id FROM CowCosts WHERE cost_id=%s", (cost_id,))
    if not row:
        raise HTTPException(404, "Cost record not found")
    await execute("DELETE FROM CowCosts WHERE cost_id=%s", (cost_id,))
    return {"ok": True}


@router.delete("/revenues/{revenue_id}")
async def delete_revenue(revenue_id: int, current_user: dict = Depends(require_admin_or_farmer())):
    row = await fetchone("SELECT revenue_id FROM CowRevenues WHERE revenue_id=%s", (revenue_id,))
    if not row:
        raise HTTPException(404, "Revenue record not found")
    await execute("DELETE FROM CowRevenues WHERE revenue_id=%s", (revenue_id,))
    return {"ok": True}
