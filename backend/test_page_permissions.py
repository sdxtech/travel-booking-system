import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException

import page_permissions_service as permissions
import routes_auth
import routes_page_permissions as permission_routes


class EmployeePagePermissionTests(unittest.TestCase):
    def setUp(self):
        self.users = Mock()
        self.pages = Mock()
        self.role_permissions = Mock()
        self.database = {
            "users": self.users,
            "pages": self.pages,
            "role_page_permissions": self.role_permissions,
        }
        self.db_patch = patch.object(permissions, "db", self.database)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)

    def test_enabled_employee_permission_allows_access(self):
        self.users.find_one.return_value = {"_id": "employee", "role": "user"}
        self.pages.find_one.return_value = {"_id": "page-1", "key": "ticket_history"}
        self.role_permissions.find_one.return_value = {"enabled": True}

        permissions.enforce_employee_page_permission("employee", "ticket_history")

    def test_disabled_employee_permission_is_forbidden(self):
        self.users.find_one.return_value = {"_id": "employee", "role": "user"}
        self.pages.find_one.return_value = {"_id": "page-1", "key": "ticket_history"}
        self.role_permissions.find_one.return_value = None

        with self.assertRaises(HTTPException) as denied:
            permissions.enforce_employee_page_permission("employee", "ticket_history")

        self.assertEqual(denied.exception.status_code, 403)

    def test_non_employee_keeps_existing_role_based_access(self):
        self.users.find_one.return_value = {"_id": "coordinator", "role": "office_coordinator"}

        permissions.enforce_employee_page_permission("coordinator", "ticket_history")

        self.pages.find_one.assert_not_called()


class PermissionRouteSecurityTests(unittest.TestCase):
    def test_user_cannot_read_another_roles_permissions(self):
        with patch.object(permission_routes, "ensure_role", return_value="user"):
            with self.assertRaises(HTTPException) as denied:
                permission_routes.get_role_permissions("office_coordinator", {"uid": "employee"})

        self.assertEqual(denied.exception.status_code, 403)

    def test_cookie_is_secure_only_in_production(self):
        with patch.dict("os.environ", {"APP_ENV": "development"}):
            self.assertFalse(routes_auth.use_secure_cookie())
        with patch.dict("os.environ", {"APP_ENV": "production"}):
            self.assertTrue(routes_auth.use_secure_cookie())

    def test_login_without_remember_me_creates_session_cookie(self):
        response = Mock()
        user = {"_id": "employee", "email": "employee@example.com", "password_hash": "hash"}
        database = {"users": Mock()}
        database["users"].find_one.return_value = user

        with patch.object(routes_auth, "db", database), \
             patch.object(routes_auth, "verify_password", return_value=True), \
             patch.object(routes_auth, "create_access_token", return_value=("token", Mock())):
            routes_auth.login(
                routes_auth.LoginRequest(email=user["email"], password="password", remember_me=False),
                response,
            )

        self.assertIsNone(response.set_cookie.call_args.kwargs["max_age"])

    def test_login_with_remember_me_sets_thirty_day_cookie(self):
        response = Mock()
        user = {"_id": "employee", "email": "employee@example.com", "password_hash": "hash"}
        database = {"users": Mock()}
        database["users"].find_one.return_value = user

        with patch.object(routes_auth, "db", database), \
             patch.object(routes_auth, "verify_password", return_value=True), \
             patch.object(routes_auth, "create_access_token", return_value=("token", Mock())):
            routes_auth.login(
                routes_auth.LoginRequest(email=user["email"], password="password", remember_me=True),
                response,
            )

        self.assertEqual(response.set_cookie.call_args.kwargs["max_age"], 60 * 60 * 24 * 30)

    def test_change_password_updates_hash_and_notifies_user(self):
        users = Mock()
        users.find_one.return_value = {"_id": "employee", "password_hash": "old-hash"}
        users.update_one.return_value = Mock(modified_count=1)

        with patch.object(routes_auth, "db", {"users": users}), \
             patch.object(routes_auth, "verify_password", side_effect=[True, False]), \
             patch.object(routes_auth, "hash_password", return_value="new-hash"), \
             patch.object(routes_auth, "create_user_notification") as notify:
            result = routes_auth.change_password(
                routes_auth.ChangePasswordRequest(
                    current_password="old-password",
                    new_password="new-password",
                    confirm_password="new-password",
                ),
                {"uid": "employee"},
            )

        self.assertEqual(result["message"], "Password changed successfully")
        self.assertEqual(users.update_one.call_args.args[1]["$set"]["password_hash"], "new-hash")
        notify.assert_called_once()


if __name__ == "__main__":
    unittest.main()
