from __future__ import annotations

import html
import os
from typing import Optional

import requests


RESEND_EMAILS_URL = "https://api.resend.com/emails"


class EmailDeliveryError(RuntimeError):
    """Raised when Resend rejects or cannot process an email request."""


def get_email_config() -> dict[str, str]:
    """Read email settings at call time so local reloads pick up env changes."""
    return {
        "api_key": os.getenv("RESEND_API_KEY", "").strip(),
        "from_email": os.getenv("RESEND_FROM_EMAIL", "").strip(),
        "app_url": os.getenv("APP_PUBLIC_URL", "").strip(),
    }


def email_delivery_enabled() -> bool:
    config = get_email_config()
    return bool(config["api_key"] and config["from_email"])


def build_notification_subject(event: str, entity_type: str) -> str:
    entity_label = "Driver Booking" if entity_type == "booking" else "Travel Request" if entity_type == "ticket" else "Booking App"
    event_label = str(event or "updated").replace("_", " ").strip().title()
    return f"{entity_label}: {event_label}"


def build_notification_html(recipient_name: Optional[str], message: str, app_url: str) -> str:
    safe_name = html.escape((recipient_name or "User").strip() or "User")
    safe_message = html.escape(message)
    action = ""
    if app_url:
        safe_url = html.escape(app_url, quote=True)
        action = (
            '<p style="margin:24px 0 0">'
            f'<a href="{safe_url}" style="display:inline-block;padding:10px 16px;border-radius:6px;'
            'background:#273896;color:#ffffff;text-decoration:none;font-weight:600">Open Booking App</a>'
            "</p>"
        )

    return (
        '<div style="margin:0;background:#f4f6f8;padding:24px;font-family:Segoe UI,Arial,sans-serif;color:#1f2937">'
        '<div style="max-width:560px;margin:0 auto;border:1px solid #dbe1ea;border-radius:10px;background:#ffffff;padding:24px">'
        '<h1 style="margin:0 0 16px;color:#273896;font-size:22px;line-height:30px">Booking App</h1>'
        f'<p style="margin:0 0 12px;font-size:14px;line-height:22px">Hello {safe_name},</p>'
        f'<p style="margin:0;font-size:14px;line-height:22px">{safe_message}</p>'
        f"{action}"
        '<p style="margin:24px 0 0;border-top:1px solid #e5e7eb;padding-top:16px;color:#64748b;font-size:12px;line-height:18px">'
        "This is an automated notification from Booking App.</p>"
        "</div></div>"
    )


def send_notification_email(
    *,
    to_email: str,
    recipient_name: Optional[str],
    message: str,
    event: str,
    entity_type: str,
    notification_id: str,
) -> Optional[str]:
    """Send one notification email and return the Resend email id when configured."""
    config = get_email_config()
    if not (config["api_key"] and config["from_email"] and to_email):
        return None

    response = requests.post(
        RESEND_EMAILS_URL,
        headers={
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json",
            "Idempotency-Key": f"booking-app-notification-{notification_id}",
            "User-Agent": "booking-app/1.0",
        },
        json={
            "from": config["from_email"],
            "to": [to_email],
            "subject": build_notification_subject(event, entity_type),
            "html": build_notification_html(recipient_name, message, config["app_url"]),
            "text": f"Hello {recipient_name or 'User'},\n\n{message}\n\nOpen Booking App: {config['app_url']}".strip(),
        },
        timeout=10,
    )

    if not response.ok:
        detail = response.text.strip()[:500] or f"HTTP {response.status_code}"
        raise EmailDeliveryError(f"Resend email delivery failed: {detail}")

    try:
        payload = response.json()
    except ValueError as exc:
        raise EmailDeliveryError("Resend returned an invalid JSON response") from exc

    email_id = payload.get("id")
    if not email_id:
        raise EmailDeliveryError("Resend response did not include an email id")
    return str(email_id)
