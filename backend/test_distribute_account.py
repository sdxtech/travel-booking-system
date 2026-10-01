import unittest
from unittest.mock import MagicMock, patch

import main  # noqa: F401
from routes_users_admin import DistributeAccountRequest, distribute_accounts


class DistributeAccountTests(unittest.TestCase):
    def test_new_account_receives_invitation_for_selected_role(self):
        users = MagicMock()
        users.find_one.side_effect = [None]
        tokens = MagicMock()
        collections = {"users": users, "password_reset_tokens": tokens}

        with (
            patch("routes_users_admin.ensure_role", return_value="superadmin"),
            patch("routes_users_admin.db", collections),
            patch("routes_users_admin.send_password_reset_email", return_value="message-id") as send_email,
            patch("routes_users_admin.record_audit_event"),
            patch.dict("routes_users_admin.os.environ", {"APP_PUBLIC_URL": "https://booking.example.com"}),
        ):
            result = distribute_accounts(
                DistributeAccountRequest(emails=["Employee@example.com"], role="user"),
                current_user={"uid": "admin-id"},
            )

        self.assertEqual((result.created, result.failed), (1, 0))
        self.assertEqual(result.results[0].status, "invited")
        inserted_user = users.insert_one.call_args.args[0]
        self.assertEqual(inserted_user["email"], "employee@example.com")
        self.assertEqual(inserted_user["role"], "user")
        self.assertEqual(inserted_user["dept_job_position"], "")
        token = tokens.insert_one.call_args.args[0]
        self.assertEqual(token["purpose"], "account_invitation")
        self.assertEqual((token["expires_at"] - token["created_at"]).total_seconds(), 3600)
        self.assertTrue(send_email.call_args.kwargs["reset_url"].startswith("https://booking.example.com/reset-password?token="))


if __name__ == "__main__":
    unittest.main()
