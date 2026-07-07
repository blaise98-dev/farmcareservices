"""Send transactional emails (password reset, etc.)."""
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from config import settings

logger = logging.getLogger(__name__)


async def send_password_reset_email(to_email: str, name: str, reset_url: str) -> None:
    subject = "Reset your MooMe password"
    plain = (
        f"Hello {name},\n\n"
        f"We received a request to reset your MooMe password.\n"
        f"Open this link to choose a new password (expires in {settings.RESET_TOKEN_EXPIRE_MINUTES} minutes):\n\n"
        f"{reset_url}\n\n"
        f"If you did not request this, you can ignore this email.\n"
    )
    html = f"""\
<html><body style="font-family:sans-serif;color:#1a1a2e">
  <h2 style="color:#1E4D7B">MooMe — Password Reset</h2>
  <p>Hello {name},</p>
  <p>We received a request to reset your password. Click the button below to choose a new one.
     This link expires in <strong>{settings.RESET_TOKEN_EXPIRE_MINUTES} minutes</strong>.</p>
  <p style="margin:28px 0">
    <a href="{reset_url}"
       style="background:#4CAF50;color:#fff;padding:12px 24px;border-radius:8px;
              text-decoration:none;font-weight:700">
      Reset Password
    </a>
  </p>
  <p style="font-size:13px;color:#666">Or copy this link into your browser:<br>
    <a href="{reset_url}">{reset_url}</a></p>
  <p style="font-size:12px;color:#999">If you did not request this, you can safely ignore this email.</p>
</body></html>"""

    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured — password reset link for %s: %s", to_email, reset_url)
        print(f"\n[PASSWORD RESET] Link for {to_email}: {reset_url}\n")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to_email
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER or None,
            password=settings.SMTP_PASSWORD or None,
            start_tls=settings.SMTP_USE_TLS,
        )
        logger.info("Password reset email sent to %s", to_email)
    except Exception as exc:
        logger.error("Failed to send password reset email to %s: %s", to_email, exc)
