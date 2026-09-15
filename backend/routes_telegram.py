import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from main import get_current_user
from mongo_client import db
from telegram_service import bot_username, telegram_linking_enabled

router = APIRouter(prefix="/telegram", tags=["telegram"])


def driver_user(current_user=Depends(get_current_user)):
    if current_user.get("role") != "driver":
        raise HTTPException(403, "Telegram notifications are currently available to Drivers only")
    return current_user


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


@router.get("/me")
def telegram_status(response: Response, current_user=Depends(driver_user)):
    response.headers["Cache-Control"] = "no-store"
    doc = db["users"].find_one({"_id": current_user["uid"]}, {"telegram_chat_id": 1}) or {}
    return {"configured": telegram_linking_enabled(), "connected": bool(doc.get("telegram_chat_id")),
            "bot_username": bot_username()}


@router.post("/connect")
def connect_telegram(response: Response, current_user=Depends(driver_user)):
    response.headers["Cache-Control"] = "no-store"
    if not telegram_linking_enabled():
        raise HTTPException(503, "Telegram has not been configured by the administrator yet")
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    result = db["users"].update_one(
        {"_id": current_user["uid"], "role": "driver", "disabled": {"$ne": True}},
        {"$set": {"telegram_link_hash": token_hash(token), "telegram_link_expires_at": expires_at}},
    )
    if not result.matched_count:
        raise HTTPException(403, "Driver account is not available")
    return {"url": f"https://t.me/{bot_username()}?start={token}", "expires_at": expires_at}


@router.delete("/connection")
def disconnect_telegram(current_user=Depends(driver_user)):
    db["users"].update_one({"_id": current_user["uid"]}, {"$unset": {
        "telegram_chat_id": "", "telegram_connected_at": "",
        "telegram_link_hash": "", "telegram_link_expires_at": "",
    }})
    return {"connected": False}


class TelegramChat(BaseModel):
    id: int
    type: str


class TelegramSender(BaseModel):
    id: int
    is_bot: bool = False


class TelegramMessage(BaseModel):
    chat: TelegramChat
    sender: TelegramSender | None = Field(default=None, alias="from")
    text: str = ""


class TelegramUpdate(BaseModel):
    update_id: int
    message: TelegramMessage | None = None


@router.post("/webhook")
def telegram_webhook(update: TelegramUpdate, x_telegram_bot_api_secret_token: str = Header(default="")):
    expected = os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip()
    if not telegram_linking_enabled() or not secrets.compare_digest(
        x_telegram_bot_api_secret_token.encode(), expected.encode(),
    ):
        raise HTTPException(403, "Invalid Telegram webhook secret")
    message = update.message
    if (not message or message.chat.type != "private" or not message.sender
            or message.sender.is_bot or message.chat.id <= 0 or message.sender.id != message.chat.id):
        return {"ok": True}
    match = re.fullmatch(r"/start(?:@" + re.escape(bot_username()) + r")? ([A-Za-z0-9_-]{43})", message.text.strip())
    if not match:
        return {"ok": True}
    # Consume the short-lived token and bind the chat in one atomic write.
    # Replays, expired links, disabled accounts, and changed roles cannot bind.
    try:
        db["users"].find_one_and_update(
            {"telegram_link_hash": token_hash(match[1]),
             "telegram_link_expires_at": {"$gt": datetime.now(timezone.utc)},
             "role": "driver", "disabled": {"$ne": True}},
            {"$set": {"telegram_chat_id": str(message.chat.id), "telegram_connected_at": datetime.now(timezone.utc)},
             "$unset": {"telegram_link_hash": "", "telegram_link_expires_at": ""}},
        )
    except DuplicateKeyError:
        # A personal chat can belong to only one account. Never silently transfer it.
        pass
    return {"ok": True}
