import os
import unittest
from unittest.mock import Mock, patch

from email_service import build_notification_html, send_notification_email


class EmailServiceTests(unittest.TestCase):
    def test_skips_delivery_without_api_key(self):
        with patch.dict(os.environ, {"RESEND_API_KEY": "", "RESEND_FROM_EMAIL": "Booking App <test@example.com>"}):
            with patch("email_service.requests.post") as post:
                result = send_notification_email(
                    to_email="user@example.com",
                    recipient_name="User",
                    message="Updated",
                    event="updated",
                    entity_type="booking",
                    notification_id="notification-1",
                )

        self.assertIsNone(result)
        post.assert_not_called()

    def test_sends_email_with_idempotency_key(self):
        response = Mock(ok=True)
        response.json.return_value = {"id": "resend-email-1"}
        env = {
            "RESEND_API_KEY": "re_test",
            "RESEND_FROM_EMAIL": "Booking App <test@example.com>",
            "APP_PUBLIC_URL": "https://booking.example.com",
        }

        with patch.dict(os.environ, env):
            with patch("email_service.requests.post", return_value=response) as post:
                result = send_notification_email(
                    to_email="user@example.com",
                    recipient_name="User",
                    message="Your booking was approved.",
                    event="approved",
                    entity_type="booking",
                    notification_id="notification-1",
                )

        self.assertEqual(result, "resend-email-1")
        request = post.call_args
        self.assertEqual(request.kwargs["headers"]["Idempotency-Key"], "booking-app-notification-notification-1")
        self.assertEqual(request.kwargs["json"]["to"], ["user@example.com"])
        self.assertEqual(request.kwargs["json"]["subject"], "Driver Booking: Approved")

    def test_html_escapes_user_content(self):
        rendered = build_notification_html("<Admin>", "<script>alert(1)</script>", "")
        self.assertNotIn("<script>", rendered)
        self.assertIn("&lt;script&gt;", rendered)
        self.assertIn("&lt;Admin&gt;", rendered)


if __name__ == "__main__":
    unittest.main()
