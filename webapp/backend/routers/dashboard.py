from fastapi import APIRouter, Depends
from database import fetchall, fetchone
from rbac import require_any
from tenancy import cow_clause, farm_clause

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
async def get_summary(user=Depends(require_any())):
    # Farm info from DB (no hardcoded values); an Admin gets the first farm
    fw, fa = farm_clause(user)
    farm = await fetchone(f"SELECT * FROM Farm WHERE {fw} ORDER BY farm_id LIMIT 1", fa)
    cw, ca = cow_clause(user)

    # Herd counts directly from Cows table (avoids view JOIN bug)
    herd = await fetchone(
        f"""
        SELECT
            COUNT(*)                                                             AS total_cows,
            SUM(CASE WHEN health_status = 'Healthy'          THEN 1 ELSE 0 END) AS healthy_cows,
            SUM(CASE WHEN health_status = 'Warning'          THEN 1 ELSE 0 END) AS warning_cows,
            SUM(CASE WHEN health_status = 'Critical'         THEN 1 ELSE 0 END) AS critical_cows,
            SUM(CASE WHEN health_status = 'Under Treatment'  THEN 1 ELSE 0 END) AS treatment_cows,
            SUM(CASE WHEN lactating = 1                      THEN 1 ELSE 0 END) AS lactating_cows
        FROM Cows
        WHERE is_active = 1 AND {fw}
        """,
        fa,
    )

    # Latest environment reading
    env = await fetchone(
        f"SELECT * FROM EnvironmentalReadings WHERE {fw} ORDER BY recorded_at DESC LIMIT 1",
        fa,
    )

    # Latest average body temperature across cows (from today's readings)
    tw, ta = cow_clause(user, "t.cow_id")
    avg_temp = await fetchone(
        f"""
        SELECT AVG(t.body_temp_celsius) AS avg_body_temp
        FROM TemperatureReadings t
        WHERE DATE(t.recorded_at) = CURDATE() AND {tw}
        """,
        ta,
    )

    # Milk produced today (all sessions, all cows)
    milk_today = await fetchone(
        f"""
        SELECT
            COALESCE(SUM(milk_amount_liters), 0)   AS total_liters,
            COUNT(DISTINCT cow_id)                 AS cows_milked,
            COUNT(*)                               AS sessions
        FROM MilkProductionRecords
        WHERE DATE(recorded_at) = CURDATE() AND {cw}
        """,
        ca,
    )

    # Active alerts
    alerts = await fetchone(
        f"SELECT COUNT(*) AS cnt FROM Alerts WHERE is_resolved = FALSE AND {fw}",
        fa,
    )

    # Milk yesterday for trend comparison
    milk_yesterday = await fetchone(
        f"""
        SELECT COALESCE(SUM(milk_amount_liters), 0) AS total_liters
        FROM MilkProductionRecords
        WHERE DATE(recorded_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND {cw}
        """,
        ca,
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
async def get_recent_alerts(user=Depends(require_any())):
    where, args = farm_clause(user, "a.farm_id")
    rows = await fetchall(
        f"""
        SELECT a.alert_id, a.alert_type, a.cow_id, a.severity,
               a.message, a.is_sent_sms, a.is_resolved,
               a.created_at, c.cow_name
        FROM Alerts a
        LEFT JOIN Cows c ON a.cow_id = c.cow_id
        WHERE a.is_resolved = FALSE AND {where}
        ORDER BY
            FIELD(a.severity,'Emergency','Critical','Warning','Info'),
            a.created_at DESC
        LIMIT 10
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.get("/milk-trend")
async def get_milk_trend(user=Depends(require_any())):
    where, args = cow_clause(user)
    rows = await fetchall(
        f"""
        SELECT
            DATE(recorded_at)              AS milk_date,
            SUM(milk_amount_liters)        AS total_liters,
            COUNT(DISTINCT cow_id)         AS cows_milked,
            AVG(milk_amount_liters)        AS avg_liters_per_session
        FROM MilkProductionRecords
        WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND {where}
        GROUP BY DATE(recorded_at)
        ORDER BY milk_date ASC
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.get("/env-trend")
async def get_env_trend(user=Depends(require_any())):
    where, args = farm_clause(user)
    rows = await fetchall(
        f"""
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
        WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND {where}
        GROUP BY DATE(recorded_at), HOUR(recorded_at)
        ORDER BY r_date ASC, r_hour ASC
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.get("/system-logs")
async def get_system_logs(user=Depends(require_any())):
    where, args = farm_clause(user)
    rows = await fetchall(
        f"""
        SELECT log_id, device_type, device_id, action,
               value, trigger_reason, recorded_at
        FROM SystemControlLogs
        WHERE {where}
        ORDER BY recorded_at DESC
        LIMIT 20
        """,
        args,
    )
    return [_safe(r) for r in rows]


@router.get("/herd-health-trend")
async def herd_health_trend(user=Depends(require_any())):
    """Per-health-status cow counts, and per-breed breakdown: all from DB."""
    where, args = farm_clause(user)
    by_health = await fetchall(
        f"""
        SELECT health_status, COUNT(*) AS cnt
        FROM Cows WHERE is_active = 1 AND {where}
        GROUP BY health_status
        ORDER BY FIELD(health_status,'Healthy','Warning','Under Treatment','Critical')
        """,
        args,
    )
    by_breed = await fetchall(
        f"""
        SELECT breed, COUNT(*) AS cnt,
               SUM(CASE WHEN health_status='Healthy' THEN 1 ELSE 0 END) AS healthy,
               AVG(weight_kg) AS avg_weight
        FROM Cows WHERE is_active = 1 AND {where}
        GROUP BY breed
        """,
        args,
    )
    return {"by_health": [_safe(r) for r in by_health], "by_breed": [_safe(r) for r in by_breed]}
