"""
Outbound SMS. Uses only the standard library (urllib) in a worker thread, so no
new dependency is needed on the server.
"""
import asyncio
import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from config import settings

logger = logging.getLogger(__name__)

AFRICASTALKING_URL = "https://api.africastalking.com/version1/messaging"


def is_configured() -> bool:
    provider = settings.SMS_PROVIDER.strip().lower()
    if provider == "africastalking":
        return bool(settings.SMS_USERNAME and settings.SMS_API_KEY)
    if provider == "http":
        return bool(settings.SMS_API_URL)
    return False


def _post(url: str, data: bytes, headers: dict) -> tuple[bool, str]:
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read(2000).decode("utf-8", "replace")
            return 200 <= resp.status < 300, body
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}: {e.read(500).decode('utf-8', 'replace')}"
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return False, str(e)


def _send_blocking(phone: str, message: str) -> tuple[bool, str]:
    provider = settings.SMS_PROVIDER.strip().lower()
    if provider == "africastalking":
        form = {"username": settings.SMS_USERNAME, "to": phone, "message": message}
        if settings.SMS_SENDER_ID:
            form["from"] = settings.SMS_SENDER_ID
        return _post(
            AFRICASTALKING_URL,
            urllib.parse.urlencode(form).encode(),
            {"apiKey": settings.SMS_API_KEY, "Accept": "application/json",
             "Content-Type": "application/x-www-form-urlencoded"},
        )
    if provider == "http":
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if settings.SMS_API_KEY:
            headers["Authorization"] = f"Bearer {settings.SMS_API_KEY}"
        payload = {"to": phone, "message": message, "sender": settings.SMS_SENDER_ID or "FarmCare"}
        return _post(settings.SMS_API_URL, json.dumps(payload).encode(), headers)
    return False, "SMS provider not configured"


async def send_sms(phone: str, message: str) -> tuple[bool, str]:
    """Send one SMS. Returns (sent, detail). Never raises."""
    if not is_configured():
        logger.info("SMS not configured; would send to %s: %s", phone, message)
        return False, "SMS provider not configured"
    try:
        return await asyncio.to_thread(_send_blocking, phone, message[:459])
    except Exception as e:  # noqa: BLE001 - an SMS failure must never break ingest
        logger.warning("SMS send failed for %s: %s", phone, e)
        return False, str(e)
