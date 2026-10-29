import copy
import re
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

import main  # noqa: F401
import notifications_service
import routes_bookings as routes
from fastapi import HTTPException
from pydantic import ValidationError


class ValidationReminderTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 29, 4, 0, tzinfo=timezone.utc)
        self.users_by_id = {
            "coord-1": {"_id": "coord-1", "role": "office_coordinator", "name": "Coordinator", "email": "coord@example.com"},
            "emp-1": {"_id": "emp-1", "role": "user", "name": "Alice Employee", "email": "alice@example.com"},
            "emp-2": {"_id": "emp-2", "role": "user", "name": "Bob Employee", "email": "bob@example.com"},
            "driver-1": {"_id": "driver-1", "role": "driver", "name": "Pak Budi", "email": "driver@example.com"},
        }
        self.bookings_by_id = {
            "b1": {
                "_id": "b1",
                "request_id": "DRV-001",
                "user_id": "emp-1",
                "driver_id": "driver-1",
                "requester_name": "Alice Employee",
                "requester_email": "alice@example.com",
                "pickup_location": "Head Office",
                "destination": "Client Site A",
                "departure_time": self.now - timedelta(hours=5),
                "estimated_arrival_time": self.now - timedelta(hours=3),
                "passenger_count": 2,
                "starting_mileage": 1000,
                "ending_mileage": 1025,
                "status": "awaiting_validation",
            },
            "b2": {
                "_id": "b2",
                "request_id": "DRV-002",
                "user_id": "emp-1",
                "driver_id": "driver-1",
                "requester_name": "Alice Employee",
                "requester_email": "alice@example.com",
                "pickup_location": "Client Site A",
                "destination": "Head Office",
                "departure_time": self.now - timedelta(hours=3),
                "starting_mileage": 1025,
                "ending_mileage": 1050,
                "status": "awaiting_validation",
            },
            "b3_unlinked": {
                "_id": "b3_unlinked",
                "request_id": "DRV-003",
                "user_id": None,
                "driver_id": "driver-1",
                "requester_name": "Bob Employee",
                "requester_email": "  Bob@Example.com ",
                "pickup_location": "Airport",
                "destination": "Hotel",
                "departure_time": self.now - timedelta(hours=2),
                "starting_mileage": 2000,
                "ending_mileage": 2030,
                "status": "awaiting_validation",
            },
            "b4_external": {
                "_id": "b4_external",
                "request_id": "DRV-004",
                "user_id": None,
                "driver_id": "driver-1",
                "requester_name": "Guest Visitor",
                "requester_email": "guest@external.org",
                "pickup_location": "Office",
                "destination": "Station",
                "departure_time": self.now - timedelta(hours=1),
                "starting_mileage": 3000,
                "ending_mileage": 3010,
                "status": "awaiting_validation",
            },
            "b5_completed": {
                "_id": "b5_completed",
                "request_id": "DRV-005",
                "user_id": "emp-1",
                "driver_id": "driver-1",
                "requester_name": "Alice Employee",
                "requester_email": "alice@example.com",
                "pickup_location": "Office",
                "destination": "Mall",
                "departure_time": self.now - timedelta(days=1),
                "status": "completed",
            },
        }

        self.users_col = Mock()
        self.users_col.find_one.side_effect = self._find_user
        self.users_col.find.side_effect = self._find_users

        self.bookings_col = Mock()
        self.bookings_col.find_one.side_effect = self._find_booking
        self.bookings_col.update_one.side_effect = self._update_booking

        self.fake_db = {"users": self.users_col, "bookings": self.bookings_col}

    def _find_user(self, query, *_args, **_kwargs):
        if "_id" in query:
            doc = self.users_by_id.get(query["_id"])
            return copy.deepcopy(doc) if doc else None
        if "email" in query:
            email_q = query["email"]
            if isinstance(email_q, str):
                for doc in self.users_by_id.values():
                    if doc.get("email") == email_q:
                        return copy.deepcopy(doc)
            elif isinstance(email_q, dict) and "$regex" in email_q:
                for doc in self.users_by_id.values():
                    if re.fullmatch(email_q["$regex"], doc.get("email", ""), re.I):
                        return copy.deepcopy(doc)
        return None

    def _find_users(self, query, *_args, **_kwargs):
        ids = set((query.get("_id") or {}).get("$in") or [])
        return [copy.deepcopy(doc) for uid, doc in self.users_by_id.items() if uid in ids]

    def _find_booking(self, query, *_args, **_kwargs):
        doc = self.bookings_by_id.get(query.get("_id"))
        return copy.deepcopy(doc) if doc else None

    def _update_booking(self, query, change):
        doc = self.bookings_by_id.get(query.get("_id"))
        if not doc:
            return Mock(modified_count=0)
        if "status" in query and doc.get("status") != query["status"]:
            return Mock(modified_count=0)
        if "user_id" in query and doc.get("user_id") != query["user_id"]:
            return Mock(modified_count=0)
        doc.update(change.get("$set", {}))
        return Mock(modified_count=1)

    def test_bulk_send_groups_one_notification_per_recipient_and_sets_expiry(self):
        payload = routes.ValidationReminderSendRequest(
            booking_ids=["b1", "b2", "b3_unlinked", "b4_external", "b5_completed"],
            duration_value=2,
            duration_unit="days",
        )
        with patch.object(routes, "db", self.fake_db), \
                patch.object(routes, "utc_now", return_value=self.now), \
                patch.object(routes, "publish_document_change") as publish_mock, \
                patch.object(routes, "create_user_notification") as notify_user_mock, \
                patch.object(routes, "queue_email_only_notification") as notify_email_mock:
            response = routes.send_validation_reminders(payload, {"uid": "coord-1"})

        self.assertEqual(response.reminded_bookings, 4)
        self.assertEqual(response.skipped_bookings, 1)
        self.assertEqual(response.notified_recipients, 3)
        self.assertEqual(response.in_app_recipients, 2)
        self.assertEqual(response.expires_at, self.now + timedelta(days=2))

        # Alice has 2 awaiting_validation bookings (b1 & b2) -> only 1 combined push/email notification!
        # Bob was unlinked by user_id, matched by email -> auto-linked + 1 notification!
        self.assertEqual(notify_user_mock.call_count, 2)
        notified_uids = [call.args[0] for call in notify_user_mock.call_args_list]
        self.assertEqual(notified_uids, ["emp-1", "emp-2"])

        alice_message = notify_user_mock.call_args_list[0].args[1]
        self.assertIn("2 completed driver bookings", alice_message)
        self.assertIn("DRV-001", alice_message)
        self.assertIn("DRV-002", alice_message)

        # Unregistered guest receives email-only fallback once.
        self.assertEqual(notify_email_mock.call_count, 1)
        self.assertEqual(notify_email_mock.call_args.args[0], "guest@external.org")

        # All 4 awaiting_validation bookings have reminder expiry stamped, and b3_unlinked is now linked to emp-2.
        for bid in ("b1", "b2", "b3_unlinked", "b4_external"):
            self.assertEqual(self.bookings_by_id[bid]["validation_reminder_expires_at"], self.now + timedelta(days=2))
            self.assertTrue(self.bookings_by_id[bid].get("validation_reminder_id"))
        self.assertEqual(self.bookings_by_id["b3_unlinked"]["user_id"], "emp-2")
        self.assertEqual(publish_mock.call_count, 4)

    def test_single_send_rejects_non_awaiting_validation_and_unauthorized_roles(self):
        with patch.object(routes, "db", self.fake_db):
            with self.assertRaises(HTTPException) as forbidden:
                routes.send_validation_reminders(
                    routes.ValidationReminderSendRequest(booking_ids=["b1"], duration_value=12, duration_unit="hours"),
                    {"uid": "emp-1"},
                )
            self.assertEqual(forbidden.exception.status_code, 403)

            with self.assertRaises(HTTPException) as bad_status:
                routes.send_validation_reminders(
                    routes.ValidationReminderSendRequest(booking_ids=["b5_completed"], duration_value=12, duration_unit="hours"),
                    {"uid": "coord-1"},
                )
            self.assertEqual(bad_status.exception.status_code, 400)

    def test_duration_validation_bounds(self):
        with self.assertRaises(ValidationError):
            routes.ValidationReminderSendRequest(booking_ids=["b1"], duration_value=0, duration_unit="hours")
        with self.assertRaises(ValidationError):
            routes.ValidationReminderSendRequest(booking_ids=["b1"], duration_value=366, duration_unit="days")
        valid = routes.ValidationReminderSendRequest(booking_ids=["b1", "b1", " b2 "], duration_value=24, duration_unit="hours")
        self.assertEqual(valid.booking_ids, ["b1", "b2"])

    def test_my_validation_reminders_filters_expired_and_clears_on_validate(self):
        self.bookings_by_id["b1"]["validation_reminder_expires_at"] = self.now + timedelta(hours=4)
        self.bookings_by_id["b1"]["validation_reminder_id"] = "rem-active"
        self.bookings_by_id["b2"]["validation_reminder_expires_at"] = self.now - timedelta(minutes=1)
        self.bookings_by_id["b2"]["validation_reminder_id"] = "rem-expired"

        def find_active(query):
            uid = query["user_id"]
            status_val = query["status"]
            gt_time = query["validation_reminder_expires_at"]["$gt"]
            matched = [
                copy.deepcopy(doc)
                for doc in self.bookings_by_id.values()
                if doc.get("user_id") == uid
                and doc.get("status") == status_val
                and doc.get("validation_reminder_expires_at")
                and doc["validation_reminder_expires_at"] > gt_time
            ]
            return matched

        self.bookings_col.find.side_effect = find_active

        with patch.object(routes, "db", self.fake_db), \
                patch.object(routes, "utc_now", return_value=self.now), \
                patch.object(routes, "link_employee_bookings") as link_mock:
            active_for_emp = routes.list_my_validation_reminders({"uid": "emp-1"})
            active_for_driver = routes.list_my_validation_reminders({"uid": "driver-1"})

        link_mock.assert_called_once_with(self.fake_db, "emp-1")
        self.assertEqual([item.id for item in active_for_emp], ["b1"])
        self.assertEqual(active_for_emp[0].driver_name, "Pak Budi")
        self.assertEqual(active_for_driver, [])

        # Once the employee validates b1, validation_reminder_expires_at is cleared.
        with patch.object(routes, "db", self.fake_db), \
                patch.object(routes, "utc_now", return_value=self.now), \
                patch.object(routes, "enforce_employee_page_permission"), \
                patch.object(routes, "link_employee_bookings"), \
                patch.object(routes, "publish_document_change"), \
                patch.object(routes, "create_user_notification"):
            validated = routes.validate_booking_completion("b1", {"uid": "emp-1"})

        self.assertEqual(validated.status, "completed")
        self.assertIsNone(self.bookings_by_id["b1"]["validation_reminder_expires_at"])

    def test_email_only_notification_queue_delivers_without_user_id(self):
        from test_fcm import Collection

        notifications_col = Collection()
        users_col = Mock()

        with patch.object(notifications_service, "db", {"notifications": notifications_col, "users": users_col}), \
                patch.object(notifications_service, "email_delivery_enabled", return_value=True), \
                patch.object(notifications_service, "send_notification_email", return_value="smtp-id-1") as send_email_mock, \
                patch.object(notifications_service, "queue_notification_push") as push_mock:
            notice_id = notifications_service.queue_email_only_notification(
                "Guest@External.org ",
                "Guest Visitor",
                "Action required: please validate DRV-004.",
                event="validation_reminder",
                entity_type="booking",
                entity_id="b4_external",
                status="awaiting_validation",
                actor_id="coord-1",
                email_details={"Request ID": "DRV-004"},
            )
            self.assertIsNotNone(notice_id)
            push_mock.assert_not_called()
            delivered = notifications_service.deliver_next_notification()

        self.assertTrue(delivered)
        users_col.find_one.assert_not_called()
        send_email_mock.assert_called_once()
        self.assertEqual(send_email_mock.call_args.kwargs["to_email"], "guest@external.org")
        self.assertEqual(notifications_col.items[notice_id]["email_status"], "sent")
        self.assertIsNone(notifications_col.items[notice_id]["user_id"])


if __name__ == "__main__":
    unittest.main()
