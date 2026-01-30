from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from mongo_client import db


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
) -> Optional[str]:
    """Create a notification entry under a user document and return the new notification id."""
    if not user_id:
        return None

    notification_id = uuid4().hex
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
        }
    )
    return notification_id


def notify_roles(
    roles: tuple[str, ...],
    message: str,
    *,
    event: str,
    entity_type: str,
    entity_id: str,
    status: Optional[str] = None,
    actor_id: Optional[str] = None,
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
            )
            if created_id:
                delivered += 1
    return delivered
