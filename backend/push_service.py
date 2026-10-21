"""Firebase Cloud Messaging HTTP v1 through a durable per-device Mongo outbox."""
import asyncio
import contextlib
from functools import lru_cache
import hashlib
import os
import re
from datetime import datetime, timedelta, timezone

import requests
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import service_account
from pymongo import ReturnDocument
from starlette.concurrency import run_in_threadpool

from mongo_client import db

MAX_DEVICES = 10
MAX_ATTEMPTS = 3


def utc_now():
    return datetime.now(timezone.utc)


def device_id(project_id, fid):
    return hashlib.sha256(f"{project_id}:{fid}".encode("utf-8")).hexdigest()


def push_config():
    """Return public Firebase settings plus the local credential path, never key contents."""
    if os.getenv("FCM_ENABLED", "true").strip().lower() not in {"1", "true", "yes", "on"}:
        return None
    firebase = {key: os.getenv(name, "").strip() for key, name in {
        "apiKey": "FIREBASE_API_KEY", "authDomain": "FIREBASE_AUTH_DOMAIN",
        "projectId": "FIREBASE_PROJECT_ID", "messagingSenderId": "FIREBASE_MESSAGING_SENDER_ID",
        "appId": "FIREBASE_APP_ID", "storageBucket": "FIREBASE_STORAGE_BUCKET",
    }.items()}
    certificate = os.getenv("FIREBASE_WEB_PUSH_CERTIFICATE_KEY", "").strip()
    credential_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if not all(firebase[key] for key in ("apiKey", "projectId", "messagingSenderId", "appId")):
        return None
    if (not re.fullmatch(r"[a-z][a-z0-9-]{4,61}[a-z0-9]", firebase["projectId"])
            or not re.fullmatch(r"[A-Za-z0-9_-]{87}={0,1}", certificate)
            or not credential_path or not os.path.isfile(credential_path)):
        return None
    return {"firebase": {key: value for key, value in firebase.items() if value},
            "certificate_key": certificate, "credential_path": credential_path}


@lru_cache(maxsize=1)
def load_credentials(path, modified_at):
    return service_account.Credentials.from_service_account_file(
        path, scopes=["https://www.googleapis.com/auth/firebase.messaging"],
    )


def access_token(config):
    path = config["credential_path"]
    credentials = load_credentials(path, os.stat(path).st_mtime_ns)
    if credentials.project_id != config["firebase"]["projectId"]:
        raise ValueError("Firebase credential project does not match")
    if not credentials.valid:
        with requests.Session() as session:
            session.max_redirects = 0
            transport = GoogleAuthRequest(session=session)

            def bounded_request(**kwargs):
                kwargs["timeout"] = 5
                return transport(**kwargs)

            credentials.refresh(bounded_request)
    return credentials.token


class FCMDeliveryError(Exception):
    def __init__(self, status_code, provider_error=None):
        super().__init__("Firebase notification delivery failed")
        self.status_code = status_code
        self.provider_error = provider_error


def queue_notification_push(user_id, notification_id):
    """Queue one idempotent delivery per subscribed device, without logging subscriptions."""
    config = push_config()
    if not config:
        return 0
    now = utc_now()
    queued = 0
    for subscription in db["push_subscriptions"].find({
        "user_id": user_id, "provider": "fcm", "project_id": config["firebase"]["projectId"],
    }).limit(MAX_DEVICES):
        db["push_jobs"].update_one(
            {"_id": f"{notification_id}:{subscription['_id']}"},
            {"$setOnInsert": {
                "user_id": user_id, "notification_id": notification_id,
                "subscription_id": subscription["_id"], "revision": subscription["revision"],
                "status": "pending", "attempts": 0, "next_attempt_at": now,
                "created_at": now, "expires_at": now + timedelta(days=7),
            }}, upsert=True,
        )
        queued += 1
    return queued


def notification_path(role, entity_type):
    if role == "driver":
        return "/driver/home"
    if role in {"office_coordinator", "superadmin"}:
        prefix = "/admin" if role == "superadmin" else "/office"
        if entity_type == "booking":
            return prefix + "/driver-history"
        if entity_type == "ticket":
            return prefix + "/ticket-history"
        return prefix + "/home"
    if entity_type == "booking":
        return "/user/booking-history"
    if entity_type == "ticket":
        return "/user/ticket-history"
    return "/user/home"


def send_push(subscription, payload, config):
    project = config["firebase"]["projectId"]
    if subscription.get("provider") != "fcm" or subscription.get("project_id") != project:
        raise ValueError("Firebase project does not match subscription")
    # Data-only messages: our worker applies recipient checks before displaying anything.
    message = {"fid": subscription["fid"], "data": {key: str(value) for key, value in payload.items()},
               "webpush": {"headers": {"TTL": "3600", "Urgency": "high"}}}
    with requests.Session() as session:
        session.max_redirects = 0
        response = session.post(
            f"https://fcm.googleapis.com/v1/projects/{project}/messages:send",
            headers={"Authorization": f"Bearer {access_token(config)}"},
            json={"message": message}, timeout=5, allow_redirects=False,
        )
    if not response.ok:
        provider_error = None
        with contextlib.suppress(ValueError, TypeError, AttributeError):
            details = response.json().get("error", {}).get("details", [])
            for detail in details:
                if detail.get("@type") == "type.googleapis.com/google.firebase.fcm.v1.FcmError":
                    code = detail.get("errorCode")
                    if code in {"UNREGISTERED", "INVALID_ARGUMENT", "SENDER_ID_MISMATCH", "QUOTA_EXCEEDED", "UNAVAILABLE", "INTERNAL", "THIRD_PARTY_AUTH_ERROR"}:
                        provider_error = code
        if response.status_code == 401:
            load_credentials.cache_clear()
        raise FCMDeliveryError(response.status_code, provider_error)
    return response.json().get("name")


def deliver_next_push():
    config = push_config()
    if not config:
        return False
    now = utc_now()
    db["push_jobs"].update_many(
        {"status": "processing", "attempts": {"$gte": MAX_ATTEMPTS}, "lease_until": {"$lte": now}},
        {"$set": {"status": "failed", "last_error": "Delivery lease expired"}},
    )
    job = db["push_jobs"].find_one_and_update(
        {"$or": [
            {"status": "pending", "next_attempt_at": {"$lte": now}},
            {"status": "processing", "lease_until": {"$lte": now}},
        ], "attempts": {"$lt": MAX_ATTEMPTS}, "expires_at": {"$gt": now}},
        {"$set": {"status": "processing", "lease_until": now + timedelta(seconds=60)}, "$inc": {"attempts": 1}},
        sort=[("next_attempt_at", 1)], return_document=ReturnDocument.AFTER,
    )
    if not job:
        return False
    try:
        owner = {"_id": job["subscription_id"], "user_id": job["user_id"], "revision": job["revision"]}
        subscription = db["push_subscriptions"].find_one(owner)
        user = db["users"].find_one({"_id": job["user_id"]}, {"role": 1, "disabled": 1, "banned": 1})
        notification = db["notifications"].find_one({"_id": job["notification_id"], "user_id": job["user_id"]})
        if (not subscription or subscription.get("provider") != "fcm"
                or subscription.get("project_id") != config["firebase"]["projectId"]
                or not user or user.get("disabled") or user.get("banned") or not notification):
            db["push_jobs"].update_one({"_id": job["_id"]}, {"$set": {"status": "skipped"}})
            return True
        payload = {
            "title": "Booking App", "body": str(notification.get("message") or "")[:500],
            "notification_id": job["notification_id"], "user_id": job["user_id"],
            "url": notification_path(user.get("role"), notification.get("entity_type")),
        }
        try:
            provider_id = send_push(subscription, payload, config)
        except Exception as exc:
            code = exc.status_code if isinstance(exc, FCMDeliveryError) else None
            if isinstance(exc, FCMDeliveryError) and exc.provider_error == "UNREGISTERED":
                db["push_subscriptions"].delete_one(owner)
                state = "expired"
            else:
                permanent = code in {400, 403, 404}
                state = "failed" if permanent or job["attempts"] >= MAX_ATTEMPTS else "pending"
            # Exception strings can contain endpoint capabilities and encryption material.
            db["push_jobs"].update_one({"_id": job["_id"]}, {"$set": {
                "status": state, "next_attempt_at": now + timedelta(seconds=30 * 2 ** job["attempts"]),
                "last_error": "Push delivery failed", "http_status": code,
            }})
            return True
        db["push_jobs"].update_one({"_id": job["_id"]}, {"$set": {
            "status": "sent", "provider": "fcm", "provider_id": provider_id, "sent_at": utc_now(),
        }})
    except Exception:
        # The lease permits recovery after a database outage or worker restart.
        return False
    return True


async def run_push_worker():
    while True:
        try:
            worked = await run_in_threadpool(deliver_next_push)
        except Exception:
            worked = False
        await asyncio.sleep(0.1 if worked else 2)


class PushWorker:
    task = None

    async def start(self):
        if not self.task:
            self.task = asyncio.create_task(run_push_worker())

    async def stop(self):
        if self.task:
            self.task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.task
            self.task = None


worker = PushWorker()
