"""Durable, resumable validation reminder operations for standalone MongoDB."""
from datetime import timedelta
from hashlib import sha256
import re
from uuid import uuid4

from pymongo import ReturnDocument

from mongo_client import db
from notifications_service import create_user_notification, queue_email_only_notification, utc_now
from realtime_service import publish_document_change


def _plan_booking(operation, booking_id):
    booking = db["bookings"].find_one({"_id": booking_id})
    if not booking or booking.get("status") != "awaiting_validation":
        return {"skip": "Booking is not waiting for validation"}
    linked_uid = booking.get("user_id")
    email = str(booking.get("requester_email") or "").strip().lower()
    target = db["users"].find_one({"_id": linked_uid}) if linked_uid else None
    if linked_uid and not target:
        return {"skip": "Linked account no longer exists; check the booking account before sending",
                "request_id": str(booking.get("request_id") or booking_id)}
    if not linked_uid and email:
        target = db["users"].find_one({"email": email}) or db["users"].find_one(
            {"email": {"$regex": r"^\s*" + re.escape(email) + r"\s*$", "$options": "i"}}
        )
    if target and (target.get("role") not in ("user", "office_coordinator", "superadmin")
                   or target.get("disabled") or target.get("banned")):
        return {"skip": "Recipient account is not available"}
    recipient_id = str(target["_id"]) if target else None
    if not recipient_id and not email:
        return {"skip": "Booking has no recipient account or email"}
    fields = ("_id", "request_id", "driver_id", "driver_name", "pickup_location", "destination",
              "departure_time", "estimated_arrival_time")
    return {
        "booking": {key: booking.get(key) for key in fields},
        "expected_user_id": linked_uid,
        "expected_email": booking.get("requester_email"),
        "expected_updated_at": booking.get("updated_at"),
        "user_id": recipient_id,
        "email": email,
        "name": (target or {}).get("name") or booking.get("requester_name"),
    }


def process_operation(operation):
    """Resume an owned job; each persisted item and notification is safe to replay."""
    from routes_bookings import _build_validation_reminder_email_payload

    collection = db["validation_reminder_operations"]
    op_id = operation["_id"]
    token = operation["lease_token"]
    owner = {"_id": op_id, "state": "processing", "lease_token": token}
    receipt = f"validation_reminder_receipts.{op_id}"
    plans = operation["items"]
    for index, item in enumerate(plans):
        # Renew before each write so another process can recover an interrupted job.
        if not collection.update_one(owner, {"$set": {"lease_until": utc_now() + timedelta(minutes=10)}}).matched_count:
            return
        if item.get("result"):
            continue
        plan = item.get("plan")
        if plan is None:
            plan = _plan_booking(operation, item["booking_id"])
            collection.update_one(owner, {"$set": {f"items.{index}.plan": plan}})
            item["plan"] = plan
        result = "skipped"
        if not plan.get("skip"):
            updates = {
                "validation_reminder_id": op_id,
                "validation_reminder_sent_at": operation["created_at"],
                "validation_reminder_expires_at": operation["expires_at"],
                "validation_reminder_sent_by": operation["actor_id"],
                "updated_at": utc_now(),
                receipt: True,
            }
            if not plan["expected_user_id"] and plan["user_id"]:
                updates["user_id"] = plan["user_id"]
            query = {
                "_id": item["booking_id"], "status": "awaiting_validation",
                "user_id": plan["expected_user_id"], "requester_email": plan["expected_email"],
                "updated_at": plan["expected_updated_at"], receipt: {"$ne": True},
            }
            written = db["bookings"].update_one(query, {"$set": updates})
            if written.matched_count or db["bookings"].find_one({"_id": item["booking_id"], receipt: True}):
                result = "reminded"
                publish_document_change("bookings", item["booking_id"], plan["booking"])
        item["result"] = result
        collection.update_one(owner, {"$set": {f"items.{index}.result": result}})

    groups = {}
    for item in plans:
        if item.get("result") != "reminded":
            continue
        plan = item["plan"]
        key = ("user", plan["user_id"]) if plan["user_id"] else ("email", plan["email"])
        group = groups.setdefault(key, {"plan": plan, "bookings": []})
        group["bookings"].append(plan["booking"])
    for (kind, recipient), group in groups.items():
        if not collection.update_one(owner, {"$set": {"lease_until": utc_now() + timedelta(minutes=10)}}).matched_count:
            return
        message, details, booking_id = _build_validation_reminder_email_payload(group["bookings"])
        notice_id = sha256(f"{op_id}:{kind}:{recipient}".encode()).hexdigest()
        kwargs = dict(event="validation_reminder", entity_type="booking", entity_id=booking_id,
                      status="awaiting_validation", actor_id=operation["actor_id"],
                      email_details=details, notification_id=notice_id)
        if kind == "user":
            create_user_notification(recipient, message, **kwargs)
        else:
            queue_email_only_notification(recipient, group["plan"]["name"], message, **kwargs)
    reminded = sum(item.get("result") == "reminded" for item in plans)
    error = None
    if not reminded:
        error = next((item.get("plan", {}).get("skip") for item in plans if item.get("plan", {}).get("skip")),
                     "Bookings changed. Please refresh and try again.")
    collection.update_one(owner, {"$set": {
        "state": "done" if reminded else "failed", "error": error,
        "reminded_bookings": reminded, "skipped_bookings": len(plans) - reminded,
        "notified_recipients": len(groups),
        "in_app_recipients": sum(kind == "user" for kind, _ in groups),
        "skipped_details": [
            {"request_id": str(item.get("plan", {}).get("request_id") or item["booking_id"]),
             "reason": item.get("plan", {}).get("skip") or "Booking changed; refresh and retry"}
            for item in plans if item.get("result") == "skipped"
        ],
        "finished_at": utc_now(),
    }, "$unset": {"lease_token": "", "lease_until": ""}})
    for item in plans:
        db["bookings"].update_one({"_id": item["booking_id"]}, {"$unset": {receipt: ""}})


def process_next_validation_reminder(operation_id=None):
    now = utc_now()
    token = uuid4().hex
    query = {"$or": [{"state": "pending"}, {"state": "processing", "lease_until": {"$lte": now}}]}
    if operation_id:
        query["_id"] = operation_id
    operation = db["validation_reminder_operations"].find_one_and_update(
        query, {"$set": {"state": "processing", "lease_token": token,
                         "lease_until": now + timedelta(minutes=10)}},
        sort=[("created_at", 1)], return_document=ReturnDocument.AFTER,
    )
    if not operation:
        return False
    try:
        process_operation(operation)
    except Exception:
        # An interrupted operation is retried with the same persisted plans and notice IDs.
        db["validation_reminder_operations"].update_one(
            {"_id": operation["_id"], "lease_token": token},
            {"$set": {"state": "pending"}, "$unset": {"lease_token": "", "lease_until": ""}},
        )
        raise
    return True
