"""
Barn / House Monitor: the full snapshot the ESP32 barn node posts every 10 s
(climate, both gas sensors, water tank, feed weight, actuator states), its
history, and feed eaten per day worked out from the load cell. Each view shows
one farm's barn node; an Admin picks the farm with ?farm_id=.
"""
from collections import OrderedDict
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query

from database import fetchall, fetchone
from farm_config import ONLINE_SECONDS, db_now, seconds_since
from periods import bucketed_series, period_days
from rbac import require_any
from tenancy import view_farm

router = APIRouter(prefix="/api/barn", tags=["barn"])

FEED_NOISE_KG = 0.05     # smaller changes are load-cell noise
FEED_MAX_DROP_KG = 15.0  # bigger single drops are someone emptying the feeder, not cows eating


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


def feed_consumed(weights: list[float]) -> float:
    """Sum of weight drops between consecutive readings; refills (rises) are ignored."""
    eaten = 0.0
    prev = None
    for w in weights:
        if w is None:
            continue
        if prev is not None:
            drop = prev - w
            if FEED_NOISE_KG <= drop <= FEED_MAX_DROP_KG:
                eaten += drop
        prev = w
    return round(eaten, 2)


async def _barn_device(user: dict, farm_id: Optional[int]) -> Optional[dict]:
    farm = await view_farm(user, farm_id)
    if farm is None:
        return None
    return await fetchone(
        "SELECT * FROM IoTDevices WHERE role = 'barn' AND farm_id = %s ORDER BY last_seen DESC LIMIT 1",
        (farm,),
    )


@router.get("/latest")
async def latest(farm_id: Optional[int] = Query(None), user=Depends(require_any())):
    dev = await _barn_device(user, farm_id)
    row = None
    if dev:
        row = await fetchone(
            "SELECT * FROM SensorReadings WHERE device_id = %s ORDER BY recorded_at DESC LIMIT 1", (dev["device_id"],)
        )
    age = seconds_since(await db_now(), (dev or {}).get("last_seen"))
    online = age is not None and age <= ONLINE_SECONDS
    return {"device_id": (dev or {}).get("device_id"), "device_label": (dev or {}).get("label") or "Barn Monitor",
            "online": online, "reading": _safe(row)}


@router.get("/history")
async def history(hours: int = 24, farm_id: Optional[int] = Query(None), user=Depends(require_any())):
    """Readings over the last `hours`, or since the first reading when hours=0."""
    dev = await _barn_device(user, farm_id)
    if not dev:
        return []
    rows = await bucketed_series(
        "SensorReadings", "recorded_at",
        ["temperature", "humidity", "mq5_pct", "mq135_pct", "tank_level", "feed_weight"],
        ["pump_status", "fan_status", "spray_status", "buzzer_status"],
        "device_id = %s", (dev["device_id"],), hours,
    )
    return [_safe(r) for r in rows]


async def _daily_feed(device_id: str, since_day) -> list:
    """[(day, kg eaten)] from load-cell drops within each day, oldest first.

    MySQL 8 does it with LAG(); older servers fall back to reading every weight.
    """
    cond, args = ("AND recorded_at >= %s", (since_day,)) if since_day else ("", ())
    try:
        rows = await fetchall(
            f"""
            SELECT day, SUM(CASE WHEN fell BETWEEN %s AND %s THEN fell ELSE 0 END) AS eaten
            FROM (
                SELECT DATE(recorded_at) AS day,
                       LAG(feed_weight) OVER (PARTITION BY DATE(recorded_at) ORDER BY recorded_at, reading_id) - feed_weight AS fell
                FROM SensorReadings
                WHERE device_id = %s AND feed_weight IS NOT NULL {cond}
            ) drops
            GROUP BY day ORDER BY day
            """,
            (FEED_NOISE_KG, FEED_MAX_DROP_KG, device_id, *args),
        )
        return [(r["day"].isoformat(), round(float(r["eaten"] or 0), 2)) for r in rows]
    except Exception:  # noqa: BLE001 - no window functions before MySQL 8
        rows = await fetchall(
            f"""
            SELECT DATE(recorded_at) AS day, feed_weight FROM SensorReadings
            WHERE device_id = %s AND feed_weight IS NOT NULL {cond}
            ORDER BY recorded_at ASC
            """,
            (device_id, *args),
        )
        by_day: "OrderedDict[str, list]" = OrderedDict()
        for r in rows:
            by_day.setdefault(r["day"].isoformat(), []).append(float(r["feed_weight"]))
        return [(d, feed_consumed(ws)) for d, ws in by_day.items()]


@router.get("/feed-intake")
async def feed_intake(days: int = 30, farm_id: Optional[int] = Query(None), user=Depends(require_any())):
    """Feed eaten per day (kg) over the last `days`, or all time when days=0.

    "today" and "this month" are always complete, whatever period is chosen.
    """
    days = period_days(days)
    dev = await _barn_device(user, farm_id)
    now = await db_now()
    today, month_start = now.date(), now.date().replace(day=1)
    daily = []
    if dev:
        since = None if not days else min(today - timedelta(days=days - 1), month_start)
        daily = await _daily_feed(dev["device_id"], since)
    shown_from = None if not days else (today - timedelta(days=days - 1)).isoformat()
    return {
        "daily": [{"day": d, "eaten_kg": kg} for d, kg in daily if not shown_from or d >= shown_from],
        "today_kg": next((kg for d, kg in daily if d == today.isoformat()), 0.0),
        "month_kg": round(sum(kg for d, kg in daily if d >= month_start.isoformat()), 2),
    }
