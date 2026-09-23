from __future__ import annotations

import html
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, parseaddr
from typing import Mapping, Optional


class EmailDeliveryError(RuntimeError):
    """Raised when the configured SMTP server cannot accept an email."""


def get_email_config() -> dict[str, str]:
    """Read email settings at call time so local reloads pick up env changes."""
    return {
        "host": os.getenv("SMTP_HOST", "").strip(),
        "port": os.getenv("SMTP_PORT", "465").strip(),
        "security": os.getenv("SMTP_SECURITY", "ssl").strip().lower(),
        "username": os.getenv("SMTP_USERNAME", "").strip(),
        "password": os.getenv("SMTP_PASSWORD", ""),
        "from_email": os.getenv("SMTP_FROM_EMAIL", "").strip(),
        "app_url": os.getenv("APP_PUBLIC_URL", "").strip(),
    }


def email_delivery_enabled() -> bool:
    config = get_email_config()
    return bool(config["host"] and config["username"] and config["password"] and config["from_email"])


def send_email(*, to_email: str, subject: str, html_content: str, text_content: str) -> Optional[str]:
    config = get_email_config()
    if not (email_delivery_enabled() and to_email):
        return None

    try:
        port = int(config["port"])
        if not 1 <= port <= 65535 or config["security"] not in {"ssl", "starttls"}:
            raise ValueError("Invalid SMTP port or security mode")
        sender_name, sender_address = parseaddr(config["from_email"])
        if not sender_address or sender_address.lower() != config["username"].lower():
            raise ValueError("SMTP_FROM_EMAIL must use the SMTP_USERNAME mailbox")

        message = EmailMessage()
        message["From"] = formataddr((sender_name, sender_address))
        message["To"] = to_email
        message["Subject"] = subject
        message_id = make_msgid(domain=sender_address.rsplit("@", 1)[-1])
        message["Message-ID"] = message_id
        message.set_content(text_content)
        message.add_alternative(html_content, subtype="html")

        tls_context = ssl.create_default_context()
        if config["security"] == "ssl":
            with smtplib.SMTP_SSL(config["host"], port, timeout=10, context=tls_context) as smtp:
                smtp.login(config["username"], config["password"])
                smtp.send_message(message)
        else:
            with smtplib.SMTP(config["host"], port, timeout=10) as smtp:
                smtp.starttls(context=tls_context)
                smtp.login(config["username"], config["password"])
                smtp.send_message(message)
        return message_id
    except (OSError, smtplib.SMTPException, ValueError) as exc:
        raise EmailDeliveryError("SMTP email delivery failed") from exc


def build_notification_subject(event: str, entity_type: str) -> str:
    entity_label = "Driver Booking" if entity_type == "booking" else "Travel Request" if entity_type == "ticket" else "Booking App"
    event_label = str(event or "updated").replace("_", " ").strip().title()
    return f"{entity_label}: {event_label}"


def build_email_layout(content: str) -> str:
    """Wrap email content in a narrow, mobile-friendly centered card."""
    return (
        '<!doctype html><html><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        '<meta name="x-apple-disable-message-reformatting"></head>'
        '<body style="margin:0;padding:0;background:#f4f6f8;'
        'font-family:Segoe UI,Arial,sans-serif;color:#1f2937;'
        '-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
        'style="width:100%;border-collapse:collapse;background:#f4f6f8">'
        '<tr><td align="center" style="padding:16px 10px">'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
        'style="width:100%;max-width:560px;border:1px solid #dbe1ea;'
        'border-radius:10px;background:#ffffff;border-collapse:separate">'
        f'<tr><td style="padding:24px 22px">{content}</td></tr>'
        '</table></td></tr></table></body></html>'
    )


def build_notification_html(
    recipient_name: Optional[str],
    message: str,
    app_url: str,
    details: Optional[Mapping[str, object]] = None,
) -> str:
    safe_name = html.escape((recipient_name or "User").strip() or "User")
    safe_message = html.escape(message)
    detail_rows = ""
    if details:
        detail_rows = (
            '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
            'style="width:100%;margin:18px 0 0;border-top:1px solid #e5e7eb;'
            'border-collapse:collapse">'
        )
        for label, value in details.items():
            safe_label = html.escape(str(label))
            safe_value = html.escape(str(value or "-"))
            detail_rows += (
                '<tr><td style="padding:12px 0 2px;font-size:13px;line-height:18px;'
                'font-weight:600;color:#475569;overflow-wrap:anywhere;word-break:break-word">'
                f'{safe_label}</td></tr>'
                '<tr><td style="padding:0 0 12px;font-size:14px;line-height:21px;'
                'color:#1f2937;border-bottom:1px solid #eef1f5;overflow-wrap:anywhere;'
                f'word-break:break-word">{safe_value}</td></tr>'
            )
        detail_rows += "</table>"
    action = ""
    if app_url:
        safe_url = html.escape(app_url, quote=True)
        action = (
            '<p style="margin:24px 0 0">'
            f'<a href="{safe_url}" style="display:inline-block;padding:10px 16px;border-radius:6px;'
            'background:#273896;color:#ffffff;text-decoration:none;font-weight:600">Open Booking App</a>'
            "</p>"
        )

    content = (
        '<h1 style="margin:0 0 16px;color:#273896;font-size:22px;line-height:30px">Booking App</h1>'
        f'<p style="margin:0 0 12px;font-size:14px;line-height:22px">Hello {safe_name},</p>'
        f'<p style="margin:0;font-size:14px;line-height:22px;overflow-wrap:anywhere">{safe_message}</p>'
        f"{detail_rows}{action}"
    )
    return build_email_layout(content)


def send_notification_email(
    *,
    to_email: str,
    recipient_name: Optional[str],
    message: str,
    event: str,
    entity_type: str,
    notification_id: str,
    details: Optional[Mapping[str, object]] = None,
) -> Optional[str]:
    """Send one notification email and return its Message-ID when configured."""
    config = get_email_config()
    return send_email(
        to_email=to_email,
        subject=build_notification_subject(event, entity_type),
        html_content=build_notification_html(recipient_name, message, config["app_url"], details),
        text_content=(
            f"Hello {recipient_name or 'User'},\n\n{message}"
            + ("\n\n" + "\n".join(f"{label} : {value or '-'}" for label, value in details.items()) if details else "")
            + f"\n\nOpen Booking App: {config['app_url']}"
        ).strip(),
    )

def send_password_reset_email(
    *,
    to_email: str,
    recipient_name: Optional[str],
    reset_url: str,
    invitation: bool = False,
    expires_in_minutes: int = 30,
) -> Optional[str]:
    if not (email_delivery_enabled() and to_email):
        return None

    safe_name = html.escape(
        (recipient_name or "User").strip() or "User"
    )

    safe_url = html.escape(
        reset_url,
        quote=True,
    )

    is_invitation = invitation is True
    expiry_label = "1 hour" if expires_in_minutes == 60 else f"{expires_in_minutes} minutes"
    subject = "Set Up Your Booking App Account" if is_invitation else "Reset Your Booking App Password"
    heading = "Set Up Your Password" if is_invitation else "Reset Your Password"
    intro = (
        "A Super Admin created an Employee account for you. Set your password to activate your account."
        if is_invitation
        else "We received a request to reset your Booking App password."
    )
    action_label = "Set Password" if is_invitation else "Reset Password"

    content = (
        '<h1 style="margin:0 0 16px;color:#273896;'
        'font-size:22px;line-height:30px">'
        f'{heading}'
        '</h1>'

        f'<p style="margin:0 0 12px;font-size:14px;'
        f'line-height:22px">'
        f'Hello {safe_name},'
        f'</p>'

        '<p style="margin:0 0 16px;font-size:14px;'
        'line-height:22px">'
        f'{intro}'
        '</p>'

        '<p style="margin:24px 0">'
        f'<a href="{safe_url}" '
        'style="display:inline-block;padding:10px 16px;'
        'border-radius:6px;background:#273896;'
        'color:#ffffff;text-decoration:none;font-weight:600">'
        f'{action_label}'
        '</a>'
        '</p>'

        '<p style="margin:0;font-size:13px;'
        'line-height:20px;color:#64748b">'
        f'This link will expire in {expiry_label} and can only be used once.'
        '</p>'

        '<p style="margin:24px 0 0;border-top:1px solid #e5e7eb;'
        'padding-top:16px;color:#64748b;font-size:12px;'
        'line-height:18px">'
        'If you did not request a password reset, you can safely ignore '
        'this email.'
        '</p>'
    )
    html_content = build_email_layout(content)

    text_content = (
        f"Hello {recipient_name or 'User'},\n\n"
        f"{intro}\n\n"
        f"{action_label} here:\n{reset_url}\n\n"
        f"This link will expire in {expiry_label} and can only be used once.\n\n"
        "If you did not request a password reset, you can safely ignore "
        "this email."
    )

    return send_email(
        to_email=to_email,
        subject=subject,
        html_content=html_content,
        text_content=text_content,
    )
