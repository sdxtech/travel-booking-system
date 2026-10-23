"""Attach previously unlinked office bookings to registered Employees by email."""
import logging
import re
from datetime import datetime, timezone

from audit_service import record_audit_event
from realtime_service import publish_document_change

logger = logging.getLogger(__name__)


def link_employee_bookings(database, user_id):
    # Read the trusted profile, never an email supplied by the booking viewer.
    try:
        user = database["users"].find_one({"_id": user_id}) or {}
        email = str(user.get("email") or "").strip().lower()
        if user.get("role") != "user" or not email:
            return 0
        query = {
            "user_id": None,
            "requester_email": {"$regex": r"^\s*" + re.escape(email) + r"\s*$", "$options": "i"},
        }
        linked = 0
        for booking in database["bookings"].find(query):
            result = database["bookings"].update_one(
                {**query, "_id": booking["_id"]},
                {"$set": {"user_id": user_id, "updated_at": datetime.now(timezone.utc)}},
            )
            if result.modified_count:
                linked += 1
                publish_document_change("bookings", booking["_id"], booking)
                record_audit_event(
                    action="Link Booking to Employee", status="success", target=str(booking["_id"]),
                    details={"changes": [{"field": "user_id", "before": None, "after": user_id}]},
                )
        return linked
    except Exception:
        # Account creation must remain successful; history/validation retries the link.
        logger.warning("Employee booking linking deferred until the next history request")
        return 0
