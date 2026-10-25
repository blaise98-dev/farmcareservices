"""
Barn / House Monitor: the full snapshot the ESP32 barn node posts every 10 s
(climate, both gas sensors, water tank, feed weight, actuator states), its
history, and feed eaten per day worked out from the load cell. Each view shows
one farm's barn node; an Admin picks the farm with ?farm_id=.
"""
from collections import OrderedDict
from typing import Optional

from fastapi import APIRouter, Depends, Query

from database import fetchall, fetchone
from farm_config import ONLINE_SECONDS, db_now, seconds_since
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
    hours = min(max(hours, 1), 168)
    dev = await _barn_device(user, farm_id)
    if not dev:
        return []
    rows = await fetchall(
        """
        SELECT recorded_at, temperature, humidity, mq5_pct, mq135_pct, tank_level, feed_weight,
               pump_status, fan_status, spray_status, buzzer_status
        FROM SensorReadings
        WHERE device_id = %s AND recorded_at >= NOW() - INTERVAL %s HOUR
        ORDER BY recorded_at ASC
        """,
        (dev["device_id"], hours),
    )
    # Thin long ranges to at most ~400 points so the charts stay fast.
    step = max(1, len(rows) // 400)
    return [_safe(r) for r in rows[::step]]


@router.get("/feed-intake")
async def feed_intake(days: int = 30, farm_id: Optional[int] = Query(None), user=Depends(require_any())):
    """Feed eaten per day (kg), from the load-cell readings."""
    days = min(max(days, 1), 90)
    dev = await _barn_device(user, farm_id)
    rows = []
    if dev:
        rows = await fetchall(
            """
            SELECT DATE(recorded_at) AS day, feed_weight
            FROM SensorReadings
            WHERE device_id = %s AND recorded_at >= CURDATE() - INTERVAL %s DAY AND feed_weight IS NOT NULL
            ORDER BY recorded_at ASC
            """,
            (dev["device_id"], days - 1),
        )
    by_day: "OrderedDict[str, list]" = OrderedDict()
    for r in rows:
        by_day.setdefault(r["day"].isoformat(), []).append(float(r["feed_weight"]))
    daily = [{"day": d, "eaten_kg": feed_consumed(ws)} for d, ws in by_day.items()]
    today = (await db_now()).date().isoformat()
    month = today[:7]
    return {
        "daily": daily,
        "today_kg": next((x["eaten_kg"] for x in daily if x["day"] == today), 0.0),
        "month_kg": round(sum(x["eaten_kg"] for x in daily if x["day"].startswith(month)), 2),
    }
