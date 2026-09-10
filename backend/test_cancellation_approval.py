import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

from fastapi import HTTPException
import main  # noqa: F401
import routes_bookings as bookings
import routes_settings as settings
import settings_service


class CancellationApprovalTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 9, 9, tzinfo=timezone.utc)
        self.document = {
            "_id": "booking-1", "request_id": "SDX-BD-09092026-001",
            "user_id": "employee", "status": "pending",
            "pickup_location": "Office", "destination": "Airport",
            "trip_type": "antar", "passenger_count": 1,
            "departure_time": self.now + timedelta(days=5),
        }
        self.policy = {"auto_approve": False, "unit": "days", "value": 1, "cutoff_time": "17:00"}
        self.role = "user"
        self.collection = Mock()
        self.collection.find_one.side_effect = lambda *args, **kwargs: dict(self.document)
        self.collection.update_one.side_effect = self.update
        def authorize(uid, roles):
            if self.role not in roles:
                raise HTTPException(status_code=403, detail="Forbidden")
            return self.role
        for patcher in [
            patch.object(bookings, "db", {"bookings": self.collection}),
            patch.object(bookings, "ensure_role", side_effect=authorize),
            patch.object(bookings, "enforce_employee_page_permission"),
            patch.object(bookings, "get_booking_cancellation_policy", return_value=self.policy),
            patch.object(bookings, "utc_now", return_value=self.now),
            patch.object(bookings, "create_user_notification"),
            patch.object(bookings, "notify_roles"),
        ]:
            patcher.start()
            self.addCleanup(patcher.stop)

    def update(self, query, changes):
        self.document.update(changes["$set"])
        return Mock(modified_count=1)

    def cancel(self, uid="employee"):
        return bookings.cancel_booking("booking-1", {"uid": uid})

    def review(self, decision):
        return bookings.review_cancellation(
            "booking-1", bookings.CancellationReview(decision=decision), {"uid": "coordinator"},
        )

    def test_manual_mode_keeps_booking_and_notifies_coordinators(self):
        result = self.cancel()
        self.assertEqual(result.status, "pending")
        self.assertEqual(result.cancellation_status, "pending")
        self.assertNotIn("cancelled_at", self.document)
        bookings.notify_roles.assert_called_once()
        self.assertIn("SDX-BD-09092026-001", bookings.notify_roles.call_args.args[1])

    def test_auto_mode_cancels_immediately(self):
        self.policy["auto_approve"] = True
        self.assertEqual(self.cancel().status, "cancelled")
        bookings.notify_roles.assert_not_called()

    def test_approve_cancellation_cancels_and_notifies_employee(self):
        self.cancel()
        self.role = "office_coordinator"
        result = self.review("approved")
        self.assertEqual(result.status, "cancelled")
        self.assertEqual(result.cancellation_status, "approved")
        self.assertEqual(bookings.create_user_notification.call_args.args[0], "employee")

    def test_reject_cancellation_keeps_booking(self):
        self.cancel()
        self.role = "office_coordinator"
        result = self.review("rejected")
        self.assertEqual(result.status, "pending")
        self.assertEqual(result.cancellation_status, "rejected")
        self.assertNotIn("cancelled_at", self.document)

    def test_duplicate_request_does_not_write_twice(self):
        self.cancel()
        with self.assertRaises(HTTPException) as error:
            self.cancel()
        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(self.collection.update_one.call_count, 1)

    def test_cutoff_and_ownership_still_apply(self):
        for uid, departure in [
            ("other", self.now + timedelta(days=5)),
            ("employee", self.now),
        ]:
            self.document["departure_time"] = departure
            with self.assertRaises(HTTPException):
                self.cancel(uid)
        self.collection.update_one.assert_not_called()

    def test_employee_cannot_cancel_approved_or_review_requests(self):
        self.document["status"] = "approved"
        with self.assertRaises(HTTPException):
            self.cancel()
        self.document["cancellation_status"] = "pending"
        with self.assertRaises(HTTPException) as error:
            self.review("approved")
        self.assertEqual(error.exception.status_code, 403)
        self.collection.update_one.assert_not_called()

    def test_review_is_one_time_and_does_not_depend_on_current_policy(self):
        self.cancel()
        self.policy["auto_approve"] = True
        self.role = "office_coordinator"
        self.review("rejected")
        with self.assertRaises(HTTPException) as error:
            self.review("approved")
        self.assertEqual(error.exception.status_code, 409)

    def test_concurrent_change_returns_conflict_without_notification(self):
        self.collection.update_one.side_effect = None
        self.collection.update_one.return_value = Mock(modified_count=0)
        with self.assertRaises(HTTPException) as error:
            self.cancel()
        self.assertEqual(error.exception.status_code, 409)
        bookings.notify_roles.assert_not_called()

    def test_coordinator_must_review_before_booking_approval(self):
        self.cancel()
        self.role = "office_coordinator"
        with self.assertRaises(HTTPException) as error:
            bookings.update_booking_status(
                "booking-1", bookings.BookingStatusUpdate(status="approved", driver_id="driver"),
                {"uid": "coordinator"},
            )
        self.assertEqual(error.exception.status_code, 409)

    def test_superadmin_can_still_cancel_directly(self):
        self.document["status"] = "completed"
        self.role = "superadmin"
        self.assertEqual(self.cancel("admin").status, "cancelled")

    def test_setting_defaults_to_auto_and_only_admin_can_save(self):
        collection = Mock()
        collection.find_one.return_value = {}
        with patch.object(settings_service, "db", {"app_settings": collection}):
            self.assertTrue(settings_service.get_booking_cancellation_policy()["auto_approve"])
            collection.find_one.return_value = {"auto_approve": False}
            self.assertFalse(settings_service.get_booking_cancellation_policy()["auto_approve"])
        with patch.object(settings, "db", {"app_settings": collection}):
            with self.assertRaises(HTTPException) as error:
                settings.update_booking_cancellation_policy(
                    settings.BookingCancellationPolicyUpdate(value=1, unit="days", auto_approve=False),
                    {"uid": "coordinator", "role": "office_coordinator"},
                )
            self.assertEqual(error.exception.status_code, 403)
            collection.update_one.assert_not_called()
        with patch.object(settings, "db", {"app_settings": collection}), patch.object(
            settings, "get_booking_cancellation_policy",
            return_value={**self.policy, "cutoff_minutes": 1440},
        ):
            result = settings.update_booking_cancellation_policy(
                settings.BookingCancellationPolicyUpdate(value=1, unit="days", auto_approve=False),
                {"uid": "admin", "role": "superadmin"},
            )
            self.assertFalse(result.auto_approve)
            self.assertFalse(collection.update_one.call_args.args[1]["$set"]["auto_approve"])


if __name__ == "__main__":
    unittest.main()
