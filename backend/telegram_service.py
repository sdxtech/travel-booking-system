"""Optional Driver Telegram delivery. Never expose token-bearing request URLs."""
import os
import re

import requests

from email_service import build_notification_subject


class TelegramDeliveryError(RuntimeError):
    pass


def bot_username():
    return os.getenv("TELEGRAM_BOT_USERNAME", "BookingDriverBot").strip().lstrip("@")


def telegram_delivery_enabled():
    return bool(os.getenv("TELEGRAM_BOT_TOKEN", "").strip())


def telegram_linking_enabled():
    secret = os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip()
    return bool(telegram_delivery_enabled() and re.fullmatch(r"[A-Za-z0-9_-]{32,256}", secret)
                and re.fullmatch(r"[A-Za-z0-9_]+", bot_username()))


def telegram_api(method, payload):
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        raise TelegramDeliveryError("Telegram is not configured")
    try:
        response = requests.post(
            f"https://api.telegram.org/bot{token}/{method}", json=payload, timeout=10,
        )
        data = response.json()
    except (requests.RequestException, ValueError):
        raise TelegramDeliveryError("Telegram request failed or returned invalid JSON") from None
    if not response.ok or not isinstance(data, dict) or not data.get("ok"):
        raise TelegramDeliveryError(f"Telegram rejected the request (HTTP {response.status_code})")
    return data.get("result")


def send_telegram_message(chat_id, text):
    # Plain text avoids interpreting user-provided routes/names as markup.
    # UTF-16 slicing also keeps emoji-heavy messages within Telegram's limit.
    text = text.encode("utf-16-le")[:4096 * 2].decode("utf-16-le", errors="ignore")
    result = telegram_api("sendMessage", {
        "chat_id": str(chat_id), "text": text,
        "link_preview_options": {"is_disabled": True},
    })
    if not isinstance(result, dict) or not result.get("message_id"):
        raise TelegramDeliveryError("Telegram response did not include a message id")
    return str(result["message_id"])


def send_notification_telegram(*, chat_id, recipient_name, message, event, entity_type):
    app_url = os.getenv("APP_PUBLIC_URL", "").strip()
    title = build_notification_subject(event, entity_type)
    text = f"{title}\n\nHello {recipient_name or 'Driver'},\n\n{message}"
    if app_url:
        text += f"\n\nOpen Booking App: {app_url}"
    return send_telegram_message(chat_id, text)
