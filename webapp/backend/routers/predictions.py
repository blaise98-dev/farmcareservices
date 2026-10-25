from fastapi import APIRouter, Depends
from database import fetchall, fetchone
from rbac import require_can_view_predictions, require_can_view_health_risks
from tenancy import ensure_cow_access, farm_clause

router = APIRouter(prefix="/api/predictions", tags=["predictions"])


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


@router.get("/")
async def list_predictions(user=Depends(require_can_view_predictions())):
    """Admin and Veterinarian can view the predictions of their farms."""
    where, args = farm_clause(user, "c.farm_id")
    rows = await fetchall(
        f"""
        SELECT p.*, c.cow_name, c.breed, c.health_status
        FROM PredictionsAnalytics p
        JOIN Cows c ON p.cow_id = c.cow_id
        WHERE {where}
        ORDER BY p.prediction_date ASC, p.confidence_percent DESC
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.get("/health-risks")
async def health_risks(user=Depends(require_can_view_health_risks())):
    """Only Admin and Veterinarian can access detailed health-risk predictions."""
    where, args = farm_clause(user, "c.farm_id")
    rows = await fetchall(
        f"""
        SELECT p.*, c.cow_name, c.health_status,
               t.body_temp_celsius AS latest_temp
        FROM PredictionsAnalytics p
        JOIN Cows c ON p.cow_id = c.cow_id
        LEFT JOIN TemperatureReadings t ON t.reading_id = (
                SELECT reading_id FROM TemperatureReadings WHERE cow_id = c.cow_id
                ORDER BY recorded_at DESC, reading_id DESC LIMIT 1
            )
        WHERE p.prediction_type = 'HealthRisk'
          AND p.predicted_value >= 50
          AND {where}
        ORDER BY p.predicted_value DESC
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.get("/milk-yield")
async def milk_yield_predictions(user=Depends(require_can_view_predictions())):
    """Admin and Veterinarian can view milk yield predictions."""
    where, args = farm_clause(user, "c.farm_id")
    rows = await fetchall(
        f"""
        SELECT p.*, c.cow_name
        FROM PredictionsAnalytics p
        JOIN Cows c ON p.cow_id = c.cow_id
        WHERE p.prediction_type = 'MilkYield' AND {where}
        ORDER BY p.prediction_date ASC, p.predicted_value DESC
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.get("/cow-report/{cow_id}")
async def cow_full_report(cow_id: int, user=Depends(require_can_view_predictions())):
    await ensure_cow_access(user, cow_id)
    cow = await fetchone(
        """
        SELECT c.*, TIMESTAMPDIFF(MONTH, c.birth_date, CURDATE()) AS age_months
        FROM Cows c WHERE c.cow_id = %s
        """,
        (cow_id,),
    )
    preds = await fetchall(
        "SELECT * FROM PredictionsAnalytics WHERE cow_id=%s ORDER BY prediction_date ASC",
        (cow_id,),
    )
    milk_7d = await fetchall(
        """
        SELECT DATE(recorded_at) AS d, SUM(milk_amount_liters) AS liters
        FROM MilkProductionRecords
        WHERE cow_id=%s AND recorded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(recorded_at) ORDER BY d ASC
        """,
        (cow_id,),
    )
    return {
        "cow":        _safe(cow) if cow else {},
        "predictions":[_safe(r) for r in preds],
        "milk_7day":  [_safe(r) for r in milk_7d],
    }
