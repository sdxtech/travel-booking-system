import copy
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

import main
import routes_bookings as bookings
from audit_service import audit_changes


class BookingRequesterTests(unittest.TestCase):
    def setUp(self):
        start = datetime(2026, 10, 26, 3, tzinfo=timezone.utc)
        self.document = {
            "_id": "booking-1", "request_id": "SDX-BD-26102026-001",
            "user_id": "original-employee", "driver_id": "driver-1", "driver_name": "Driver",
            "requester_name": "Original Employee", "requester_department": "Finance",
            "requester_job_position": "Analyst", "requester_nik": "123",
            "requester_phone": "08123", "requester_email": "original@example.com",
            "pickup_location": "Office", "destination": "Site", "passenger_count": 3,
            "departure_time": start, "estimated_arrival_time": start + timedelta(hours=2),
            "status": "approved", "created_at": start - timedelta(days=1),
            "started_at": start, "driver_finished_at": start + timedelta(hours=1),
            "starting_mileage": 100, "ending_mileage": 120,
            "validated_at": start + timedelta(hours=2), "validated_by": "original-employee",
            "validated_by_name": "Original Employee", "cancellation_status": "pending",
        }
        self.payload = {
            "requester_name": " Corrected Name ", "requester_department": " Operations ",
            "requester_job_position": " Manager ", "requester_nik": "",
            "requester_phone": " 08999 ", "requester_email": " Corrected@Example.COM ",
        }
        self.role = "office_coordinator"
        self.collection = Mock()
        self.collection.find_one.side_effect = lambda query: copy.deepcopy(self.document)
        self.collection.update_one.side_effect = self.update_one
        self.users = Mock()
        self.users.find_one.side_effect = lambda *args: {"_id": "actor", "role": self.role}
        database = {"bookings": self.collection, "users": self.users}
        for patcher in (
            patch.object(bookings, "db", database),
            patch.object(main, "db", database),
            patch.object(bookings, "publish_document_change"),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        app = FastAPI()
        app.include_router(bookings.router)
        app.dependency_overrides[main.get_current_user] = lambda: {"uid": "actor"}
        self.app = app
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def update_one(self, query, update):
        self.document.update(update["$set"])
        return Mock(matched_count=1, modified_count=1)

    def submit(self, payload=None):
        return self.client.patch("/bookings/booking-1/requester", json=self.payload if payload is None else payload)

    def test_office_roles_can_correct_requester_in_every_status_without_changing_trip_or_owner(self):
        for role in ("office_coordinator", "superadmin"):
            for status in ("pending", "approved", "in_progress", "awaiting_validation", "completed", "cancelled", "rejected"):
                with self.subTest(role=role, status=status):
                    self.role = role
                    self.document["status"] = status
                    before = copy.deepcopy(self.document)
                    response = self.submit()
                    self.assertEqual(response.status_code, 200, response.text)
                    result = response.json()
                    self.assertEqual(result["requester_name"], "Corrected Name")
                    self.assertEqual(result["requester_email"], "corrected@example.com")
                    self.assertEqual(result["requester_department"], "Operations")
                    self.assertEqual(result["requester_job_position"], "Manager")
                    self.assertEqual(result["requester_phone"], "08999")
                    self.assertEqual(result["requester_nik"], "")
                    for field, value in before.items():
                        if field not in self.payload and field not in ("updated_at", "updated_by"):
                            self.assertEqual(self.document[field], value, field)
                    self.assertEqual(self.document["updated_by"], "actor")
                    self.assertIsInstance(self.document["updated_at"], datetime)
        self.users.update_one.assert_not_called()

    def test_employee_driver_and_unknown_roles_are_denied(self):
        for role in ("user", "driver", "admin", None):
            with self.subTest(role=role):
                self.role = role
                self.assertEqual(self.submit().status_code, 403)
        self.collection.find_one.assert_not_called()
        self.collection.update_one.assert_not_called()
        bookings.publish_document_change.assert_not_called()

    def test_unauthenticated_request_is_denied(self):
        self.app.dependency_overrides.clear()
        self.assertEqual(self.submit().status_code, 401)
        self.collection.update_one.assert_not_called()

    def test_rejects_fields_outside_requester_data_for_both_office_roles(self):
        for role in ("office_coordinator", "superadmin"):
            self.role = role
            for field, value in (("user_id", "new-owner"), ("status", "completed"),
                                 ("driver_id", "other-driver"), ("passenger_count", 9),
                                 ("departure_time", "2026-10-27T03:00:00Z"),
                                 ("role", "superadmin"), ("password", "secret")):
                with self.subTest(role=role, field=field):
                    self.assertEqual(self.submit({**self.payload, field: value}).status_code, 422)
        self.collection.update_one.assert_not_called()

    def test_blank_required_fields_and_malformed_email_are_rejected(self):
        for field in ("requester_name", "requester_phone", "requester_email"):
            for value in ("", "  ", None):
                with self.subTest(field=field, value=value):
                    self.assertEqual(self.submit({**self.payload, field: value}).status_code, 422)
        for value in ("no-at-sign", "person@", "@example.com", "one two@example.com"):
            self.assertEqual(self.submit({**self.payload, "requester_email": value}).status_code, 422)
        self.collection.update_one.assert_not_called()

    def test_omitted_optional_fields_are_preserved(self):
        payload = {key: self.payload[key] for key in ("requester_name", "requester_phone", "requester_email")}
        response = self.submit(payload)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["requester_nik"], "123")
        self.assertEqual(response.json()["requester_department"], "Finance")
        self.assertEqual(response.json()["requester_job_position"], "Analyst")

    def test_optional_fields_can_be_cleared_including_legacy_department(self):
        self.document.pop("requester_department")
        self.document["requester_dept_job_position"] = "Legacy / Department"
        payload = {**self.payload, "requester_department": " ", "requester_job_position": " "}
        response = self.submit(payload)
        self.assertEqual(response.status_code, 200, response.text)
        for field in ("requester_department", "requester_job_position", "requester_nik"):
            self.assertEqual(response.json()[field], "")

    def test_email_correction_does_not_reassign_or_clear_an_existing_owner(self):
        response = self.submit()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user_id"], "original-employee")
        self.users.find_one.assert_called_once_with({"_id": "actor"})

    def test_missing_booking_returns_not_found(self):
        self.document = None
        self.assertEqual(self.submit().status_code, 404)
        self.collection.update_one.assert_not_called()
        bookings.publish_document_change.assert_not_called()

    def test_deleted_booking_during_save_returns_not_found(self):
        self.collection.update_one.side_effect = lambda *args: Mock(matched_count=0)
        self.assertEqual(self.submit().status_code, 404)
        bookings.publish_document_change.assert_not_called()

    def test_realtime_is_published_after_save_with_previous_ownership(self):
        before = copy.deepcopy(self.document)
        def published(collection, booking_id, previous):
            self.assertEqual((collection, booking_id), ("bookings", "booking-1"))
            self.assertEqual(previous, before)
            self.assertEqual(self.document["requester_name"], "Corrected Name")
        bookings.publish_document_change.side_effect = published
        self.assertEqual(self.submit().status_code, 200)
        bookings.publish_document_change.assert_called_once()

    def test_audit_snapshot_records_before_and_after_requester_fields(self):
        before, target = main.audit_snapshot("/bookings/booking-1/requester")
        self.assertEqual(self.submit().status_code, 200)
        after, after_target = main.audit_snapshot("/bookings/booking-1/requester")
        self.assertEqual((target, after_target), ("booking-1", "booking-1"))
        changes = {change["field"]: change for change in audit_changes(before, after)}
        self.assertEqual(set(changes), set(self.payload))
        self.assertEqual(changes["requester_name"]["before"], "Original Employee")
        self.assertEqual(changes["requester_name"]["after"], "Corrected Name")

    def test_coordinator_still_cannot_use_superadmin_trip_edit(self):
        payload = {key: self.document[key] for key in (
            "driver_id", "pickup_location", "destination", "passenger_count",
        )}
        payload.update(departure_time=self.document["departure_time"].isoformat(),
                       estimated_arrival_time=self.document["estimated_arrival_time"].isoformat())
        response = self.client.patch("/bookings/booking-1", json=payload)
        self.assertEqual(response.status_code, 403)
        self.collection.update_one.assert_not_called()


if __name__ == "__main__":
    unittest.main()
