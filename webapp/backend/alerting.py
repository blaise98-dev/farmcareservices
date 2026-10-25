"""
One place to raise an alert: de-duplicates, stores it, pushes it to the open
dashboards of its farm, and texts that farm's SMS subscribers whose filters match.
"""
import asyncio
import logging

from database import execute, fetchall, fetchone
from sms_gateway import is_configured, send_sms
from tenancy import farm_of_cow
from ws_manager import manager

logger = logging.getLogger(__name__)

SEVERITY_RANK = {"Info": 0, "Warning": 1, "Critical": 2, "Emergency": 3}
DEDUP_MINUTES = 10

_background: set = set()   # keep task references so they are not garbage-collected


async def log_alert(alert_type: str, cow_id, severity: str, message: str, farm_id=None) -> int | None:
    """Store an alert unless the same one is already open from the last 10 minutes.

    The farm comes from the cow when not given (barn alerts pass the device's farm).
    Returns the new alert_id, or None when it was a duplicate.
    """
    if farm_id is None:
        farm_id = await farm_of_cow(cow_id)
    # Dedup on the exact message, not just (alert_type, cow_id): otherwise a
    # fever alert would silence an unrelated heart-rate alert for the same cow.
    dup = await fetchone(
        """
        SELECT alert_id FROM Alerts
        WHERE alert_type = %s
          AND (cow_id = %s OR (cow_id IS NULL AND %s IS NULL))
          AND (farm_id = %s OR (farm_id IS NULL AND %s IS NULL))
          AND message = %s
          AND is_resolved = FALSE
          AND created_at > NOW() - INTERVAL %s MINUTE
        LIMIT 1
        """,
        (alert_type, cow_id, cow_id, farm_id, farm_id, message, DEDUP_MINUTES),
    )
    if dup:
        return None
    alert_id = await execute(
        "INSERT INTO Alerts (alert_type, cow_id, severity, message, farm_id) VALUES (%s, %s, %s, %s, %s)",
        (alert_type, cow_id, severity, message, farm_id),
    )
    await manager.broadcast("new_alert", {
        "alert_id": alert_id, "alert_type": alert_type, "cow_id": cow_id,
        "severity": severity, "message": message,
    }, farm_id=farm_id)
    task = asyncio.create_task(_notify_subscribers(alert_id, alert_type, cow_id, severity, message, farm_id))
    _background.add(task)
    task.add_done_callback(_background.discard)
    return alert_id


def subscriber_matches(sub: dict, alert_type: str, severity: str) -> bool:
    if not sub.get("is_active"):
        return False
    if SEVERITY_RANK.get(severity, 0) < SEVERITY_RANK.get(sub.get("min_severity") or "Critical", 2):
        return False
    types = (sub.get("alert_types") or "All").strip()
    if types == "" or types.lower() == "all":
        return True
    wanted = {t.strip().lower() for t in types.split(",") if t.strip()}
    return alert_type.lower() in wanted


async def _notify_subscribers(alert_id, alert_type, cow_id, severity, message, farm_id) -> None:
    if farm_id is None:
        return   # an unassigned device: nobody's farm to text
    try:
        subs = await fetchall("SELECT * FROM SmsSubscribers WHERE is_active = TRUE AND farm_id = %s", (farm_id,))
    except Exception as e:  # noqa: BLE001 - table may be missing on a fresh install
        logger.warning("SMS subscribers unavailable: %s", e)
        return
    targets = [s for s in subs if subscriber_matches(s, alert_type, severity)]
    if not targets:
        return

    cow_name = None
    if cow_id is not None:
        row = await fetchone("SELECT cow_name FROM Cows WHERE cow_id = %s", (cow_id,))
        cow_name = (row or {}).get("cow_name")
    text = f"FarmCare {severity}: {message}" + (f" (cow {cow_name})" if cow_name and cow_name not in message else "")

    any_sent = False
    for sub in targets:
        sent, detail = await send_sms(sub["phone_number"], text)
        status = "Sent" if sent else ("Failed" if is_configured() else "Pending")
        any_sent = any_sent or sent
        try:
            await execute(
                "INSERT INTO SmsLogs (alert_id, recipient_phone, message_content, status, farm_id) VALUES (%s, %s, %s, %s, %s)",
                (alert_id, sub["phone_number"], text, status, farm_id),
            )
        except Exception as e:  # noqa: BLE001
            logger.warning("Could not log SMS to %s (%s): %s", sub["phone_number"], detail, e)
    if any_sent:
        try:
            await execute("UPDATE Alerts SET is_sent_sms = TRUE WHERE alert_id = %s", (alert_id,))
        except Exception as e:  # noqa: BLE001
            logger.warning("Could not flag alert %s as texted: %s", alert_id, e)


async def notify_text(message: str, farm_id, severity: str = "Info", alert_type: str = "System") -> None:
    """Text a farm's matching subscribers without creating an alert (e.g. a milking summary)."""
    task = asyncio.create_task(_notify_subscribers(None, alert_type, None, severity, message, farm_id))
    _background.add(task)
    task.add_done_callback(_background.discard)
