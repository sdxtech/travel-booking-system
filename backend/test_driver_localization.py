import os
import unittest
from unittest.mock import Mock, patch

import notifications_service as notifications
import telegram_service as telegram
from driver_localization import driver_notification_details, driver_notification_message
from email_service import send_notification_email, send_password_reset_email
from test_email_service import SMTP_ENV


class DriverLocalizationTests(unittest.TestCase):
    def test_recipient_role_controls_all_notification_channels(self):
        original = "You have been assigned a new driver task by the booking system."
        for role in ("driver", "user", "office_coordinator", "superadmin"):
            with self.subTest(role=role):
                users, records = Mock(), Mock()
                users.find_one.return_value = {
                    "role": role, "email": "recipient@example.com", "telegram_chat_id": "123",
                }
                with patch.object(notifications, "db", {"users": users, "notifications": records}), \
                        patch.object(notifications, "email_delivery_enabled", return_value=True), \
                        patch.object(notifications, "telegram_delivery_enabled", return_value=True), \
                        patch.object(notifications, "send_notification_email") as email, \
                        patch.object(notifications, "send_notification_telegram") as send:
                    notifications.create_user_notification(
                        "u1", original, event="assigned", entity_type="booking", entity_id="b1",
                        email_details={"Requestor": "January", "Departure Date & Time": "19 October 2026, 08:00 WIB"},
                    )
                    records.find_one_and_update.return_value = records.insert_one.call_args.args[0]
                    notifications.deliver_next_notification()
                stored = records.insert_one.call_args.args[0]
                sent = email.call_args.kwargs
                self.assertEqual(stored["message"], sent["message"])
                if role == "driver":
                    self.assertIn("disetujui otomatis", stored["message"])
                    self.assertEqual(sent["language"], "id")
                    self.assertEqual(sent["details"]["Pemohon"], "January")
                    self.assertEqual(sent["details"]["Tanggal & Waktu Keberangkatan"], "19 Oktober 2026, 08:00 WIB")
                    self.assertEqual(send.call_args.kwargs["message"], stored["message"])
                    self.assertEqual(send.call_args.kwargs["details"], sent["details"])
                else:
                    self.assertEqual(stored["message"], original)
                    self.assertEqual(sent["language"], "en")
                    self.assertIn("Requestor", sent["details"])
                    send.assert_not_called()

    def test_existing_notifications_preserve_request_ids_actor_and_are_idempotent(self):
        cases = [
            ("cancelled_by_employee", None, "Booking SDX-BD-19102026-003 was cancelled by the Employee.", "SDX-BD-19102026-003"),
            ("driver_availability_updated", "on", "Your availability for new driver bookings has been turned on by Office Coordinator.", "diaktifkan oleh Koordinator Kantor"),
            ("driver_availability_updated", "off", "Your availability for new driver bookings has been turned off by Super Admin. Existing tasks are unchanged.", "dinonaktifkan oleh Super Admin"),
            ("completion_validated", "completed", "Your trip completion has been validated.", "dikonfirmasi"),
        ]
        for event, status, original, expected in cases:
            translated = driver_notification_message(original, event, status)
            self.assertIn(expected, translated)
            self.assertEqual(driver_notification_message(translated, event, status), translated)

    def test_email_renders_indonesian_in_both_bodies_and_escapes_user_values(self):
        details = driver_notification_details({
            "Requestor": "Budi <Tim>", "Departure Point": "Office & Depot",
            "Estimated Arrival Date & Time": "19 October 2026, 10:00 WIB",
        })
        with patch.dict(os.environ, SMTP_ENV), patch("email_service.smtplib.SMTP_SSL") as smtp:
            send_notification_email(
                to_email="driver@example.com", recipient_name="<Budi>",
                message="Anda mendapat tugas perjalanan baru.", event="assigned", entity_type="booking",
                notification_id="n1", details=details, language="id",
            )
        sent = smtp.return_value.__enter__.return_value.send_message.call_args.args[0]
        self.assertEqual(sent["Subject"], "Perjalanan: Tugas perjalanan baru")
        html_body = sent.get_body(preferencelist=("html",)).get_content()
        plain_body = sent.get_body(preferencelist=("plain",)).get_content()
        self.assertIn("&lt;Budi&gt;", html_body)
        self.assertIn("Budi &lt;Tim&gt;", html_body)
        self.assertIn("Office &amp; Depot", html_body)
        for body in (html_body, plain_body):
            self.assertIn("Halo", body)
            self.assertIn("Buka Driver Request App", body)
            self.assertIn("19 Oktober 2026", body)
            self.assertIn("Ini adalah pemberitahuan otomatis", body)
            self.assertNotIn("Hello", body)
            self.assertNotIn("Open Driver Request App", body)
            self.assertLess(body.index("Perkiraan Tanggal"), body.index("Buka Driver Request App"))

    def test_telegram_keeps_plain_text_and_localizes_operational_details(self):
        with patch.dict(os.environ, {"APP_PUBLIC_URL": "https://booking.example.com"}), \
                patch.object(telegram, "send_telegram_message", return_value="7") as send:
            telegram.send_notification_telegram(
                chat_id="123", recipient_name="Budi", event="assigned", entity_type="booking",
                message="You have been assigned a new driver task. Please check Driver Tasks for details.",
                details={"Requestor": "<Tim>", "Estimated Arrival Date & Time": "19 October 2026, 10:00 WIB"},
            )
        text = send.call_args.args[1]
        self.assertIn("Halo Budi", text)
        self.assertIn("Tugas Saya", text)
        self.assertIn("Pemohon: <Tim>", text)
        self.assertIn("19 Oktober 2026", text)
        self.assertIn("Buka Booking App", text)
        self.assertNotIn("Hello", text)
        self.assertNotIn("Booking details", text)

    def test_driver_password_email_and_invitation_keep_expiry_and_links(self):
        for invitation, minutes, expiry in ((True, 60, "1 jam"), (False, 30, "30 menit")):
            with self.subTest(invitation=invitation):
                with patch.dict(os.environ, SMTP_ENV), patch("email_service.smtplib.SMTP_SSL") as smtp:
                    send_password_reset_email(
                        to_email="driver@example.com", recipient_name="Budi", reset_url="https://booking.example.com/reset-password?token=test",
                        invitation=invitation, expires_in_minutes=minutes, language="id",
                    )
                sent = smtp.return_value.__enter__.return_value.send_message.call_args.args[0]
                for subtype in ("plain", "html"):
                    body = sent.get_body(preferencelist=(subtype,)).get_content()
                    self.assertIn(expiry, body)
                    self.assertIn("hanya dapat digunakan satu kali", body)
                    self.assertIn("reset-password?token=test", body)
                    self.assertNotIn("Employee account", body)
                    self.assertNotIn("Hello", body)

    def test_delivery_failure_still_keeps_localized_in_app_notification(self):
        users, records = Mock(), Mock()
        users.find_one.return_value = {"role": "driver", "email": "driver@example.com", "telegram_chat_id": "123"}
        with patch.object(notifications, "db", {"users": users, "notifications": records}), \
                patch.object(notifications, "email_delivery_enabled", return_value=True), \
                patch.object(notifications, "telegram_delivery_enabled", return_value=True), \
                patch.object(notifications, "send_notification_email", side_effect=RuntimeError("SMTP unavailable")), \
                patch.object(notifications, "send_notification_telegram", side_effect=RuntimeError("secret-token")):
            result = notifications.create_user_notification(
                "d1", "Your password was changed successfully.", event="password_changed", entity_type="user", entity_id="d1",
            )
            records.find_one_and_update.return_value = records.insert_one.call_args.args[0]
            notifications.deliver_next_notification()
        self.assertTrue(result)
        self.assertEqual(records.insert_one.call_args.args[0]["message"], "Kata sandi Anda berhasil diubah.")
        self.assertNotIn("secret-token", str(records.update_one.call_args_list))


if __name__ == "__main__":
    unittest.main()
