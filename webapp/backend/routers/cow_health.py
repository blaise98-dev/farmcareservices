"""
Cow Health & Tracking: live collar vitals for every cow wearing one, a risk
score against each cow's own 14-day baseline, the "Needs Attention" list, and
live GPS positions with the farm boundary. Shows one farm at a time; an Admin
picks the farm with ?farm_id=.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query

from database import fetchall, fetchone
from farm_config import ONLINE_SECONDS, as_float, db_now, get_settings, seconds_since
from health_risk import BASELINE_DAYS, distance_m, score_cow
from rbac import require_any
from tenancy import ensure_cow_access, view_farm

router = APIRouter(prefix="/api/cow-health", tags=["cow_health"])
ACTIVE_DAYS = 7          # cows with collar data in the last week appear on the page


def _iso(v):
    return v.isoformat() if hasattr(v, "isoformat") else v


def _num(v):
    return float(v) if v is not None else None


async def _cow_snapshot(cow: dict, s: dict, now) -> dict:
    cid = cow["cow_id"]
    vit = await fetchone(
        "SELECT * FROM VitalsReadings WHERE cow_id = %s ORDER BY recorded_at DESC LIMIT 1", (cid,))
    temp = await fetchone(
        "SELECT body_temp_celsius, recorded_at FROM TemperatureReadings WHERE cow_id = %s ORDER BY recorded_at DESC LIMIT 1",
        (cid,))
    mot = await fetchone(
        "SELECT is_moving, recorded_at FROM MotionReadings WHERE cow_id = %s ORDER BY recorded_at DESC LIMIT 1", (cid,))
    loc = await fetchone(
        "SELECT latitude, longitude, recorded_at FROM LocationReadings WHERE cow_id = %s ORDER BY recorded_at DESC LIMIT 1",
        (cid,))
    moving_share = await fetchone(
        """
        SELECT AVG(is_moving) AS share FROM MotionReadings
        WHERE cow_id = %s AND recorded_at > NOW() - INTERVAL 24 HOUR
        """, (cid,))
    temp_hist = await fetchall(
        """
        SELECT body_temp_celsius AS v FROM TemperatureReadings
        WHERE cow_id = %s AND recorded_at > NOW() - INTERVAL %s DAY
        ORDER BY recorded_at DESC LIMIT 5000 OFFSET 1
        """, (cid, BASELINE_DAYS))
    hr_hist = await fetchall(
        """
        SELECT heart_rate_bpm AS v FROM VitalsReadings
        WHERE cow_id = %s AND heart_rate_bpm IS NOT NULL AND recorded_at > NOW() - INTERVAL %s DAY
        ORDER BY recorded_at DESC LIMIT 5000 OFFSET 1
        """, (cid, BASELINE_DAYS))

    # Latest temperature: whichever source is newer.
    body_temp, temp_at = None, None
    if temp:
        body_temp, temp_at = _num(temp["body_temp_celsius"]), temp["recorded_at"]
    if vit and vit.get("body_temp_c") is not None and (temp_at is None or vit["recorded_at"] > temp_at):
        body_temp, temp_at = _num(vit["body_temp_c"]), vit["recorded_at"]

    hr = _num(vit["heart_rate_bpm"]) if vit else None
    spo2 = _num(vit["spo2_pct"]) if vit else None
    risk = score_cow(
        body_temp, hr, spo2,
        [_num(r["v"]) for r in temp_hist], [_num(r["v"]) for r in hr_hist],
        hypothermia_c=as_float(s, "cow_hypothermia_c") or 37.0,
        high_c=as_float(s, "cow_temp_high_c") or 39.0,
        fever_c=as_float(s, "cow_fever_c") or 39.5,
    )

    location = None
    if loc and loc["latitude"] is not None and loc["longitude"] is not None:
        location = {"latitude": float(loc["latitude"]), "longitude": float(loc["longitude"]),
                    "recorded_at": _iso(loc["recorded_at"]), "outside_boundary": None, "distance_m": None}
        c_lat, c_lng, radius = as_float(s, "geofence_lat"), as_float(s, "geofence_lng"), as_float(s, "geofence_radius_m")
        if None not in (c_lat, c_lng, radius):
            dist = distance_m(c_lat, c_lng, location["latitude"], location["longitude"])
            location.update(distance_m=round(dist), outside_boundary=dist > radius)
            if dist > radius:
                risk["reasons"].append(f"Outside the farm boundary: {dist:.0f} m from the centre")

    stamps = [t for t in (vit and vit["recorded_at"], temp_at, mot and mot["recorded_at"], loc and loc["recorded_at"]) if t]
    last_seen = max(stamps) if stamps else None
    return {
        "cow_id": cid,
        "cow_name": cow["cow_name"],
        "rfid_tag": cow.get("rfid_tag"),
        "health_status": cow.get("health_status"),
        "device_id": (vit or {}).get("device_id") or cow.get("device_id"),
        "body_temp_c": body_temp,
        "heart_rate_bpm": hr,
        "spo2_pct": spo2,
        "is_moving": bool(mot["is_moving"]) if mot else None,
        "moving_share_24h": round(float(moving_share["share"]), 2) if moving_share and moving_share["share"] is not None else None,
        "location": location,
        "last_seen": _iso(last_seen),
        "seconds_since_seen": round(seconds_since(now, last_seen)) if last_seen else None,
        "online": (seconds_since(now, last_seen) or 1e9) <= ONLINE_SECONDS,
        "baseline_readings": len(temp_hist),
        "risk": risk,
    }


@router.get("/overview")
async def overview(farm_id: Optional[int] = Query(None), user=Depends(require_any())):
    farm = await view_farm(user, farm_id)
    s = await get_settings(farm)
    now = await db_now()
    cows = [] if farm is None else await fetchall(
        """
        SELECT DISTINCT c.cow_id, c.cow_name, c.rfid_tag, c.health_status, d.device_id
        FROM Cows c
        LEFT JOIN IoTDevices d ON d.cow_id = c.cow_id AND d.role = 'collar'
        WHERE c.is_active = TRUE AND c.farm_id = %s AND (
              d.device_id IS NOT NULL
           OR EXISTS (SELECT 1 FROM VitalsReadings v WHERE v.cow_id = c.cow_id AND v.recorded_at > NOW() - INTERVAL %s DAY)
           OR EXISTS (SELECT 1 FROM LocationReadings l WHERE l.cow_id = c.cow_id AND l.recorded_at > NOW() - INTERVAL %s DAY))
        ORDER BY c.cow_name
        """,
        (farm, ACTIVE_DAYS, ACTIVE_DAYS),
    )
    seen, snaps = set(), []
    for cow in cows:
        if cow["cow_id"] in seen:
            continue
        seen.add(cow["cow_id"])
        snaps.append(await _cow_snapshot(cow, s, now))
    snaps.sort(key=lambda c: -c["risk"]["score"])
    boundary = None
    c_lat, c_lng, radius = as_float(s, "geofence_lat"), as_float(s, "geofence_lng"), as_float(s, "geofence_radius_m")
    if None not in (c_lat, c_lng, radius):
        boundary = {"latitude": c_lat, "longitude": c_lng, "radius_m": radius}
    return {
        "cows": snaps,
        "needs_attention": [c for c in snaps if c["risk"]["score"] >= 25],
        "boundary": boundary,
        "farm_id": farm,
        "generated_at": now.isoformat(timespec="seconds"),
    }


@router.get("/{cow_id}")
async def one_cow(cow_id: int, user=Depends(require_any())):
    cow = await ensure_cow_access(user, cow_id)
    return await _cow_snapshot(cow, await get_settings(cow.get("farm_id")), await db_now())
