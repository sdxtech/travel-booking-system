from __future__ import annotations

import html
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, parseaddr
from pathlib import Path
from typing import Mapping, Optional
from driver_localization import SUBJECTS


EMAIL_LOGO_PATH = Path(__file__).resolve().parent / "assets" / "DR LOGO BLUE.png"
EMAIL_LOGO_SRC = "cid:booking-app-logo"



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
        logo_cid = None
        if EMAIL_LOGO_SRC in html_content:
            logo_cid = make_msgid()
            html_content = html_content.replace(EMAIL_LOGO_SRC, f"cid:{logo_cid[1:-1]}")
        message.add_alternative(html_content, subtype="html")
        if logo_cid:
            message.get_payload()[-1].add_related(
                EMAIL_LOGO_PATH.read_bytes(), maintype="image", subtype="png",
                cid=logo_cid, disposition="inline", filename=EMAIL_LOGO_PATH.name,
            )

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


def build_notification_subject(event: str, entity_type: str, *, language: str = "en") -> str:
    if language == "id":
        entity_label = "Perjalanan" if entity_type == "booking" else "Driver Request App"
        return f"{entity_label}: {SUBJECTS.get(event, 'Pemberitahuan terbaru')}"
    entity_label = "Driver Booking" if entity_type == "booking" else "Travel Request" if entity_type == "ticket" else "Driver Request App"
    event_label = str(event or "updated").replace("_", " ").strip().title()
    return f"{entity_label}: {event_label}"


def build_email_layout(content: str, *, language: str = "en") -> str:
    """Wrap email content in a narrow, mobile-friendly centered card."""
    logo = (
        '<tr><td align="center" style="padding:24px 22px 0;text-align:center">'
        f'<img src="{EMAIL_LOGO_SRC}" alt="Driver Request App" width="240" height="240" '
        'style="display:block;width:240px;height:240px;margin:0 auto;border:0">'
        '</td></tr>'
    )
    return (
        f'<!doctype html><html lang="{language}"><head><meta charset="utf-8">'
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
        f'{logo}<tr><td style="padding:24px 22px">{content}</td></tr>'
        '</table></td></tr></table></body></html>'
    )


def build_notification_html(
    recipient_name: Optional[str],
    message: str,
    app_url: str,
    details: Optional[Mapping[str, object]] = None,
    *,
    language: str = "en",
) -> str:
    fallback_name = "Pengguna" if language == "id" else "User"
    safe_name = html.escape((recipient_name or fallback_name).strip() or fallback_name)
    greeting = "Halo" if language == "id" else "Hello"
    action_label = "Buka Driver Request App" if language == "id" else "Open Driver Request App"
    automated_note = "Ini adalah pemberitahuan otomatis dari Driver Request App." if language == "id" else "This is an automated notification from Driver Request App."
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
            f'background:#273896;color:#ffffff;text-decoration:none;font-weight:600">{action_label}</a>'
            "</p>"
        )

    content = (
        '<h1 style="margin:0 0 16px;color:#273896;font-size:22px;line-height:30px">Driver Request App</h1>'
        f'<p style="margin:0 0 12px;font-size:14px;line-height:22px">{greeting} {safe_name},</p>'
        f'<p style="margin:0;font-size:14px;line-height:22px;overflow-wrap:anywhere">{safe_message}</p>'
        f"{detail_rows}{action}"
        '<p style="margin:8px 0 0;color:#64748b;font-size:12px;line-height:18px">'
        f'{automated_note}</p>'
    )
    return build_email_layout(content, language=language)


def send_notification_email(
    *,
    to_email: str,
    recipient_name: Optional[str],
    message: str,
    event: str,
    entity_type: str,
    notification_id: str,
    details: Optional[Mapping[str, object]] = None,
    language: str = "en",
) -> Optional[str]:
    """Send one notification email and return its Message-ID when configured."""
    config = get_email_config()
    return send_email(
        to_email=to_email,
        subject=build_notification_subject(event, entity_type, language=language),
        html_content=build_notification_html(recipient_name, message, config["app_url"], details, language=language),
        text_content=(
            f"{'Halo' if language == 'id' else 'Hello'} {recipient_name or ('Pengguna' if language == 'id' else 'User')},\n\n{message}"
            + ("\n\n" + "\n".join(f"{label} : {value or '-'}" for label, value in details.items()) if details else "")
            + f"\n\n{'Buka Driver Request App' if language == 'id' else 'Open Driver Request App'}: {config['app_url']}"
            + ("\nIni adalah pemberitahuan otomatis dari Driver Request App." if language == "id" else "")
        ).strip(),
    )

def send_password_reset_email(
    *,
    to_email: str,
    recipient_name: Optional[str],
    reset_url: str,
    invitation: bool = False,
    expires_in_minutes: int = 30,
    language: str = "en",
    account_guidebook_url: str = "",
    account_system_url: str = "https://driver.pesan.biz",
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
    subject = "Set Up Your Driver Request App Account" if is_invitation else "Reset Your Driver Request App Password"
    heading = "Set Up Your Password" if is_invitation else "Reset Your Password"
    intro = (
        "A Super Admin created an Employee account for you. Set your password to activate your account."
        if is_invitation
        else "We received a request to reset your Driver Request App password."
    )
    action_label = "Set Password" if is_invitation else "Reset Password"
    greeting = "Hello"
    expiry_note = f"This link will expire in {expiry_label} and can only be used once."
    ignore_note = "If you did not request a password reset, you can safely ignore this email."
    if language == "id":
        greeting = "Halo"
        subject = "Aktifkan Akun Driver Request App Anda" if is_invitation else "Atur Ulang Kata Sandi Driver Request App"
        heading = "Buat Kata Sandi Anda" if is_invitation else "Atur Ulang Kata Sandi"
        intro = (
            "Super Admin telah membuat akun pengemudi untuk Anda. Buat kata sandi untuk mengaktifkan akun Anda."
            if is_invitation else "Kami menerima permintaan untuk mengatur ulang kata sandi akun Driver Request App Anda."
        )
        action_label = "Buat Kata Sandi" if is_invitation else "Atur Ulang Kata Sandi"
        expiry_label = "1 jam" if expires_in_minutes == 60 else f"{expires_in_minutes} menit"
        expiry_note = f"Tautan ini berlaku selama {expiry_label} dan hanya dapat digunakan satu kali."
        ignore_note = "Jika Anda tidak meminta pengaturan ulang kata sandi, abaikan email ini."
        safe_name = html.escape((recipient_name or "Pengemudi").strip() or "Pengemudi")

    invitation_links_html = ""
    invitation_links_text = ""
    if is_invitation:
        guidebook_url = account_guidebook_url.strip()
        links = []
        if guidebook_url:
            links.append(("📖 Panduan Penggunaan" if language == "id" else "📖 Guidebook", guidebook_url))
        links.append(("🌐 Akses Sistem" if language == "id" else "🌐 System Access", account_system_url))
        for label, url in links:
            invitation_links_html += (
                '<p style="margin:12px 0 0;font-size:14px;line-height:22px;overflow-wrap:anywhere">'
                f'{label}: <a href="{html.escape(url, quote=True)}" style="color:#273896">'
                f'{html.escape(url)}</a></p>'
            )
            invitation_links_text += f"{label}: {url}\n\n"

    content = (
        '<h1 style="margin:0 0 16px;color:#273896;'
        'font-size:22px;line-height:30px">'
        f'{heading}'
        '</h1>'

        f'<p style="margin:0 0 12px;font-size:14px;'
        f'line-height:22px">'
        f'{greeting} {safe_name},'
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
        f'{expiry_note}'
        '</p>'

        f'{invitation_links_html}'

        '<p style="margin:24px 0 0;border-top:1px solid #e5e7eb;'
        'padding-top:16px;color:#64748b;font-size:12px;'
        'line-height:18px">'
        f'{ignore_note}'
        '</p>'
    )
    html_content = build_email_layout(content, language=language)

    text_content = (
        f"{greeting} {recipient_name or ('Pengemudi' if language == 'id' else 'User')},\n\n"
        f"{intro}\n\n"
        f"{action_label}:\n{reset_url}\n\n"
        f"{expiry_note}\n\n"
        f"{invitation_links_text}"
        f"{ignore_note}"
    )

    return send_email(
        to_email=to_email,
        subject=subject,
        html_content=html_content,
        text_content=text_content,
    )
