import copy
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import HTTPException, Response
from starlette.requests import Request

import main
import routes_auth as auth
import routes_realtime as realtime
import routes_users_admin as users
from account_status import MAX_FAILED_LOGIN_ATTEMPTS


def matches(document, query):
    for field, expected in query.items():
        if field == "$or":
            if not any(matches(document, item) for item in expected):
                return False
        elif isinstance(expected, dict):
            for operator, value in expected.items():
                actual = document.get(field)
                if operator == "$ne" and actual == value:
                    return False
                if operator == "$exists" and (field in document) != value:
                    return False
                if operator == "$lt" and (actual is None or actual >= value):
                    return False
                if operator == "$gte" and (actual is None or actual < value):
                    return False
        elif document.get(field) != expected:
            return False
    return True


class AccountStatusTests(unittest.TestCase):
    def setUp(self):
        self.employee = {"_id": "employee", "role": "user", "email": "employee@example.com", "password_hash": "hash"}
        self.documents = [self.employee,
                          {"_id": "office", "role": "office_coordinator", "password_hash": "hash"},
                          {"_id": "admin", "role": "superadmin", "password_hash": "hash"}]
        self.collection = Mock()
        self.collection.find_one.side_effect = self.find_one
        self.collection.update_one.side_effect = self.update_one
        self.collection.find_one_and_update.side_effect = self.find_one_and_update
        database = {"users": self.collection}
        for module in (auth, users, main, realtime):
            patcher = patch.object(module, "db", database)
            patcher.start()
            self.addCleanup(patcher.stop)
        for patcher in (
            patch.object(auth, "verify_password", side_effect=lambda password, _: password == "correct"),
            patch.object(auth, "create_access_token", return_value=("test-token", datetime.now(timezone.utc))),
            patch.object(auth, "invalidate_response_cache"),
            patch.object(auth, "publish_api_change"),
            patch.object(auth, "record_audit_event"),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def find_one(self, query, *_):
        return next((copy.deepcopy(doc) for doc in self.documents if matches(doc, query)), None)

    def update_one(self, query, update):
        doc = next((doc for doc in self.documents if matches(doc, query)), None)
        if doc is None:
            return SimpleNamespace(matched_count=0, modified_count=0)
        before = copy.deepcopy(doc)
        doc.update(update.get("$set", {}))
        for field, amount in update.get("$inc", {}).items():
            doc[field] = doc.get(field, 0) + amount
        for field in update.get("$unset", {}):
            doc.pop(field, None)
        return SimpleNamespace(matched_count=1, modified_count=int(before != doc))

    def find_one_and_update(self, query, update, **_):
        doc = self.find_one(query)
        if doc is None:
            return None
        self.update_one({"_id": doc["_id"]}, update)
        return self.find_one({"_id": doc["_id"]})

    def login(self, password="wrong"):
        response = Response()
        result = auth.login(auth.LoginRequest(email="employee@example.com", password=password), response)
        return result, response

    def fail_login(self, expected_status=401):
        with self.assertRaises(HTTPException) as denied:
            self.login()
        self.assertEqual(denied.exception.status_code, expected_status)

    def test_four_statuses_are_derived_without_exposing_passwords(self):
        for fields, expected in (({}, "active"), ({"disabled": True}, "deactive"),
                                 ({"banned": True}, "banned"), ({"password_hash": None}, "password_not_set")):
            with self.subTest(expected=expected):
                result = users.serialize_user({**self.employee, **fields}).model_dump()
                self.assertEqual(result["account_status"], expected)
                self.assertNotIn("password_hash", result)
        self.assertEqual(users.serialize_user({**self.employee, "password_hash": None, "disabled": True}).account_status, "deactive")
        self.assertEqual(users.serialize_user({**self.employee, "disabled": True, "banned": True}).account_status, "banned")

    def test_fifth_consecutive_failure_bans_and_correct_password_cannot_bypass(self):
        for attempt in range(1, MAX_FAILED_LOGIN_ATTEMPTS + 1):
            self.fail_login(403 if attempt == MAX_FAILED_LOGIN_ATTEMPTS else 401)
            self.assertEqual(self.employee["failed_login_attempts"], attempt)
            self.assertEqual(bool(self.employee.get("banned")), attempt == MAX_FAILED_LOGIN_ATTEMPTS)
        with self.assertRaises(HTTPException) as denied:
            self.login("correct")
        self.assertEqual(denied.exception.status_code, 403)
        auth.create_access_token.assert_not_called()
        auth.publish_api_change.assert_called_once_with("/users/employee", "employee")
        auth.invalidate_response_cache.assert_called_once()
        self.assertNotIn("hash", str(auth.record_audit_event.call_args.kwargs))

    def test_successful_login_resets_failures_and_sets_cookie(self):
        for _ in range(MAX_FAILED_LOGIN_ATTEMPTS - 1):
            self.fail_login()
        result, response = self.login("correct")
        self.assertEqual(result["message"], "Login successful")
        self.assertEqual(self.employee["failed_login_attempts"], 0)
        self.assertNotIn("last_failed_login_at", self.employee)
        self.assertIn("access_token=test-token", response.headers["set-cookie"])
        self.fail_login()
        self.assertEqual(self.employee["failed_login_attempts"], 1)

    def test_accounts_without_password_are_not_banned_by_login_attempts(self):
        self.employee.pop("password_hash")
        for _ in range(MAX_FAILED_LOGIN_ATTEMPTS + 1):
            self.fail_login()
        self.collection.find_one_and_update.assert_not_called()
        self.assertEqual(users.serialize_user(self.employee).account_status, "password_not_set")

    def test_unknown_email_does_not_create_a_counter(self):
        self.employee["email"] = "other@example.com"
        self.fail_login()
        self.collection.find_one_and_update.assert_not_called()

    def test_deactivated_account_cannot_login(self):
        self.employee["disabled"] = True
        with self.assertRaises(HTTPException) as denied:
            self.login("correct")
        self.assertEqual(denied.exception.status_code, 403)
        self.collection.find_one_and_update.assert_not_called()

    def test_both_managers_can_activate_without_changing_password_or_booking_availability(self):
        for actor in ("office", "admin"):
            for fields in ({"disabled": True}, {"banned": True, "failed_login_attempts": 5}):
                with self.subTest(actor=actor, fields=fields):
                    self.employee.update(fields, booking_enabled=False)
                    result = users.activate_user("employee", {"uid": actor})
                    self.assertEqual(result.account_status, "active")
                    self.assertEqual(self.employee["failed_login_attempts"], 0)
                    self.assertEqual(self.employee["password_hash"], "hash")
                    self.assertFalse(self.employee["booking_enabled"])
                    self.login("correct")

    def test_activation_does_not_claim_invited_account_has_a_password(self):
        self.employee.update(password_hash=None, disabled=True)
        result = users.activate_user("employee", {"uid": "office"})
        self.assertEqual(result.account_status, "password_not_set")

    def test_coordinator_cannot_activate_superadmin_or_self(self):
        for target, status_code in (("admin", 403), ("office", 400)):
            with self.subTest(target=target), self.assertRaises(HTTPException) as denied:
                users.activate_user(target, {"uid": "office"})
            self.assertEqual(denied.exception.status_code, status_code)
        self.collection.update_one.assert_not_called()

    def test_superadmin_activation_override_includes_self_and_other_superadmins(self):
        for target in ("admin", "office"):
            self.assertEqual(users.activate_user(target, {"uid": "admin"}).account_status, "active")

    def test_employee_and_driver_cannot_activate_accounts(self):
        for role in ("user", "driver"):
            self.employee["role"] = role
            with self.assertRaises(HTTPException) as denied:
                users.activate_user("office", {"uid": "employee"})
            self.assertEqual(denied.exception.status_code, 403)
        self.collection.update_one.assert_not_called()

    def test_missing_activation_target_is_not_found(self):
        with self.assertRaises(HTTPException) as denied:
            users.activate_user("missing", {"uid": "admin"})
        self.assertEqual(denied.exception.status_code, 404)

    def test_session_cookie_and_websocket_are_rejected_for_banned_account(self):
        self.employee["banned"] = True
        with patch.object(main, "decode_access_token", return_value={"sub": "employee"}):
            request = Request({"type": "http", "headers": [(b"cookie", b"access_token=old-token")]})
            with self.assertRaises(HTTPException) as denied:
                main.get_current_user(request, creds=None)
        self.assertEqual(denied.exception.status_code, 403)
        with patch.object(realtime, "decode_access_token", return_value={"sub": "employee", "exp": 9999999999}):
            self.assertIsNone(realtime.session_user("old-token"))

    def test_concurrent_ban_cannot_be_cleared_by_successful_password_check(self):
        def concurrent_ban(*_):
            self.employee.update(banned=True, failed_login_attempts=5)
            return True
        with patch.object(auth, "verify_password", side_effect=concurrent_ban):
            with self.assertRaises(HTTPException) as denied:
                self.login("correct")
        self.assertEqual(denied.exception.status_code, 403)
        self.assertTrue(self.employee["banned"])
        self.assertEqual(self.employee["failed_login_attempts"], 5)
        auth.create_access_token.assert_not_called()

    def test_activation_is_included_in_audit_snapshot(self):
        before, target = main.audit_snapshot("/users/employee/activate")
        self.assertEqual(target, "employee")
        self.assertEqual(before["email"], "employee@example.com")


if __name__ == "__main__":
    unittest.main()
