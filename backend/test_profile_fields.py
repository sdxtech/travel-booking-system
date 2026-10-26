import base64
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

import main  # noqa: F401 - Initialize the routers before importing their handlers.
import routes_bookings as bookings
import routes_tickets as tickets
import routes_users_admin as users


class ProfileFieldsTests(unittest.TestCase):
    def profile(self):
        return {
            "name": "Employee", "department": "Finance", "job_position": "Accountant",
            "role": "user", "nik": "123", "phone": "08123", "email": "employee@example.com",
        }

    def booking(self):
        start = datetime(2026, 10, 20, 2, tzinfo=timezone.utc)
        return {
            "_id": "booking-1", "driver_id": "driver-1", "status": "approved",
            "pickup_location": "Office", "destination": "Site", "passenger_count": 1,
            "departure_time": start, "estimated_arrival_time": start + timedelta(hours=1),
        }

    def travel(self):
        return {
            "destination": "Site", "departure_point": "Office", "departure_date": "2026-10-20",
            "departure_time": "09:00", "purpose_of_travel": "Meeting", "trip_type": "one_way",
            "hotel_accommodation": False, "transportation_mode": "car",
        }

    def test_user_create_saves_independent_department_and_position(self):
        document = {}
        collection = Mock()
        collection.find_one.side_effect = lambda query: document.copy() if "_id" in query else None
        collection.insert_one.side_effect = lambda value: document.update(value)
        profile = self.profile()
        profile.pop("nik")
        with patch.object(users, "db", {"users": collection}), \
                patch.object(users, "ensure_role", return_value="superadmin"), \
                patch.object(users, "hash_password", return_value="hash"):
            result = users.create_user(users.UserCreate(**profile, password="password123"), {"uid": "admin"})
        self.assertEqual((result.department, result.job_position), ("Finance", "Accountant"))
        self.assertEqual(document["department"], "Finance")
        self.assertEqual(document["job_position"], "Accountant")
        self.assertNotIn("dept_job_position", document)
        self.assertIsNone(result.nik)

    def test_updating_department_keeps_position_and_position_can_be_cleared(self):
        document = {"_id": "employee", **self.profile(), "dept_job_position": "Legacy value", "national_id": "Legacy NIK"}
        collection = Mock()
        collection.find_one.side_effect = lambda *args, **kwargs: document.copy()
        collection.update_one.side_effect = lambda query, change: document.update(change["$set"])
        with patch.object(users, "db", {"users": collection}), \
                patch.object(users, "ensure_role", return_value="superadmin"):
            result = users.update_user("employee", users.UserUpdate(department="Operations"), {"uid": "admin"})
            self.assertEqual((result.department, result.job_position), ("Operations", "Accountant"))
            result = users.update_user("employee", users.UserUpdate(job_position=""), {"uid": "admin"})
            self.assertEqual((result.department, result.job_position), ("Operations", ""))
            result = users.update_user("employee", users.UserUpdate(nik=""), {"uid": "admin"})
            self.assertEqual(result.nik, "")

    def test_office_roles_can_edit_one_profile_without_a_phone(self):
        for role in ("office_coordinator", "superadmin"):
            for existing in ({}, {"phone": ""}, {"phone": "08123"}, {"phone_number": "08123"}):
                for phone in ("", "  ", " 08999 "):
                    with self.subTest(role=role, existing=existing, phone=phone):
                        document = {"_id": "employee", "role": "user", "name": "Before", **existing}
                        collection = Mock()
                        collection.find_one.side_effect = lambda *args, **kwargs: document.copy()
                        collection.update_one.side_effect = lambda query, change: document.update(change["$set"])
                        with patch.object(users, "db", {"users": collection}), \
                                patch.object(users, "ensure_role", return_value=role):
                            result = users.update_user("employee", users.UserUpdate(name="After", phone=phone), {"uid": "office"})
                        self.assertEqual(result.name, "After")
                        self.assertEqual(document["phone"], phone.strip())
                        self.assertEqual(result.phone or "", phone.strip())
                        if "phone_number" in existing:
                            self.assertEqual(document["phone_number"], phone.strip())

    def test_profile_update_preserves_phone_when_omitted(self):
        for existing in ({"phone": "08123"}, {"phone_number": "08123"}):
            document = {"_id": "employee", "role": "user", "name": "Before", **existing}
            collection = Mock()
            collection.find_one.side_effect = lambda *args, **kwargs: document.copy()
            collection.update_one.side_effect = lambda query, change: document.update(change["$set"])
            with patch.object(users, "db", {"users": collection}), \
                    patch.object(users, "ensure_role", return_value="superadmin"):
                result = users.update_user("employee", users.UserUpdate(name="After"), {"uid": "office"})
            self.assertEqual(result.phone, "08123")
            updates = collection.update_one.call_args.args[1]["$set"]
            self.assertNotIn("phone", updates)
            self.assertNotIn("phone_number", updates)

    def test_legacy_api_payload_is_department_only_and_canonical_value_wins(self):
        payload = self.profile()
        payload.pop("department")
        payload.pop("job_position")
        legacy = users.UserCreate(**payload, dept_job_position="Finance / Manager", password="password123")
        self.assertEqual((legacy.department, legacy.job_position), ("Finance / Manager", ""))
        canonical = users.UserCreate(**self.profile(), dept_job_position="Old", password="password123")
        self.assertEqual((canonical.department, canonical.job_position), ("Finance", "Accountant"))

    def test_user_serialization_preserves_legacy_without_guessing_and_respects_empty_department(self):
        legacy = users.serialize_user({"_id": "u", "dept_job_position": "Finance / Manager"})
        self.assertEqual(legacy.department, "Finance / Manager")
        self.assertIsNone(legacy.job_position)
        explicit = users.serialize_user({"_id": "u", "department": "", "dept_job_position": "Old", "job_position": "Manager"})
        self.assertEqual((explicit.department, explicit.job_position), ("", "Manager"))
        position_only = users.serialize_user({"_id": "u", "job_position": "Manager"})
        self.assertIsNone(position_only.department)

    def test_import_template_and_legacy_headers_keep_position_separate(self):
        row = users.parse_user_rows_from_xlsx(users.build_user_import_template_xlsx())[0][1]
        self.assertEqual((row["department"], row["job_position"]), ("Finance", "Accountant"))
        for department_header in ("department", "dept_job_position"):
            csv = f"name,{department_header},title_position,nik,phone,email,password\nName,Finance,Manager,123,08123,test@example.com,password123"
            row = users.parse_user_rows_from_csv(csv.encode())[0][1]
            self.assertEqual((row["department"], row["job_position"]), ("Finance", "Manager"))

    def test_import_update_preserves_missing_or_blank_position_and_can_change_it(self):
        for column, value, expected in (("", "", "Manager"), (",job_position", ",", "Manager"), (",job_position", ",Director", "Director")):
            with self.subTest(column=column, value=value):
                document = {"_id": "u", **self.profile(), "job_position": "Manager"}
                collection = Mock()
                collection.find_one.return_value = document
                collection.update_one.side_effect = lambda query, change: document.update(change["$set"])
                csv = "name,department,nik,phone,email,password" + column + "\nName,Operations,123,08123,employee@example.com,password123" + value
                payload = users.UserImportRequest(filename="users.csv", file_base64=base64.b64encode(csv.encode()).decode(), update_existing=True)
                with patch.object(users, "db", {"users": collection}), \
                        patch.object(users, "ensure_role", return_value="superadmin"), \
                        patch.object(users, "hash_password", return_value="hash"):
                    result = users.import_users(payload, {"uid": "admin"})
                self.assertEqual((result.updated, result.failed), (1, 0))
                self.assertEqual((document["department"], document["job_position"]), ("Operations", expected))

    def test_employee_booking_snapshots_both_profile_fields(self):
        profile = self.profile()
        profile.pop("nik")
        collection = Mock()
        document = {}
        collection.insert_one.side_effect = lambda value: document.update(value)
        collection.find_one.side_effect = lambda *args: document.copy()
        user_collection = Mock()
        user_collection.find_one.return_value = profile
        booking = self.booking()
        payload = bookings.BookingCreate(**{key: booking[key] for key in ("driver_id", "pickup_location", "destination", "passenger_count", "departure_time", "estimated_arrival_time")})
        with patch.object(bookings, "db", {"users": user_collection, "bookings": collection}), \
                patch.object(bookings, "ensure_role", return_value="user"), \
                patch.object(bookings, "enforce_employee_page_permission"), \
                patch.object(bookings, "resolve_driver", return_value={"name": "Driver"}), \
                patch.object(bookings, "is_driver_busy", return_value=False), \
                patch.object(bookings, "generate_request_id", return_value="BOOKING-ID"), \
                patch.object(bookings, "publish_document_change"), \
                patch.object(bookings, "create_user_notification"):
            result = bookings.create_booking(payload, {"uid": "employee", "email": profile["email"]})
        self.assertEqual((result.requester_department, result.requester_job_position), ("Finance", "Accountant"))
        self.assertIsNone(result.requester_nik)
        profile["department"] = "Operations"
        profile["job_position"] = "Director"
        snapshot = bookings.serialize_booking(document)
        self.assertEqual((snapshot.requester_department, snapshot.requester_job_position), ("Finance", "Accountant"))

    def test_office_assignment_saves_department_and_position_for_both_roles(self):
        for role in ("office_coordinator", "superadmin"):
            with self.subTest(role=role):
                document = {}
                collection = Mock()
                collection.insert_one.side_effect = lambda value: document.update(value)
                collection.find_one.side_effect = lambda *args: document.copy()
                user_collection = Mock()
                user_collection.find_one.side_effect = lambda query: {"_id": "driver", "name": "Driver", "role": "driver"} if query.get("email") == "driver@example.com" else None
                booking = self.booking()
                payload = bookings.BookingAssignCreate(
                    requester_name="Employee", requester_department="Finance", requester_job_position="Manager",
                    requester_nik="",
                    requester_phone="08123", requester_email="employee@example.com", driver_email="driver@example.com",
                    **{key: booking[key] for key in ("pickup_location", "destination", "passenger_count", "departure_time", "estimated_arrival_time")},
                )
                with patch.object(bookings, "db", {"users": user_collection, "bookings": collection}), \
                        patch.object(bookings, "ensure_role", return_value=role), \
                        patch.object(bookings, "is_driver_busy", return_value=False), \
                        patch.object(bookings, "generate_request_id", return_value="BOOKING-ID"), \
                        patch.object(bookings, "publish_document_change"), \
                        patch.object(bookings, "create_user_notification"):
                    result = bookings.assign_driver(payload, {"uid": "office"})
                self.assertEqual((result.requester_department, result.requester_job_position), ("Finance", "Manager"))

    def test_employee_travel_snapshots_independent_profile_fields(self):
        document = {}
        collection = Mock()
        collection.insert_one.side_effect = lambda value: document.update(value)
        collection.find_one.side_effect = lambda *args: document.copy()
        with patch.object(tickets, "db", {"tickets": collection}), \
                patch.object(tickets, "ensure_user_role", return_value=self.profile()), \
                patch.object(tickets, "enforce_employee_page_permission"), \
                patch.object(tickets, "generate_request_id", return_value="TRAVEL-ID"), \
                patch.object(tickets, "publish_document_change"), \
                patch.object(tickets, "create_user_notification"), \
                patch.object(tickets, "notify_roles"):
            result = tickets.create_ticket(tickets.TicketUserCreate(**self.travel()), {"uid": "employee"})
        self.assertEqual((result.department, result.job_position), ("Finance", "Accountant"))

    def test_booking_and_travel_history_read_legacy_department_only(self):
        booking = bookings.serialize_booking({**self.booking(), "requester_dept_job_position": "Old department"})
        self.assertEqual(booking.requester_department, "Old department")
        self.assertIsNone(booking.requester_job_position)
        travel = tickets.serialize_ticket({
            **self.travel(), "_id": "travel", "full_name": "Employee", "dept_job_position": "Old department",
            "phone_number": "08123", "email": "employee@example.com", "national_id": "123",
        })
        self.assertEqual(travel.department, "Old department")
        self.assertIsNone(travel.job_position)

    def test_employee_can_request_travel_with_no_nik(self):
        for nik in (None, ""):
            with self.subTest(nik=nik):
                document = {}
                collection = Mock()
                collection.insert_one.side_effect = lambda value: document.update(value)
                collection.find_one.side_effect = lambda *args: document.copy()
                with patch.object(tickets, "db", {"tickets": collection}), \
                        patch.object(tickets, "ensure_user_role", return_value={**self.profile(), "nik": nik}), \
                        patch.object(tickets, "enforce_employee_page_permission"), \
                        patch.object(tickets, "generate_request_id", return_value="TRAVEL-ID"), \
                        patch.object(tickets, "publish_document_change"), \
                        patch.object(tickets, "create_user_notification"), \
                        patch.object(tickets, "notify_roles"):
                    result = tickets.create_ticket(tickets.TicketUserCreate(**self.travel()), {"uid": "employee"})
                self.assertIsNone(result.national_id)
                self.assertIsNone(document["national_id"])

    def test_office_travel_model_and_history_allow_missing_nik(self):
        payload = tickets.TicketCreate(
            **self.travel(), full_name="Employee", phone_number="08123", email="employee@example.com",
        )
        self.assertIsNone(payload.national_id)
        result = tickets.serialize_ticket({"_id": "travel-1", **payload.model_dump()})
        self.assertIsNone(result.national_id)


if __name__ == "__main__":
    unittest.main()
