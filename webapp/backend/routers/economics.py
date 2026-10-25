from fastapi import APIRouter, Depends
from database import fetchall, fetchone
from rbac import require_can_view_economics
from tenancy import cow_clause, farm_clause

router = APIRouter(prefix="/api/economics", tags=["economics"])


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


@router.get("/components")
async def list_components(user=Depends(require_can_view_economics())):
    where, args = farm_clause(user)
    rows = await fetchall(
        f"SELECT * FROM Components WHERE {where} ORDER BY category, component_name",
        args,
    )
    return [_safe(r) for r in rows]


@router.get("/components/by-category")
async def by_category(user=Depends(require_can_view_economics())):
    where, args = farm_clause(user)
    rows = await fetchall(
        f"""
        SELECT category,
               COUNT(*) AS component_count,
               SUM(quantity) AS total_units,
               SUM(total_cost_rwf) AS total_cost_rwf
        FROM Components
        WHERE {where}
        GROUP BY category WITH ROLLUP
        """,
        args,
    )
    return rows


@router.get("/total-cost")
async def total_cost(user=Depends(require_can_view_economics())):
    where, args = farm_clause(user)
    row = await fetchone(
        f"SELECT SUM(total_cost_rwf) AS total_rwf, COUNT(*) AS items FROM Components WHERE {where}",
        args,
    )
    return _safe(row)


@router.get("/milk-revenue")
async def milk_revenue(price_per_liter: float = 400, user=Depends(require_can_view_economics())):
    where, args = cow_clause(user)
    rows = await fetchall(
        f"""
        SELECT DATE(recorded_at) AS milk_date,
               SUM(milk_amount_liters) AS total_liters,
               SUM(milk_amount_liters) * %s AS revenue_rwf
        FROM MilkProductionRecords
        WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND {where}
        GROUP BY DATE(recorded_at)
        ORDER BY milk_date DESC
        """,
        (price_per_liter, *args),
    )
    monthly = await fetchone(
        f"""
        SELECT SUM(milk_amount_liters) AS total_liters,
               SUM(milk_amount_liters) * %s AS total_revenue_rwf
        FROM MilkProductionRecords
        WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND {where}
        """,
        (price_per_liter, *args),
    )
    return {
        "daily": rows,
        "monthly_summary": _safe(monthly),
        "price_per_liter": price_per_liter,
    }


@router.get("/farm-info")
async def farm_info():
    """Public endpoint: used on Login page before authentication.

    It cannot know the user, so it keeps returning the first farm.
    """
    row = await fetchone("SELECT * FROM Farm ORDER BY farm_id LIMIT 1")
    return _safe(row)


@router.get("/summary")
async def economics_summary(user=Depends(require_can_view_economics())):
    """All financial KPIs in one call: no hardcoded values."""
    fw, fa = farm_clause(user)
    cw, ca = cow_clause(user)
    cost = await fetchone(
        f"SELECT SUM(total_cost_rwf) AS total_cost_rwf, COUNT(*) AS component_count FROM Components WHERE {fw}",
        fa,
    )
    operational = await fetchone(
        f"SELECT COUNT(*) AS cnt FROM Components WHERE status='Operational' AND {fw}",
        fa,
    )
    milk30 = await fetchone(
        f"""
        SELECT COALESCE(SUM(milk_amount_liters), 0) AS total_liters_30d,
               COALESCE(AVG(milk_amount_liters), 0) AS avg_liters_per_session
        FROM MilkProductionRecords
        WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND {cw}
        """,
        ca,
    )
    # The user's own farm; an Admin gets the first farm
    farm = await fetchone(f"SELECT * FROM Farm WHERE {fw} ORDER BY farm_id LIMIT 1", fa)
    return {
        "farm":                   _safe(farm),
        "total_cost_rwf":         float(cost["total_cost_rwf"]) if cost and cost["total_cost_rwf"] else 0,
        "component_count":        int(cost["component_count"]) if cost else 0,
        "operational_components": int(operational["cnt"]) if operational else 0,
        "milk_30d_liters":        float(milk30["total_liters_30d"]) if milk30 else 0,
        "avg_liters_per_session": float(milk30["avg_liters_per_session"]) if milk30 else 0,
    }
