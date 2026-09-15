import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

import requests
from fastapi import HTTPException, Response

import main  # noqa: F401
import notifications_service as notifications
import routes_telegram as routes
import telegram_service as telegram


class TelegramTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            "TELEGRAM_BOT_TOKEN": "123:test-token", "TELEGRAM_WEBHOOK_SECRET": "s" * 32,
            "TELEGRAM_BOT_USERNAME": "BookingDriverBot", "APP_PUBLIC_URL": "https://booking.example.com",
        })
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_plain_text_delivery_and_length_limit(self):
        response = Mock(ok=True)
        response.json.return_value = {"ok": True, "result": {"message_id": 7}}
        with patch.object(telegram.requests, "post", return_value=response) as post:
            self.assertEqual(telegram.send_notification_telegram(
                chat_id="123", recipient_name="Driver", message="<Route> & details",
                event="approved", entity_type="booking",
            ), "7")
            payload = post.call_args.kwargs["json"]
            self.assertIn("<Route> & details", payload["text"])
            self.assertNotIn("parse_mode", payload)
            telegram.send_telegram_message("123", "😀" * 5000)
            self.assertLessEqual(len(post.call_args.kwargs["json"]["text"].encode("utf-16-le")), 8192)

    def test_request_failure_does_not_expose_token(self):
        with patch.object(telegram.requests, "post", side_effect=requests.Timeout("https://api.telegram.org/bot123:test-token")):
            with self.assertRaises(telegram.TelegramDeliveryError) as error:
                telegram.send_telegram_message("123", "Message")
        self.assertNotIn("test-token", str(error.exception))

    def test_provider_rejection_is_failure(self):
        response = Mock(ok=True, status_code=200)
        response.json.return_value = {"ok": False}
        with patch.object(telegram.requests, "post", return_value=response):
            with self.assertRaises(telegram.TelegramDeliveryError):
                telegram.send_telegram_message("123", "Message")

    def test_only_drivers_can_manage_own_connection(self):
        for role in ("user", "office_coordinator", "superadmin", None):
            with self.assertRaises(HTTPException):
                routes.driver_user({"uid": "u1", "role": role})
        self.assertEqual(routes.driver_user({"uid": "d1", "role": "driver"})["uid"], "d1")

    def test_connect_uses_random_expiring_hashed_token(self):
        users = Mock()
        with patch.object(routes, "db", {"users": users}):
            result = routes.connect_telegram(Response(), {"uid": "d1"})
        token = result["url"].split("start=")[1]
        fields = users.update_one.call_args.args[1]["$set"]
        self.assertEqual(len(token), 43)
        self.assertEqual(fields["telegram_link_hash"], routes.token_hash(token))
        self.assertNotIn(token, str(fields))
        self.assertGreater(result["expires_at"], datetime.now(timezone.utc))

    def test_missing_configuration_blocks_connect(self):
        with patch.dict(os.environ, {"TELEGRAM_BOT_TOKEN": ""}):
            with self.assertRaises(HTTPException) as error:
                routes.connect_telegram(Response(), {"uid": "d1"})
        self.assertEqual(error.exception.status_code, 503)

    def update(self, chat_type="private", token="a" * 43):
        return routes.TelegramUpdate.model_validate({"update_id": 1, "message": {
            "chat": {"id": 123, "type": chat_type}, "from": {"id": 123}, "text": f"/start {token}",
        }})

    def test_webhook_rejects_forgery_and_ignores_group(self):
        users = Mock()
        with patch.object(routes, "db", {"users": users}):
            with self.assertRaises(HTTPException):
                routes.telegram_webhook(self.update(), "wrong")
            routes.telegram_webhook(self.update("group"), "s" * 32)
        users.find_one_and_update.assert_not_called()

    def test_webhook_consumes_token_once_and_rejects_expired_or_disabled(self):
        for expired, disabled in ((False, False), (True, False), (False, True)):
            doc = {"role": "driver", "disabled": disabled, "telegram_link_hash": routes.token_hash("a" * 43),
                   "telegram_link_expires_at": datetime.now(timezone.utc) + timedelta(minutes=-1 if expired else 10)}
            bindings = []

            def atomic_update(query, update):
                if (doc.get("telegram_link_hash") == query["telegram_link_hash"]
                        and doc["telegram_link_expires_at"] > query["telegram_link_expires_at"]["$gt"]
                        and doc["disabled"] != query["disabled"]["$ne"] and doc["role"] == query["role"]):
                    doc.update(update["$set"])
                    for field in update["$unset"]:
                        doc.pop(field, None)
                    bindings.append(doc.copy())
            users = Mock()
            users.find_one_and_update.side_effect = atomic_update
            with patch.object(routes, "db", {"users": users}):
                routes.telegram_webhook(self.update(), "s" * 32)
                routes.telegram_webhook(self.update(), "s" * 32)
            self.assertEqual(len(bindings), 0 if expired or disabled else 1)

    def test_disconnect_clears_chat_and_outstanding_links(self):
        users = Mock()
        with patch.object(routes, "db", {"users": users}):
            routes.disconnect_telegram({"uid": "d1"})
        query, update = users.update_one.call_args.args
        self.assertEqual(query, {"_id": "d1"})
        self.assertIn("telegram_chat_id", update["$unset"])
        self.assertIn("telegram_link_hash", update["$unset"])

    def notify(self, user, email_failure=False, telegram_failure=False, email_enabled=True):
        users, records = Mock(), Mock()
        users.find_one.return_value = user
        with patch.object(notifications, "db", {"users": users, "notifications": records}), \
                patch.object(notifications, "email_delivery_enabled", return_value=email_enabled), \
                patch.object(notifications, "send_notification_email", side_effect=RuntimeError("Email failed") if email_failure else None) as email, \
                patch.object(notifications, "send_notification_telegram", side_effect=RuntimeError("secret-token") if telegram_failure else None) as send:
            result = notifications.create_user_notification("u1", "Same message", event="assigned", entity_type="booking", entity_id="b1")
        return records, email, send, result

    def test_channels_are_independent(self):
        driver = {"role": "driver", "telegram_chat_id": "123", "email": "driver@example.com"}
        for email_failure, telegram_failure in ((True, False), (False, True), (True, True)):
            records, email, send, result = self.notify(driver, email_failure, telegram_failure)
            self.assertTrue(result)
            email.assert_called_once()
            send.assert_called_once()
            self.assertEqual(email.call_args.kwargs["message"], send.call_args.kwargs["message"])
            self.assertNotIn("secret-token", str(records.update_one.call_args_list))
        _, email, send, _ = self.notify(driver, email_enabled=False)
        email.assert_not_called()
        send.assert_called_once()

    def test_non_drivers_unlinked_disabled_and_unconfigured_skip_only_telegram(self):
        for user in (
            {"role": "user", "telegram_chat_id": "123"},
            {"role": "office_coordinator", "telegram_chat_id": "123"},
            {"role": "superadmin", "telegram_chat_id": "123"},
            {"role": "driver"},
            {"role": "driver", "disabled": True, "telegram_chat_id": "123"},
        ):
            records, email, send, _ = self.notify({**user, "email": "user@example.com"})
            email.assert_called_once()
            send.assert_not_called()
            self.assertEqual(records.insert_one.call_args.args[0]["telegram_status"], "skipped")
        with patch.dict(os.environ, {"TELEGRAM_BOT_TOKEN": ""}):
            _, email, send, _ = self.notify({"role": "driver", "telegram_chat_id": "123", "email": "driver@example.com"})
        email.assert_called_once()
        send.assert_not_called()


if __name__ == "__main__":
    unittest.main()
