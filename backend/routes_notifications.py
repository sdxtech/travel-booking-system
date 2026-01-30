from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from pymongo import ReturnDocument

from main import get_current_user
from mongo_client import db

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationResponse(BaseModel):
    id: str
    message: str = Field(..., min_length=1)
    read: bool = False
    event: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    status: Optional[str] = None
    actor_id: Optional[str] = None
    created_at: Optional[datetime] = None


class MarkAllReadResponse(BaseModel):
    updated: int


def serialize_notification(doc_snapshot) -> NotificationResponse:
    """Map a MongoDB notification document into the response model."""
    data = doc_snapshot or {}
    return NotificationResponse(
        id=str(data.get("_id")),
        message=data.get("message") or "",
        read=bool(data.get("read", False)),
        event=data.get("event"),
        entity_type=data.get("entity_type"),
        entity_id=data.get("entity_id"),
        status=data.get("status"),
        actor_id=data.get("actor_id"),
        created_at=data.get("created_at"),
    )


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/my", response_model=list[NotificationResponse])
def list_my_notifications(limit: int = 25, current_user=Depends(get_current_user)):
    """Return recent notifications for the current user (newest first)."""
    uid = current_user["uid"]
    if limit < 1:
        limit = 1
    if limit > 100:
        limit = 100

    snapshots = (
        db["notifications"]
        .find({"user_id": uid})
        .sort("created_at", -1)
        .limit(limit)
    )
    return [serialize_notification(doc) for doc in snapshots]


@router.patch("/mark-all-read", response_model=MarkAllReadResponse)
def mark_all_notifications_read(current_user=Depends(get_current_user)):
    """Mark every unread notification as read for the current user."""
    uid = current_user["uid"]

    result = db["notifications"].update_many(
        {"user_id": uid, "read": False},
        {"$set": {"read": True, "read_at": utc_now()}},
    )
    return MarkAllReadResponse(updated=result.modified_count)


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(notification_id: str, current_user=Depends(get_current_user)):
    """Mark a single notification as read for the current user."""
    uid = current_user["uid"]
    updated = db["notifications"].find_one_and_update(
        {"_id": notification_id, "user_id": uid},
        {"$set": {"read": True, "read_at": utc_now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    return serialize_notification(updated)
