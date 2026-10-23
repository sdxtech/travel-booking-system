import copy
import re
import unittest
from unittest.mock import Mock, patch

import main  # noqa: F401
import booking_link_service as service
import routes_bookings as routes
from fastapi import HTTPException


class BookingLinkTests(unittest.TestCase):
    def setUp(self):
        self.user = {"_id": "employee", "role": "user", "email": "Employee+one@example.com"}
        self.docs = [
            {"_id": "old", "user_id": None, "requester_email": " Employee+One@Example.COM ", "status": "awaiting_validation"},
            {"_id": "completed", "requester_email": self.user["email"], "status": "completed"},
            {"_id": "claimed", "user_id": "someone-else", "requester_email": self.user["email"]},
            {"_id": "different", "requester_email": "employeeone@example.com"},
        ]
        self.users = Mock()
        self.users.find_one.side_effect = lambda *args: self.user
        self.bookings = Mock()
        def matches(doc, query):
            return doc.get("user_id") is None and re.fullmatch(query["requester_email"]["$regex"], doc.get("requester_email", ""), re.I)
        self.bookings.find.side_effect = lambda query: [copy.deepcopy(doc) for doc in self.docs if matches(doc, query)]
        def update(query, change):
            doc = next(doc for doc in self.docs if doc["_id"] == query["_id"])
            changed = bool(matches(doc, query))
            if changed:
                doc.update(change["$set"])
            return Mock(modified_count=int(changed))
        self.bookings.update_one.side_effect = update
        self.database = {"users": self.users, "bookings": self.bookings}
        for patcher in (patch.object(service, "publish_document_change"), patch.object(service, "record_audit_event")):
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_links_only_unclaimed_exact_email_and_keeps_status(self):
        self.assertEqual(service.link_employee_bookings(self.database, "employee"), 2)
        self.assertEqual(self.docs[0]["user_id"], "employee")
        self.assertEqual(self.docs[0]["status"], "awaiting_validation")
        self.assertEqual(self.docs[1]["status"], "completed")
        self.assertEqual(self.docs[2]["user_id"], "someone-else")
        self.assertNotIn("user_id", self.docs[3])
        self.assertEqual(service.link_employee_bookings(self.database, "employee"), 0)
        self.assertEqual(service.publish_document_change.call_count, 2)

    def test_non_employee_or_missing_email_does_not_link(self):
        for user in ({"role": "driver", "email": "Employee+one@example.com"}, {"role": "user"}):
            self.user = user
            self.assertEqual(service.link_employee_bookings(self.database, "employee"), 0)
        self.bookings.update_one.assert_not_called()

    def test_history_links_before_querying_employee_bookings(self):
        order = []
        cursor = Mock()
        cursor.sort.return_value = []
        self.bookings.find.side_effect = lambda query: (order.append(query) or cursor)
        with patch.object(routes, "db", self.database), patch.object(routes, "ensure_role", return_value="user"), patch.object(routes, "enforce_employee_page_permission"), patch.object(routes, "link_employee_bookings", side_effect=lambda *args: order.append("linked")):
            routes.list_my_bookings({"uid": "employee"})
        self.assertEqual(order, ["linked", {"user_id": "employee"}])

    def test_employee_can_validate_after_linking_but_different_email_cannot(self):
        old_update = self.bookings.update_one.side_effect
        def update(query, change):
            if "requester_email" in query:
                return old_update(query, change)
            self.assertEqual(query, {"_id": "old", "status": "awaiting_validation", "user_id": "employee"})
            self.docs[0].update(change["$set"])
            return Mock(modified_count=1)
        self.bookings.update_one.side_effect = update
        self.bookings.find_one.side_effect = lambda query: copy.deepcopy(self.docs[0])
        with patch.object(routes, "db", self.database), patch.object(routes, "ensure_role", return_value="user"), patch.object(routes, "enforce_employee_page_permission"), patch.object(routes, "publish_document_change"), patch.object(routes, "serialize_booking", side_effect=lambda doc: doc):
            self.user["email"] = "different@example.com"
            with self.assertRaises(HTTPException) as denied:
                routes.validate_booking_completion("old", {"uid": "employee"})
            self.assertEqual(denied.exception.status_code, 403)
            self.user["email"] = "Employee+one@example.com"
            result = routes.validate_booking_completion("old", {"uid": "employee"})
            self.assertEqual(result["status"], "completed")
            self.assertEqual(result["validated_by"], "employee")
