import unittest
from datetime import datetime, timezone
from unittest.mock import Mock, patch

from fastapi import HTTPException

import main  # noqa: F401 - Initialize routers before importing their handlers.
import routes_bookings as bookings


class DriverCalendarTests(unittest.TestCase):
    def setUp(self):
        self.users = Mock()
        self.users.find_one.return_value = {"_id": "viewer", "role": "user"}
        self.users.find.return_value = [{"_id": "driver-1", "name": "Driver 1"}]
        self.booking = {
            "_id": "booking-1",
            "driver_id": "driver-1",
            "user_id": "another-employee",
            "requester_name": "Budi Santoso",
            "passenger_count": 4,
            "requester_email": "budi@example.com",
            "requester_phone": "08123456789",
            "requester_nik": "private-id",
            "status": "approved",
            "pickup_location": "Office",
            "destination": "Airport",
            "departure_time": datetime(2026, 10, 23, 3, tzinfo=timezone.utc),
            "estimated_arrival_time": datetime(2026, 10, 23, 5, tzinfo=timezone.utc),
        }
        self.collection = Mock()
        self.collection.find.return_value = [self.booking]
        for patcher in (
            patch.object(bookings, "db", {"users": self.users, "bookings": self.collection}),
            patch.object(bookings, "get_cached_json", return_value=None),
            patch.object(bookings, "set_cached_json"),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def calendar(self):
        return bookings.list_driver_calendars({"uid": "viewer"})

    def test_calendar_roles_see_requester_and_total_for_employee_and_manual_bookings(self):
        for role in ("user", "office_coordinator", "superadmin"):
            self.users.find_one.return_value["role"] = role
            for user_id in ("another-employee", None):
                with self.subTest(role=role, user_id=user_id):
                    self.booking["user_id"] = user_id
                    result = self.calendar()[0].bookings[0].model_dump()
                    self.assertEqual(result["requester_name"], "Budi Santoso")
                    self.assertEqual(result["passenger_count"], 4)
                    self.assertEqual(result["requester_phone"], "08123456789")
                    self.assertEqual(result["destination"], "Airport")
                    for private_field in ("user_id", "requester_email", "requester_nik"):
                        self.assertNotIn(private_field, result)

    def test_legacy_booking_without_requester_or_passenger_total_still_loads(self):
        del self.booking["requester_name"]
        del self.booking["passenger_count"]
        result = self.calendar()[0].bookings[0]
        self.assertIsNone(result.requester_name)
        self.assertIsNone(result.passenger_count)
        self.assertEqual(result.id, "booking-1")

    def test_cached_calendar_retains_requester_and_passenger_total(self):
        self.calendar()
        cached_payload = bookings.set_cached_json.call_args.args[2]
        bookings.get_cached_json.return_value = cached_payload
        self.collection.find.reset_mock()
        result = self.calendar()[0].bookings[0]
        self.assertEqual(result.requester_name, "Budi Santoso")
        self.assertEqual(result.passenger_count, 4)
        self.collection.find.assert_not_called()

    def test_disallowed_role_cannot_read_calendar_even_when_cached(self):
        self.users.find_one.return_value["role"] = "driver"
        with self.assertRaises(HTTPException) as denied:
            self.calendar()
        self.assertEqual(denied.exception.status_code, 403)
        bookings.get_cached_json.assert_not_called()
        self.collection.find.assert_not_called()


if __name__ == "__main__":
    unittest.main()
