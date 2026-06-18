"""
Admin-only router — activity logs, user activity, platform reports, alert history.
All endpoints require Admin role.
"""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from database import fetchall, fetchone
from rbac import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


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


@router.get("/activity-logs")
async def activity_logs(
    limit: int = 100,
    _=Depends(require_admin()),
):
    """System control logs — device actions, triggers, timestamps."""
    rows = await fetchall(
        """
        SELECT log_id, device_type, device_id, action,
               value, trigger_reason, recorded_at
        FROM SystemControlLogs
        ORDER BY recorded_at DESC
        LIMIT %s
        """,
        (limit,),
    )
    return [_safe(r) for r in rows]


@router.get("/user-activity")
async def user_activity(_=Depends(require_admin())):
    """Last login per user, login frequency, active users."""
    rows = await fetchall(
        """
        SELECT user_id, username, full_name, role, is_active,
               last_login,
               CASE WHEN last_login >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                    THEN 'Recent' ELSE 'Inactive' END AS activity_status
        FROM Users
        ORDER BY last_login DESC
        """
    )
    return [_safe(r) for r in rows]


@router.get("/platform-report")
async def platform_report(_=Depends(require_admin())):
    """Comprehensive platform stats — all from DB, zero hardcoded values."""
    # Herd
    herd = await fetchone(
        """
        SELECT COUNT(*) AS total_cows,
               SUM(CASE WHEN health_status='Healthy' THEN 1 ELSE 0 END) AS healthy_cows,
               SUM(CASE WHEN health_status='Warning'  THEN 1 ELSE 0 END) AS warning_cows,
               SUM(CASE WHEN health_status='Critical' THEN 1 ELSE 0 END) AS critical_cows,
               SUM(CASE WHEN lactating=1 THEN 1 ELSE 0 END) AS lactating_cows
        FROM Cows WHERE is_active=1
        """
    )

    # Milk 30d
    milk30 = await fetchone(
        """
        SELECT COALESCE(SUM(milk_amount_liters), 0) AS total_liters_30d,
               COALESCE(AVG(milk_amount_liters), 0) AS avg_liters_per_session,
               COUNT(*) AS total_sessions
        FROM MilkProductionRecords
        WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        """
    )

    # Alerts
    alerts_total = await fetchone(
        "SELECT COUNT(*) AS total FROM Alerts WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)"
    )
    alerts_resolved = await fetchone(
        "SELECT COUNT(*) AS resolved FROM Alerts WHERE is_resolved=TRUE AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)"
    )
    alerts_active = await fetchone(
        "SELECT COUNT(*) AS active FROM Alerts WHERE is_resolved=FALSE"
    )

    # Users
    users_total = await fetchone("SELECT COUNT(*) AS total FROM Users")
    users_active = await fetchone("SELECT COUNT(*) AS active FROM Users WHERE is_active=TRUE")
    recent_logins = await fetchone(
        "SELECT COUNT(*) AS cnt FROM Users WHERE last_login >= DATE_SUB(NOW(), INTERVAL 7 DAY)"
    )

    # Components
    components_total = await fetchone("SELECT COUNT(*) AS total FROM Components")
    components_operational = await fetchone(
        "SELECT COUNT(*) AS operational FROM Components WHERE status='Operational'"
    )
    total_cost = await fetchone(
        "SELECT COALESCE(SUM(total_cost_rwf), 0) AS total_cost_rwf FROM Components"
    )

    # Farm info
    farm = await fetchone("SELECT * FROM Farm LIMIT 1")

    total = int(alerts_total["total"]) if alerts_total else 0
    resolved = int(alerts_resolved["resolved"]) if alerts_resolved else 0
    resolved_pct = round((resolved / total * 100), 1) if total > 0 else 0.0

    return {
        "farm":                     _safe(farm),
        "herd": {
            "total_cows":           int(herd["total_cows"]) if herd else 0,
            "healthy_cows":         int(herd["healthy_cows"] or 0) if herd else 0,
            "warning_cows":         int(herd["warning_cows"] or 0) if herd else 0,
            "critical_cows":        int(herd["critical_cows"] or 0) if herd else 0,
            "lactating_cows":       int(herd["lactating_cows"] or 0) if herd else 0,
        },
        "milk_30d": {
            "total_liters":         float(milk30["total_liters_30d"]) if milk30 else 0,
            "avg_liters_per_session": float(milk30["avg_liters_per_session"]) if milk30 else 0,
            "total_sessions":       int(milk30["total_sessions"]) if milk30 else 0,
        },
        "alerts": {
            "total_30d":            total,
            "resolved_30d":         resolved,
            "resolved_pct":         resolved_pct,
            "active_alerts":        int(alerts_active["active"]) if alerts_active else 0,
        },
        "users": {
            "total":                int(users_total["total"]) if users_total else 0,
            "active":               int(users_active["active"]) if users_active else 0,
            "recent_7d":            int(recent_logins["cnt"]) if recent_logins else 0,
        },
        "components": {
            "total":                int(components_total["total"]) if components_total else 0,
            "operational":          int(components_operational["operational"]) if components_operational else 0,
            "total_cost_rwf":       float(total_cost["total_cost_rwf"]) if total_cost else 0,
        },
    }


@router.get("/alert-history")
async def alert_history(
    days: int = 30,
    alert_type: Optional[str] = None,
    severity: Optional[str] = None,
    _=Depends(require_admin()),
):
    """All alerts with cow names; supports date-range and type/severity filters."""
    conditions = ["a.created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)"]
    params = [days]

    if alert_type:
        conditions.append("a.alert_type = %s")
        params.append(alert_type)
    if severity:
        conditions.append("a.severity = %s")
        params.append(severity)

    where = " AND ".join(conditions)
    rows = await fetchall(
        f"""
        SELECT a.alert_id, a.alert_type, a.severity, a.message,
               a.is_resolved, a.resolved_at, a.created_at,
               c.cow_name, c.breed
        FROM Alerts a
        LEFT JOIN Cows c ON a.cow_id = c.cow_id
        WHERE {where}
        ORDER BY
            FIELD(a.severity,'Emergency','Critical','Warning','Info'),
            a.created_at DESC
        LIMIT 500
        """,
        params,
    )
    return [_safe(r) for r in rows]
