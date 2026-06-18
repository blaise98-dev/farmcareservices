from fastapi import APIRouter, Depends
from database import fetchall, fetchone
from rbac import require_can_view_economics

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
async def list_components(_=Depends(require_can_view_economics())):
    rows = await fetchall(
        "SELECT * FROM Components ORDER BY category, component_name"
    )
    return [_safe(r) for r in rows]


@router.get("/components/by-category")
async def by_category(_=Depends(require_can_view_economics())):
    rows = await fetchall(
        """
        SELECT category,
               COUNT(*) AS component_count,
               SUM(quantity) AS total_units,
               SUM(total_cost_rwf) AS total_cost_rwf
        FROM Components
        GROUP BY category WITH ROLLUP
        """
    )
    return rows


@router.get("/total-cost")
async def total_cost(_=Depends(require_can_view_economics())):
    row = await fetchone(
        "SELECT SUM(total_cost_rwf) AS total_rwf, COUNT(*) AS items FROM Components"
    )
    return _safe(row)


@router.get("/milk-revenue")
async def milk_revenue(price_per_liter: float = 400, _=Depends(require_can_view_economics())):
    rows = await fetchall(
        """
        SELECT DATE(recorded_at) AS milk_date,
               SUM(milk_amount_liters) AS total_liters,
               SUM(milk_amount_liters) * %s AS revenue_rwf
        FROM MilkProductionRecords
        WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY DATE(recorded_at)
        ORDER BY milk_date DESC
        """,
        (price_per_liter,),
    )
    monthly = await fetchone(
        """
        SELECT SUM(milk_amount_liters) AS total_liters,
               SUM(milk_amount_liters) * %s AS total_revenue_rwf
        FROM MilkProductionRecords
        WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        """,
        (price_per_liter,),
    )
    return {
        "daily": rows,
        "monthly_summary": _safe(monthly),
        "price_per_liter": price_per_liter,
    }


@router.get("/farm-info")
async def farm_info():
    """Public endpoint — used on Login page before authentication."""
    row = await fetchone("SELECT * FROM Farm LIMIT 1")
    return _safe(row)


@router.get("/summary")
async def economics_summary(_=Depends(require_can_view_economics())):
    """All financial KPIs in one call — no hardcoded values."""
    cost = await fetchone(
        "SELECT SUM(total_cost_rwf) AS total_cost_rwf, COUNT(*) AS component_count FROM Components"
    )
    operational = await fetchone(
        "SELECT COUNT(*) AS cnt FROM Components WHERE status='Operational'"
    )
    milk30 = await fetchone(
        """
        SELECT COALESCE(SUM(milk_amount_liters), 0) AS total_liters_30d,
               COALESCE(AVG(milk_amount_liters), 0) AS avg_liters_per_session
        FROM MilkProductionRecords
        WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        """
    )
    farm = await fetchone("SELECT * FROM Farm LIMIT 1")
    return {
        "farm":                   _safe(farm),
        "total_cost_rwf":         float(cost["total_cost_rwf"]) if cost and cost["total_cost_rwf"] else 0,
        "component_count":        int(cost["component_count"]) if cost else 0,
        "operational_components": int(operational["cnt"]) if operational else 0,
        "milk_30d_liters":        float(milk30["total_liters_30d"]) if milk30 else 0,
        "avg_liters_per_session": float(milk30["avg_liters_per_session"]) if milk30 else 0,
    }
