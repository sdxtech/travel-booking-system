import unittest
from datetime import timedelta
from unittest.mock import Mock, patch

import main  # noqa: F401
import notifications_service as service
from test_fcm import Collection


class NotificationQueueTests(unittest.TestCase):
    def setUp(self):
        self.records = Collection()
        self.users = Collection()
        self.users.insert_one({"_id": "u1", "role": "driver", "name": "Driver", "email": "test@example.com", "telegram_chat_id": "123"})
        for patcher in (
            patch.object(service, "db", {"notifications": self.records, "users": self.users}),
            patch.object(service, "email_delivery_enabled", return_value=True),
            patch.object(service, "telegram_delivery_enabled", return_value=True),
            patch.object(service, "queue_notification_push"),
            patch.object(service, "publish_notification"),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def queue(self):
        return service.create_user_notification("u1", "New task", event="assigned", entity_type="booking", entity_id="b1")

    def test_submit_only_persists_and_worker_sends_once(self):
        with patch.object(service, "send_notification_email", return_value="email") as email, patch.object(service, "send_notification_telegram", return_value="telegram") as telegram:
            identifier = self.queue()
            email.assert_not_called()
            telegram.assert_not_called()
            self.assertEqual(self.records.items[identifier]["delivery_state"], "pending")
            self.assertTrue(service.deliver_next_notification())
            self.assertFalse(service.deliver_next_notification())
            email.assert_called_once()
            telegram.assert_called_once()
            self.assertEqual(self.records.items[identifier]["email_status"], "sent")
            self.assertNotIn("delivery_payload", self.records.items[identifier])

    def test_restart_recovers_expired_claim_without_resending_completed_channel(self):
        identifier = self.queue()
        record = self.records.items[identifier]
        record.update(delivery_state="processing", delivery_after=service.utc_now() + timedelta(minutes=1), email_status="sent")
        with patch.object(service, "send_notification_email") as email, patch.object(service, "send_notification_telegram") as telegram:
            self.assertFalse(service.deliver_next_notification())
            record["delivery_after"] = service.utc_now() - timedelta(seconds=1)
            self.assertTrue(service.deliver_next_notification())
            email.assert_not_called()
            telegram.assert_called_once()

    def test_disconnected_telegram_is_not_sent_to_old_account(self):
        self.queue()
        self.users.items["u1"].pop("telegram_chat_id")
        with patch.object(service, "send_notification_email"), patch.object(service, "send_notification_telegram") as telegram:
            self.assertTrue(service.deliver_next_notification())
            telegram.assert_not_called()
