import os
import unittest
from unittest.mock import patch

from email_service import build_notification_html, send_notification_email, send_password_reset_email


SMTP_ENV = {
    "SMTP_HOST": "smtp.hostinger.com",
    "SMTP_PORT": "465",
    "SMTP_SECURITY": "ssl",
    "SMTP_USERNAME": "info@example.com",
    "SMTP_PASSWORD": "mailbox-password",
    "SMTP_FROM_EMAIL": "Booking App <info@example.com>",
    "APP_PUBLIC_URL": "https://booking.example.com",
}


class EmailServiceTests(unittest.TestCase):
    def test_skips_delivery_without_mailbox_password(self):
        with patch.dict(os.environ, {**SMTP_ENV, "SMTP_PASSWORD": ""}):
            with patch("email_service.smtplib.SMTP_SSL") as smtp:
                result = send_notification_email(
                    to_email="user@example.com", recipient_name="User", message="Updated",
                    event="updated", entity_type="booking", notification_id="notification-1",
                )

        self.assertIsNone(result)
        smtp.assert_not_called()

    def test_notification_uses_authenticated_tls_and_html(self):
        with patch.dict(os.environ, SMTP_ENV):
            with patch("email_service.smtplib.SMTP_SSL") as smtp:
                message_id = send_notification_email(
                    to_email="user@example.com", recipient_name="User",
                    message="Your booking was approved.", event="approved",
                    entity_type="booking", notification_id="notification-1",
                )

        self.assertTrue(message_id.startswith("<"))
        smtp.assert_called_once()
        connection = smtp.return_value.__enter__.return_value
        connection.login.assert_called_once_with("info@example.com", "mailbox-password")
        sent_message = connection.send_message.call_args.args[0]
        self.assertEqual(sent_message["Subject"], "Driver Booking: Approved")
        self.assertEqual(sent_message["To"], "user@example.com")
        self.assertEqual(sent_message["Message-ID"], message_id)
        self.assertIn("Open Booking App", sent_message.get_body(preferencelist=("html",)).get_content())

    def test_invitation_uses_starttls_and_one_hour_link(self):
        with patch.dict(os.environ, {**SMTP_ENV, "SMTP_PORT": "587", "SMTP_SECURITY": "starttls"}):
            with patch("email_service.smtplib.SMTP") as smtp:
                message_id = send_password_reset_email(
                    to_email="user@example.com", recipient_name="User",
                    reset_url="https://booking.example.com/reset-password?token=abc",
                    invitation=True, expires_in_minutes=60,
                )

        self.assertIsNotNone(message_id)
        connection = smtp.return_value.__enter__.return_value
        connection.starttls.assert_called_once()
        connection.login.assert_called_once()
        sent_message = connection.send_message.call_args.args[0]
        self.assertEqual(sent_message["Subject"], "Set Up Your Booking App Account")
        self.assertIn("1 hour", sent_message.get_body(preferencelist=("plain",)).get_content())

    def test_html_escapes_user_content(self):
        rendered = build_notification_html("<Admin>", "<script>alert(1)</script>", "")
        self.assertNotIn("<script>", rendered)
        self.assertIn("&lt;script&gt;", rendered)
        self.assertIn("&lt;Admin&gt;", rendered)

    def test_notification_includes_booking_details_in_html_and_text(self):
        details = {
            "Requestor": "Budi & Team",
            "Phone/WA": "08123456789",
            "Departure Point": "Main Office",
        }
        with patch.dict(os.environ, SMTP_ENV):
            with patch("email_service.smtplib.SMTP_SSL") as smtp:
                send_notification_email(
                    to_email="driver@example.com",
                    recipient_name="Driver",
                    message="You have a new assignment.",
                    event="assigned",
                    entity_type="booking",
                    notification_id="notification-details",
                    details=details,
                )

        sent_message = smtp.return_value.__enter__.return_value.send_message.call_args.args[0]
        html_body = sent_message.get_body(preferencelist=("html",)).get_content()
        text_body = sent_message.get_body(preferencelist=("plain",)).get_content()
        self.assertIn("Requestor", html_body)
        self.assertIn("Budi &amp; Team", html_body)
        self.assertIn("Phone/WA : 08123456789", text_body)


if __name__ == "__main__":
    unittest.main()
