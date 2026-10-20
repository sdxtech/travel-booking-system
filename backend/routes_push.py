"""Per-device subscriptions for every authenticated role; never accept a recipient ID."""
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from pymongo.errors import DuplicateKeyError

from main import get_current_user
from mongo_client import db
from push_service import MAX_DEVICES, device_id, push_config, utc_now
from routes_realtime import allowed_origins

router = APIRouter(prefix="/notifications/push", tags=["push notifications"])


def trusted_origin(request: Request):
    if request.headers.get("origin", "").rstrip("/") not in allowed_origins():
        raise HTTPException(403, "Untrusted origin")


class PushSubscription(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fid: str = Field(pattern=r"^[cdef][A-Za-z0-9_-]{21}$")
    project_id: str = Field(pattern=r"^[a-z][a-z0-9-]{4,61}[a-z0-9]$")


@router.get("/config")
def configuration(current_user=Depends(get_current_user)):
    config = push_config()
    return {"enabled": bool(config), "provider": "fcm", "user_id": current_user["uid"],
            "firebase_config": config["firebase"] if config else None,
            "certificate_key": config["certificate_key"] if config else None}


@router.post("/subscribe", dependencies=[Depends(trusted_origin)])
def subscribe(payload: PushSubscription, current_user=Depends(get_current_user)):
    config = push_config()
    if not config:
        raise HTTPException(503, "Push notifications are not configured")
    if payload.project_id != config["firebase"]["projectId"]:
        raise HTTPException(422, "Firebase project does not match")
    collection = db["push_subscriptions"]
    uid = current_user["uid"]
    identifier = device_id(payload.project_id, payload.fid)
    existing = collection.find_one({"_id": identifier})
    if existing and existing["user_id"] != uid:
        raise HTTPException(409, "This browser subscription belongs to a different account. Disable it first.")
    if not existing and collection.count_documents({"user_id": uid, "provider": "fcm", "project_id": payload.project_id}) >= MAX_DEVICES:
        raise HTTPException(409, "Device limit reached. Disable push on an old device first.")
    now = utc_now()
    try:
        collection.update_one({"_id": identifier, "user_id": uid}, {
            "$set": {"fid": payload.fid, "project_id": payload.project_id, "provider": "fcm", "updated_at": now},
            "$setOnInsert": {"user_id": uid, "revision": uuid4().hex, "created_at": now},
        }, upsert=True)
    except DuplicateKeyError:
        raise HTTPException(409, "Subscription changed. Please try again.") from None
    return {"enabled": True, "user_id": uid}


@router.post("/unsubscribe", dependencies=[Depends(trusted_origin)])
def unsubscribe(payload: PushSubscription, current_user=Depends(get_current_user)):
    db["push_subscriptions"].delete_one({"_id": device_id(payload.project_id, payload.fid), "user_id": current_user["uid"]})
    return {"enabled": False}
