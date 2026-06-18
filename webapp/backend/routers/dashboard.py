from fastapi import APIRouter, Depends
from database import fetchall, fetchone
from rbac import require_any

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _safe(row: dict) -> dict:
    """Convert Decimal / datetime to JSON-safe types."""
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


@router.get("/summary")
async def get_summary(_=Depends(require_any())):
    # Farm info from DB (no hardcoded values)
    farm = await fetchone("SELECT * FROM Farm LIMIT 1")

    # Herd counts directly from Cows table (avoids view JOIN bug)
    herd = await fetchone(
        """
        SELECT
            COUNT(*)                                                             AS total_cows,
            SUM(CASE WHEN health_status = 'Healthy'          THEN 1 ELSE 0 END) AS healthy_cows,
            SUM(CASE WHEN health_status = 'Warning'          THEN 1 ELSE 0 END) AS warning_cows,
            SUM(CASE WHEN health_status = 'Critical'         THEN 1 ELSE 0 END) AS critical_cows,
            SUM(CASE WHEN health_status = 'Under Treatment'  THEN 1 ELSE 0 END) AS treatment_cows,
            SUM(CASE WHEN lactating = 1                      THEN 1 ELSE 0 END) AS lactating_cows
        FROM Cows
        WHERE is_active = 1
        """
    )

    # Latest environment reading
    env = await fetchone(
        "SELECT * FROM EnvironmentalReadings ORDER BY recorded_at DESC LIMIT 1"
    )

    # Latest average body temperature across cows (from today's readings)
    avg_temp = await fetchone(
        """
        SELECT AVG(t.body_temp_celsius) AS avg_body_temp
        FROM TemperatureReadings t
        WHERE DATE(t.recorded_at) = CURDATE()
        """
    )

    # Milk produced today (all sessions, all cows)
    milk_today = await fetchone(
        """
        SELECT
            COALESCE(SUM(milk_amount_liters), 0)   AS total_liters,
            COUNT(DISTINCT cow_id)                 AS cows_milked,
            COUNT(*)                               AS sessions
        FROM MilkProductionRecords
        WHERE DATE(recorded_at) = CURDATE()
        """
    )

    # Active alerts
    alerts = await fetchone(
        "SELECT COUNT(*) AS cnt FROM Alerts WHERE is_resolved = FALSE"
    )

    # Milk yesterday for trend comparison
    milk_yesterday = await fetchone(
        """
        SELECT COALESCE(SUM(milk_amount_liters), 0) AS total_liters
        FROM MilkProductionRecords
        WHERE DATE(recorded_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
        """
    )

    return {
        "farm":            _safe(farm),
        "herd":            _safe(herd),
        "environment":     _safe(env),
        "avg_body_temp":   float(avg_temp["avg_body_temp"]) if avg_temp and avg_temp["avg_body_temp"] else None,
        "milk_today":      _safe(milk_today),
        "milk_yesterday":  float(milk_yesterday["total_liters"]) if milk_yesterday else 0,
        "active_alerts":   int(alerts["cnt"]) if alerts else 0,
    }


@router.get("/recent-alerts")
async def get_recent_alerts(_=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT a.alert_id, a.alert_type, a.cow_id, a.severity,
               a.message, a.is_sent_sms, a.is_resolved,
               a.created_at, c.cow_name
        FROM Alerts a
        LEFT JOIN Cows c ON a.cow_id = c.cow_id
        WHERE a.is_resolved = FALSE
        ORDER BY
            FIELD(a.severity,'Emergency','Critical','Warning','Info'),
            a.created_at DESC
        LIMIT 10
        """
    )
    return [_safe(r) for r in rows]


@router.get("/milk-trend")
async def get_milk_trend(_=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT
            DATE(recorded_at)              AS milk_date,
            SUM(milk_amount_liters)        AS total_liters,
            COUNT(DISTINCT cow_id)         AS cows_milked,
            AVG(milk_amount_liters)        AS avg_liters_per_session
        FROM MilkProductionRecords
        WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(recorded_at)
        ORDER BY milk_date ASC
        """
    )
    return [_safe(r) for r in rows]


@router.get("/env-trend")
async def get_env_trend(_=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT
            DATE(recorded_at)          AS r_date,
            HOUR(recorded_at)          AS r_hour,
            AVG(temperature_celsius)   AS avg_temp,
            AVG(humidity_percent)      AS avg_hum,
            AVG(air_quality_ppm)       AS avg_aq,
            AVG(oxygen_percent)        AS avg_o2,
            MAX(temperature_celsius)   AS max_temp,
            MAX(air_quality_ppm)       AS max_aq
        FROM EnvironmentalReadings
        WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        GROUP BY DATE(recorded_at), HOUR(recorded_at)
        ORDER BY r_date ASC, r_hour ASC
        """
    )
    return [_safe(r) for r in rows]


@router.get("/system-logs")
async def get_system_logs(_=Depends(require_any())):
    rows = await fetchall(
        """
        SELECT log_id, device_type, device_id, action,
               value, trigger_reason, recorded_at
        FROM SystemControlLogs
        ORDER BY recorded_at DESC
        LIMIT 20
        """
    )
    return [_safe(r) for r in rows]


@router.get("/herd-health-trend")
async def herd_health_trend(_=Depends(require_any())):
    """Per-health-status cow counts, and per-breed breakdown — all from DB."""
    by_health = await fetchall(
        """
        SELECT health_status, COUNT(*) AS cnt
        FROM Cows WHERE is_active = 1
        GROUP BY health_status
        ORDER BY FIELD(health_status,'Healthy','Warning','Under Treatment','Critical')
        """
    )
    by_breed = await fetchall(
        """
        SELECT breed, COUNT(*) AS cnt,
               SUM(CASE WHEN health_status='Healthy' THEN 1 ELSE 0 END) AS healthy,
               AVG(weight_kg) AS avg_weight
        FROM Cows WHERE is_active = 1
        GROUP BY breed
        """
    )
    return {"by_health": [_safe(r) for r in by_health], "by_breed": [_safe(r) for r in by_breed]}
