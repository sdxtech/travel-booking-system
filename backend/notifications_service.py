from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4
from websocket_manager import manager

from email_service import email_delivery_enabled, send_notification_email
from mongo_client import db


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def create_user_notification(
    user_id: Optional[str],
    message: str,
    *,
    event: str,
    entity_type: str,
    entity_id: str,
    status: Optional[str] = None,
    actor_id: Optional[str] = None,
) -> Optional[str]:
    """Create a notification, persist it, send it over WebSocket,
    and optionally send an email.
    """

    if not user_id:
        return None

    user_id = str(user_id)
    notification_id = uuid4().hex
    created_at = utc_now()

    user_snapshot = (
        db["users"].find_one(
            {"_id": user_id},
            {"email": 1, "name": 1},
        )
        or {}
    )

    recipient_email = (
        str(user_snapshot.get("email") or "")
        .strip()
        .lower()
    )

    should_send_email = bool(
        recipient_email
        and email_delivery_enabled()
    )

    notification = {
        "_id": notification_id,
        "user_id": user_id,
        "message": message,
        "read": False,
        "event": event,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "status": status,
        "actor_id": actor_id,
        "created_at": created_at,
        "email_to": recipient_email or None,
        "email_status": (
            "pending"
            if should_send_email
            else "skipped"
        ),
    }

    db["notifications"].insert_one(
        notification
    )

    try:
        await manager.send_to_user(
            user_id,
            {
                "type": "notification",
                "data": {
                    "id": notification_id,
                    "message": message,
                    "read": False,
                    "event": event,
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "status": status,
                    "actor_id": actor_id,
                    "created_at": created_at.isoformat(),
                },
            },
        )

    except Exception as exc:
        print(
            f"WebSocket notification "
            f"{notification_id} failed: {exc}"
        )

    if should_send_email:
        try:
            resend_email_id = send_notification_email(
                to_email=recipient_email,
                recipient_name=user_snapshot.get("name"),
                message=message,
                event=event,
                entity_type=entity_type,
                notification_id=notification_id,
            )
            db["notifications"].update_one(
                {"_id": notification_id},
                {
                    "$set": {
                        "email_status": "sent",
                        "email_provider": "resend",
                        "email_provider_id": resend_email_id,
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
                        "email_provider": "resend",
                        "email_error": str(exc)[:500],
                        "email_failed_at": utc_now(),
                    }
                },
            )

            print(
                f"Email notification "
                f"{notification_id} failed: {exc}"
            )

    return notification_id


async def notify_roles(
    roles: tuple[str, ...],
    message: str,
    *,
    event: str,
    entity_type: str,
    entity_id: str,
    status: Optional[str] = None,
    actor_id: Optional[str] = None,
) -> int:
    delivered = 0
    for role in roles:
        snapshots = db["users"].find(
            {"role": role},
            {"_id": 1},
        )
        for user_doc in snapshots:
            created_id = await create_user_notification(
                str(user_doc.get("_id")),
                message,
                event=event,
                entity_type=entity_type,
                entity_id=entity_id,
                status=status,
                actor_id=actor_id,
            )
            if created_id:
                delivered += 1
    return delivered
