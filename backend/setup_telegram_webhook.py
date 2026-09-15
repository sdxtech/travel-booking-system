"""Run manually after configuring secrets and deploying the Telegram endpoint."""
import argparse
import os
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

from telegram_service import bot_username, telegram_api, telegram_linking_enabled, TelegramDeliveryError


def main():
    parser = argparse.ArgumentParser(description="Register BookingDriverBot's HTTPS webhook")
    parser.add_argument("url", help="Full public HTTPS URL ending in /telegram/webhook")
    parser.add_argument(
        "--replace-existing",
        action="store_true",
        help="Replace a different existing webhook (needed when moving between local and production)",
    )
    args = parser.parse_args()
    env = "production" if os.getenv("APP_ENV") == "production" else "development"
    load_dotenv(Path(__file__).resolve().parent.parent / f".env.{env}")
    parsed = urlparse(args.url)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment or not parsed.path.endswith("/telegram/webhook")):
        parser.error("Use the public HTTPS backend URL ending in /telegram/webhook")
    if not telegram_linking_enabled():
        parser.error("Set TELEGRAM_BOT_TOKEN and a 32-256 character TELEGRAM_WEBHOOK_SECRET first")
    try:
        bot = telegram_api("getMe", {})
        if str(bot.get("username", "")).lower() != bot_username().lower():
            parser.error("The token belongs to a different bot than TELEGRAM_BOT_USERNAME")
        info = telegram_api("getWebhookInfo", {})
        if info.get("url") and info["url"] != args.url and not args.replace_existing:
            parser.error(
                "This bot already has a different webhook. Re-run with --replace-existing only when you intend to switch it."
            )
        telegram_api("setWebhook", {
            "url": args.url, "secret_token": os.environ["TELEGRAM_WEBHOOK_SECRET"].strip(),
            "allowed_updates": ["message"], "drop_pending_updates": False,
        })
    except TelegramDeliveryError as exc:
        parser.exit(1, f"{exc}\n")
    print("Telegram webhook registered. Drivers can now use Connect Telegram and click Start.")


if __name__ == "__main__":
    main()
