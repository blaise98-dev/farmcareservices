"""
Milking page: RFID scan, live milk level in the smart container, and
"Record Milk", which closes the session and writes the measured litres to
MilkProductionRecords (so milk totals, economics and herd pages stay in sync).
Users only reach their own farm's milking stations and cows.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from alerting import notify_text
from database import execute, fetchall, fetchone
from farm_config import ONLINE_SECONDS, as_float, db_now, get_settings, milking_session_name, seconds_since
from rbac import require_any, require_can_log_milk
from routers.iot_wearable import active_session, handle_rfid_scan
from tenancy import cow_clause, farm_clause, farm_of_device, view_farm
from ws_manager import manager

router = APIRouter(prefix="/api/milking", tags=["milking"])
LIVE_READING_SECONDS = 120   # a container reading older than this is not "live"


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


async def _station_id(user: dict, device_id: Optional[str], farm_id: Optional[int] = None) -> str:
    """The milking station to use: the one named, if the user may see it, else the farm's latest."""
    if device_id:
        where, args = farm_clause(user)
        if not await fetchone(f"SELECT device_id FROM IoTDevices WHERE device_id = %s AND {where}", (device_id, *args)):
            raise HTTPException(404, "Unknown Milking Station")
        return device_id
    farm = await view_farm(user, farm_id)
    row = None
    if farm is not None:
        row = await fetchone(
            "SELECT device_id FROM IoTDevices WHERE role = 'milking' AND farm_id = %s ORDER BY last_seen DESC LIMIT 1",
            (farm,),
        )
    if not row:
        raise HTTPException(404, "No Milking Station is registered")
    return row["device_id"]


async def finish_session(station: str, session_id: Optional[int],
                         volume_l: Optional[float], username: str) -> dict:
    """Close the active session and log its milk. Shared by the web button and the station button.

    `station` must already be checked against the caller's farm.
    """
    if session_id:
        sess = await fetchone(
            "SELECT * FROM MilkingSessions WHERE session_id = %s AND device_id = %s AND status = 'Active'",
            (session_id, station),
        )
    else:
        sess = await active_session(station)
    if not sess:
        raise HTTPException(400, "No cow is being milked. Scan the cow's RFID tag first.")
    if not sess.get("cow_id"):
        raise HTTPException(400, "This session has no registered cow.")

    if volume_l is None:
        latest = await fetchone(
            """
            SELECT volume_l FROM MilkStationReadings
            WHERE device_id = %s AND volume_l IS NOT NULL
              AND recorded_at > NOW() - INTERVAL %s SECOND
            ORDER BY recorded_at DESC LIMIT 1
            """,
            (sess["device_id"], LIVE_READING_SECONDS),
        )
        volume_l = float(latest["volume_l"]) if latest else float(sess.get("milk_liters") or 0)
    if volume_l <= 0:
        raise HTTPException(400, "The container reads 0 L. Pour the milk in, or type the litres.")

    session_name = milking_session_name((await db_now()).hour)
    record_id = await execute(
        """
        INSERT INTO MilkProductionRecords
            (cow_id, milk_amount_liters, milking_session, milk_quality, recorded_by)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (sess["cow_id"], round(volume_l, 3), session_name, "Normal", username),
    )
    await execute("UPDATE Cows SET last_milk_date = CURDATE() WHERE cow_id = %s", (sess["cow_id"],))
    await execute(
        """
        UPDATE MilkingSessions
        SET status = 'Complete', end_time = NOW(),
            duration_seconds = TIMESTAMPDIFF(SECOND, start_time, NOW()),
            milk_liters = %s, milk_record_id = %s, recorded_by = %s
        WHERE session_id = %s
        """,
        (round(volume_l, 3), record_id, username, sess["session_id"]),
    )
    done = await fetchone("SELECT * FROM MilkingSessions WHERE session_id = %s", (sess["session_id"],))
    farm_id = await farm_of_device(station)
    await manager.broadcast("milk_update", {
        "cow_id": sess["cow_id"], "liters": round(volume_l, 3), "session": session_name, "logged_by": username,
    }, farm_id=farm_id)
    await manager.broadcast("milking_session", {"event": "completed", **_safe(done)}, farm_id=farm_id)
    await notify_text(f"{sess.get('cow_name') or 'Cow'} gave {volume_l:.2f} L ({session_name.lower()} milking).",
                      farm_id, severity="Info", alert_type="Milk")
    return {"ok": True, "session": _safe(done), "milk_record_id": record_id}


# ── Web actions ───────────────────────────────────────────────────────────────
class ScanBody(BaseModel):
    rfid_tag: str = Field(..., min_length=2, max_length=50)
    device_id: Optional[str] = None


@router.post("/scan")
async def web_scan(body: ScanBody, user=Depends(require_can_log_milk())):
    """Type or scan a tag on the Milking page: same effect as tapping it on the station."""
    station = await _station_id(user, body.device_id)
    tag = body.rfid_tag.strip()
    result = await handle_rfid_scan(station, tag)
    if not result.get("found"):
        # Station firmware sends the UID in lower-case hex; staff may type upper case.
        alt = tag.lower() if tag != tag.lower() else tag.upper()
        result = await handle_rfid_scan(station, alt)
    if not result.get("found"):
        raise HTTPException(404, f"RFID {tag} is not registered to any cow")
    return result


class RecordBody(BaseModel):
    device_id: Optional[str] = None
    session_id: Optional[int] = None
    volume_l: Optional[float] = Field(None, gt=0, le=60)


@router.post("/record")
async def web_record(body: RecordBody, user=Depends(require_can_log_milk())):
    if body.session_id and not body.device_id:
        row = await fetchone("SELECT device_id FROM MilkingSessions WHERE session_id = %s", (body.session_id,))
        body.device_id = row["device_id"] if row else None
        if not body.device_id:
            raise HTTPException(400, "No cow is being milked. Scan the cow's RFID tag first.")
    station = await _station_id(user, body.device_id)
    return await finish_session(station, body.session_id, body.volume_l, user["username"])


@router.post("/cancel")
async def cancel_session(body: RecordBody, user=Depends(require_can_log_milk())):
    station = await _station_id(user, body.device_id)
    sess = await active_session(station)
    if not sess:
        return {"ok": True, "cancelled": False}
    await execute(
        """
        UPDATE MilkingSessions SET status = 'Aborted', end_time = NOW(),
               duration_seconds = TIMESTAMPDIFF(SECOND, start_time, NOW())
        WHERE session_id = %s
        """,
        (sess["session_id"],),
    )
    await manager.broadcast("milking_session", {"event": "aborted", "session_id": sess["session_id"]},
                            farm_id=await farm_of_device(station))
    return {"ok": True, "cancelled": True}


# ── Read endpoints ───────────────────────────────────────────────────────────
@router.get("/live")
async def live(device_id: Optional[str] = None, farm_id: Optional[int] = Query(None), user=Depends(require_any())):
    """Everything the Milking page header and gauge need, in one call."""
    station = await _station_id(user, device_id, farm_id)
    dev = await fetchone("SELECT * FROM IoTDevices WHERE device_id = %s", (station,))
    reading = await fetchone(
        "SELECT * FROM MilkStationReadings WHERE device_id = %s ORDER BY recorded_at DESC LIMIT 1",
        (station,),
    )
    fresh = await fetchone(
        "SELECT reading_id FROM MilkStationReadings WHERE device_id = %s AND recorded_at > NOW() - INTERVAL %s SECOND LIMIT 1",
        (station, LIVE_READING_SECONDS),
    )
    sess = await active_session(station)
    today = await fetchone(
        """
        SELECT COALESCE(SUM(milk_amount_liters), 0) AS total_l, COUNT(*) AS sessions
        FROM MilkProductionRecords
        WHERE DATE(recorded_at) = CURDATE() AND cow_id IN (SELECT cow_id FROM Cows WHERE farm_id <=> %s)
        """,
        (dev.get("farm_id"),),
    )
    last_scan = await fetchone(
        """
        SELECT r.*, c.cow_name FROM RfidScans r LEFT JOIN Cows c ON c.cow_id = r.cow_id
        WHERE r.device_id = %s ORDER BY r.scanned_at DESC LIMIT 1
        """,
        (station,),
    )
    s = await get_settings(dev.get("farm_id"))
    age = seconds_since(await db_now(), (dev or {}).get("last_seen"))
    online = age is not None and age <= ONLINE_SECONDS
    return {
        "device_id": station,
        "device_label": (dev or {}).get("label") or "Milking Station",
        "online": online,
        "reading": _safe(reading),
        "reading_is_live": bool(fresh),
        "active_session": _safe(sess) if sess else None,
        "last_scan": _safe(last_scan) if last_scan else None,
        "today_total_l": float(today["total_l"]) if today else 0.0,
        "today_sessions": int(today["sessions"]) if today else 0,
        "container": {
            "capacity_l": as_float(s, "milk_container_capacity_l"),
            "empty_cm": as_float(s, "milk_container_empty_cm"),
            "full_cm": as_float(s, "milk_container_full_cm"),
        },
    }


@router.get("/sessions")
async def sessions(limit: int = 20, user=Depends(require_any())):
    where, args = cow_clause(user, "s.cow_id")
    rows = await fetchall(
        f"""
        SELECT s.session_id, s.cow_id, s.device_id, s.start_time, s.end_time, s.duration_seconds,
               s.milk_liters, s.status, s.tds_ppm, s.milk_temp_c, s.recorded_by,
               COALESCE(c.cow_name, s.cow_name) AS cow_name, c.rfid_tag
        FROM MilkingSessions s LEFT JOIN Cows c ON c.cow_id = s.cow_id
        WHERE s.status = 'Complete' AND {where}
        ORDER BY s.end_time DESC, s.session_id DESC
        LIMIT %s
        """,
        (*args, min(max(limit, 1), 200)),
    )
    return [_safe(r) for r in rows]


@router.get("/today")
async def today_by_cow(user=Depends(require_any())):
    """Registered cows with today's litres and number of milking sessions."""
    where, args = farm_clause(user, "c.farm_id")
    rows = await fetchall(
        f"""
        SELECT c.cow_id, c.cow_name, c.rfid_tag,
               COALESCE(SUM(m.milk_amount_liters), 0) AS today_l,
               COUNT(m.milk_id) AS sessions
        FROM Cows c
        LEFT JOIN MilkProductionRecords m
               ON m.cow_id = c.cow_id AND DATE(m.recorded_at) = CURDATE()
        WHERE c.is_active = TRUE AND (c.lactating = TRUE OR m.milk_id IS NOT NULL) AND {where}
        GROUP BY c.cow_id, c.cow_name, c.rfid_tag
        ORDER BY today_l DESC, c.cow_name
        """,
        args,
    )
    return [_safe(r) for r in rows]
