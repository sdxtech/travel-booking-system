from __future__ import annotations

from datetime import datetime, timedelta, timezone
import asyncio
import contextlib
from pymongo import ReturnDocument
from starlette.concurrency import run_in_threadpool
from typing import Mapping, Optional
from uuid import uuid4

from driver_localization import driver_notification_details, driver_notification_message
from email_service import email_delivery_enabled, send_notification_email
from mongo_client import db
from telegram_service import telegram_delivery_enabled, send_notification_telegram
from realtime_service import publish_notification
from push_service import queue_notification_push


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_user_notification(
    user_id: Optional[str],
    message: str,
    *,
    event: str,
    entity_type: str,
    entity_id: str,
    status: Optional[str] = None,
    actor_id: Optional[str] = None,
    email_details: Optional[Mapping[str, object]] = None,
) -> Optional[str]:
    """Create a notification entry under a user document and return the new notification id."""
    if not user_id:
        return None

    notification_id = uuid4().hex
    user_snapshot = db["users"].find_one(
        {"_id": str(user_id)}, {"email": 1, "name": 1, "role": 1, "disabled": 1, "banned": 1, "telegram_chat_id": 1},
    ) or {}
    language = "id" if user_snapshot.get("role") == "driver" else "en"
    if language == "id":
        message = driver_notification_message(message, event, status)
        email_details = driver_notification_details(email_details)
    recipient_email = str(user_snapshot.get("email") or "").strip().lower()
    should_send_email = bool(recipient_email and email_delivery_enabled())
    chat_id = user_snapshot.get("telegram_chat_id")
    should_send_telegram = bool(
        user_snapshot.get("role") == "driver" and not user_snapshot.get("disabled") and not user_snapshot.get("banned")
        and chat_id and telegram_delivery_enabled()
    )
    db["notifications"].insert_one(
        {
            "_id": notification_id,
            "user_id": str(user_id),
            "message": message,
            "read": False,
            "event": event,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "status": status,
            "actor_id": actor_id,
            "created_at": utc_now(),
            "email_to": recipient_email or None,
            "email_status": "pending" if should_send_email else "skipped",
            "telegram_status": "pending" if should_send_telegram else "skipped",
            "delivery_state": "pending",
            "delivery_after": utc_now(),
            "delivery_payload": {
                "recipient_name": user_snapshot.get("name"),
                "chat_id": chat_id, "language": language,
                "details": dict(email_details or {}),
            },
        }
    )

    publish_notification(str(user_id), event)

    if user_snapshot and not user_snapshot.get("disabled") and not user_snapshot.get("banned"):
        try:
            queue_notification_push(str(user_id), notification_id)
        except Exception:
            # Push problems must not block in-app, email, Telegram, or the booking itself.
            pass

    return notification_id


def deliver_next_notification():
    """Claim a persisted delivery; expired leases recover after a process restart."""
    now = utc_now()
    notice = db["notifications"].find_one_and_update(
        {"delivery_state": {"$in": ["pending", "processing"]}, "delivery_after": {"$lte": now}},
        {"$set": {"delivery_state": "processing", "delivery_after": now + timedelta(minutes=5)}},
        sort=[("created_at", 1)], return_document=ReturnDocument.AFTER,
    )
    if not notice:
        return False
    notification_id = notice["_id"]
    payload = notice.get("delivery_payload") or {}
    user_snapshot = {"name": payload.get("recipient_name")}
    recipient_email = notice.get("email_to")
    message = notice["message"]
    event = notice["event"]
    entity_type = notice["entity_type"]
    email_details = payload.get("details")
    language = payload.get("language", "en")
    chat_id = payload.get("chat_id")
    should_send_email = notice.get("email_status") == "pending"
    current_user = db["users"].find_one({"_id": notice["user_id"]}) or {}
    should_send_telegram = (
        notice.get("telegram_status") == "pending" and current_user.get("role") == "driver"
        and not current_user.get("disabled") and not current_user.get("banned")
        and chat_id and current_user.get("telegram_chat_id") == chat_id
    )
    if notice.get("telegram_status") == "pending" and not should_send_telegram:
        db["notifications"].update_one({"_id": notification_id}, {"$set": {"telegram_status": "skipped"}})
    if should_send_email:
        try:
            smtp_message_id = send_notification_email(
                to_email=recipient_email,
                recipient_name=user_snapshot.get("name"),
                message=message,
                event=event,
                entity_type=entity_type,
                notification_id=notification_id,
                details=email_details,
                language=language,
            )
            db["notifications"].update_one(
                {"_id": notification_id},
                {
                    "$set": {
                        "email_status": "sent",
                        "email_provider": "hostinger_smtp",
                        "email_provider_id": smtp_message_id,
                        "email_sent_at": utc_now(),
                    }
                },
            )
        except Exception as exc:
            db["notifications"].update_one(
                {"_id": notification_id},
                {
                    "$set": {
                        "email_status": "failed",
                        "email_provider": "hostinger_smtp",
                        "email_error": str(exc)[:500],
                        "email_failed_at": utc_now(),
                    }
                },
            )
            print(f"Email notification {notification_id} failed: {exc}")
    if should_send_telegram:
        try:
            message_id = send_notification_telegram(
                chat_id=chat_id, recipient_name=user_snapshot.get("name"), message=message,
                event=event, entity_type=entity_type, details=email_details,
            )
            db["notifications"].update_one({"_id": notification_id}, {"$set": {
                "telegram_status": "sent", "telegram_provider_id": message_id, "telegram_sent_at": utc_now(),
            }})
        except Exception:
            # Request exceptions can contain the bot token in their URL. Never store/log them.
            try:
                db["notifications"].update_one({"_id": notification_id}, {"$set": {
                    "telegram_status": "failed", "telegram_error": "Telegram delivery failed",
                    "telegram_failed_at": utc_now(),
                }})
            except Exception:
                pass
            print(f"Telegram notification {notification_id} failed")


    db["notifications"].update_one({"_id": notification_id}, {
        "$set": {"delivery_state": "done"}, "$unset": {"delivery_payload": "", "delivery_after": ""},
    })
    return True


class NotificationWorker:
    task = None

    async def run(self):
        while True:
            try:
                worked = await run_in_threadpool(deliver_next_notification)
            except Exception:
                worked = False
            await asyncio.sleep(0.1 if worked else 1)

    async def start(self):
        if self.task is None:
            self.task = asyncio.create_task(self.run())

    async def stop(self):
        if self.task is not None:
            self.task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.task
            self.task = None


notification_worker = NotificationWorker()


def notify_roles(
    roles: tuple[str, ...],
    message: str,
    *,
    event: str,
    entity_type: str,
    entity_id: str,
    status: Optional[str] = None,
    actor_id: Optional[str] = None,
    email_details: Optional[Mapping[str, object]] = None,
) -> int:
    """Broadcast a notification to every user whose role is in the given list."""
    delivered = 0
    for role in roles:
        snapshots = db["users"].find({"role": role}, {"_id": 1})
        for user_doc in snapshots:
            created_id = create_user_notification(
                str(user_doc.get("_id")),
                message,
                event=event,
                entity_type=entity_type,
                entity_id=entity_id,
                status=status,
                actor_id=actor_id,
                email_details=email_details,
            )
            if created_id:
                delivered += 1
    return delivered
