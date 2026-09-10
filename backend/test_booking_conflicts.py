import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

from fastapi import HTTPException

# Load the application first because its routers import get_current_user from main.
import main  # noqa: F401
import routes_bookings as bookings


class BookingConflictTests(unittest.TestCase):
    def setUp(self):
        self.start = datetime(2026, 9, 9, 3, tzinfo=timezone.utc)
        self.end = self.start + timedelta(hours=2)
        self.pending = self.booking("request-b", "SDX-BD-09092026-001", "pending")
        self.collection = Mock()
        self.collection.find_one.return_value = self.pending
        self.collection.find.return_value = []
        patches = [
            patch.object(bookings, "db", {"bookings": self.collection}),
            patch.object(bookings, "ensure_role", return_value="office_coordinator"),
            patch.object(bookings, "resolve_driver", return_value={"name": "Driver 1"}),
            patch.object(bookings, "create_user_notification"),
        ]
        for patcher in patches:
            patcher.start()
            self.addCleanup(patcher.stop)

    def booking(self, booking_id, request_id, status="approved", start=None, end=None):
        return {
            "_id": booking_id,
            "request_id": request_id,
            "driver_id": "driver-1",
            "status": status,
            "departure_time": start or self.start,
            "estimated_arrival_time": end or self.end,
            "pickup_location": "Office",
            "destination": "Site",
            "trip_type": "antar",
            "passenger_count": 1,
        }

    def approve(self):
        return bookings.update_booking_status(
            "request-b",
            bookings.BookingStatusUpdate(status="approved", driver_id="driver-1"),
            current_user={"uid": "coordinator"},
        )

    def test_conflict_error_identifies_existing_request_without_updating_booking(self):
        self.collection.find.return_value = [self.booking("internal-a", "SDX-BD-08092026-003")]
        with self.assertRaises(HTTPException) as raised:
            self.approve()
        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("Cancel booking SDX-BD-08092026-003 before approving", raised.exception.detail)
        self.assertNotIn("internal-a", raised.exception.detail)
        self.collection.update_one.assert_not_called()
        bookings.create_user_notification.assert_not_called()

    def test_lists_all_conflicts_but_excludes_cancelled_adjacent_and_self(self):
        self.collection.find.return_value = [
            self.booking("a", "SDX-BD-08092026-003"),
            self.booking("c", "SDX-BD-08092026-004", "in_progress"),
            self.booking("cancelled", "CANCELLED", "cancelled"),
            self.booking("adjacent", "ADJACENT", start=self.end, end=self.end + timedelta(hours=1)),
            self.booking("request-b", "SELF"),
        ]
        with self.assertRaises(HTTPException) as raised:
            self.approve()
        self.assertIn("Cancel bookings SDX-BD-08092026-003, SDX-BD-08092026-004", raised.exception.detail)
        for excluded in ("CANCELLED", "ADJACENT", "SELF"):
            self.assertNotIn(excluded, raised.exception.detail)
        self.collection.update_one.assert_not_called()

    def test_legacy_booking_without_request_id_still_blocks_with_stored_id(self):
        legacy = self.booking("legacy-a", None)
        legacy.pop("estimated_arrival_time")
        self.collection.find.return_value = [legacy]
        with self.assertRaises(HTTPException) as raised:
            self.approve()
        self.assertIn("Cancel booking legacy-a before approving", raised.exception.detail)

    def test_approval_succeeds_after_conflicting_booking_is_cancelled(self):
        self.collection.find.return_value = [self.booking("a", "SDX-BD-08092026-003", "cancelled")]
        self.approve()
        self.collection.update_one.assert_called_once()
        self.assertEqual(self.collection.update_one.call_args.args[1]["$set"]["status"], "approved")

    def test_superadmin_retains_overlap_override(self):
        bookings.ensure_role.return_value = "superadmin"
        self.collection.find.return_value = [self.booking("a", "SDX-BD-08092026-003")]
        self.approve()
        self.collection.find.assert_not_called()
        self.collection.update_one.assert_called_once()
        bookings.resolve_driver.assert_called_once_with("driver-1", allow_unavailable=True)

    def test_availability_preserves_pending_status_option_and_adjacent_intervals(self):
        self.collection.find.return_value = [self.pending]
        self.assertFalse(bookings.is_driver_busy("driver-1", self.start, self.end))
        self.assertTrue(bookings.is_driver_busy(
            "driver-1", self.start, self.end,
            blocking_statuses=("pending", "approved", "in_progress"),
        ))
        self.collection.find.return_value = [self.booking("a", "A")]
        self.assertFalse(bookings.is_driver_busy("driver-1", self.end, self.end + timedelta(hours=1)))


if __name__ == "__main__":
    unittest.main()
