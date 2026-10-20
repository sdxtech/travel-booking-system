import copy
import json
import os
import unittest
from datetime import timedelta
from unittest.mock import Mock, patch

import requests
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pymongo.errors import DuplicateKeyError

import main
import notifications_service as notifications
import push_service as service
import routes_push as routes
from audit_service import safe_request_details


def matches(document, query):
    for key, expected in query.items():
        if key == "$or":
            if not any(matches(document, item) for item in expected): return False
        elif isinstance(expected, dict):
            value = document.get(key)
            for operator, other in expected.items():
                if value is None or not {"$lt": lambda: value < other, "$lte": lambda: value <= other,
                                         "$gt": lambda: value > other, "$gte": lambda: value >= other}[operator]():
                    return False
        elif document.get(key) != expected: return False
    return True


class Cursor(list):
    def limit(self, count): return Cursor(self[:count])


class Collection:
    def __init__(self): self.items = {}
    def find(self, query): return Cursor(copy.deepcopy(item) for item in self.items.values() if matches(item, query))
    def find_one(self, query, *args): return next(iter(self.find(query)), None)
    def count_documents(self, query): return len(self.find(query))
    def insert_one(self, item): self.items[item["_id"]] = copy.deepcopy(item)

    def update_one(self, query, update, upsert=False):
        found = next((item for item in self.items.values() if matches(item, query)), None)
        if found is None:
            if not upsert: return
            if query["_id"] in self.items: raise DuplicateKeyError("Duplicate installation")
            found = {**query, **update.get("$setOnInsert", {})}
            self.items[query["_id"]] = found
        found.update(copy.deepcopy(update.get("$set", {})))
        for field, amount in update.get("$inc", {}).items(): found[field] = found.get(field, 0) + amount

    def update_many(self, query, update):
        for item in self.find(query): self.update_one({"_id": item["_id"]}, update)

    def find_one_and_update(self, query, update, **kwargs):
        found = self.find_one(query)
        if found:
            self.update_one({"_id": found["_id"]}, update)
            return self.find_one({"_id": found["_id"]})

    def delete_one(self, query):
        found = self.find_one(query)
        if found: del self.items[found["_id"]]


class FirebasePushTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            "FCM_ENABLED": "true", "FIREBASE_PROJECT_ID": "booking-test", "FIREBASE_API_KEY": "public-api-key",
            "FIREBASE_MESSAGING_SENDER_ID": "123456", "FIREBASE_APP_ID": "1:123456:web:test",
            "FIREBASE_WEB_PUSH_CERTIFICATE_KEY": "B" + "a" * 86,
            "GOOGLE_APPLICATION_CREDENTIALS": "/run/firebase/firebase-service-account.json",
            "APP_PUBLIC_URL": "https://driver.pesan.biz", "CORS_ORIGINS": "http://localhost:5173",
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        exists = patch.object(service.os.path, "isfile", return_value=True)
        exists.start()
        self.addCleanup(exists.stop)
        self.database = {name: Collection() for name in ("users", "notifications", "push_subscriptions", "push_jobs")}
        for module in (service, routes, notifications):
            patcher = patch.object(module, "db", self.database)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.app = FastAPI()
        self.app.include_router(routes.router)
        self.actor = {"uid": "u1", "role": "user"}
        self.app.dependency_overrides[main.get_current_user] = lambda: self.actor
        self.client = TestClient(self.app)
        self.origin = {"Origin": "https://driver.pesan.biz"}
        self.payload = {"fid": "c" + "A" * 21, "project_id": "booking-test"}
        self.database["users"].insert_one({"_id": "u1", "role": "user"})
        self.database["users"].insert_one({"_id": "u2", "role": "driver"})

    def subscribe(self, uid="u1", index=0):
        self.actor = {"uid": uid, "role": "user"}
        payload = {**self.payload, "fid": "c" + str(index).zfill(21)}
        response = self.client.post("/notifications/push/subscribe", json=payload, headers=self.origin)
        self.assertEqual(response.status_code, 200, response.text)
        return service.device_id(payload["project_id"], payload["fid"])

    def queue(self):
        identifier = self.subscribe()
        self.database["notifications"].insert_one({
            "_id": "n1", "user_id": "u1", "message": "Your booking was approved.", "entity_type": "booking",
        })
        service.queue_notification_push("u1", "n1")
        return identifier

    def test_every_role_can_opt_in_but_config_contains_no_server_credential(self):
        for role in ("user", "driver", "office_coordinator", "superadmin"):
            self.actor = {"uid": "u1", "role": role}
            response = self.client.post("/notifications/push/subscribe", json=self.payload, headers=self.origin)
            self.assertEqual(response.status_code, 200)
            config = self.client.get("/notifications/push/config").json()
            self.assertEqual(config["provider"], "fcm")
            self.assertTrue(config["enabled"])
            self.assertNotIn("credential", json.dumps(config))
            self.assertNotIn("private", json.dumps(config))
            self.assertEqual(config["firebase_config"]["projectId"], "booking-test")
        self.assertEqual(len(self.database["push_subscriptions"].items), 1)

    def test_authentication_and_trusted_origin_are_required(self):
        self.app.dependency_overrides.clear()
        self.assertEqual(self.client.get("/notifications/push/config").status_code, 401)
        self.assertEqual(self.client.post("/notifications/push/subscribe", json=self.payload, headers=self.origin).status_code, 401)
        self.app.dependency_overrides[main.get_current_user] = lambda: self.actor
        for origin in (None, "null", "https://evil.example", "https://driver.pesan.biz.evil.example"):
            self.assertEqual(self.client.post("/notifications/push/subscribe", json=self.payload,
                headers={"Origin": origin} if origin else {}).status_code, 403)
        self.assertFalse(self.database["push_subscriptions"].items)

    def test_another_account_cannot_claim_delete_or_supply_a_recipient(self):
        identifier = self.subscribe()
        self.actor = {"uid": "u2", "role": "superadmin"}
        payload = {**self.payload, "fid": "c" + "0" * 21}
        self.assertEqual(self.client.post("/notifications/push/subscribe", json=payload, headers=self.origin).status_code, 409)
        self.client.post("/notifications/push/unsubscribe", json=payload, headers=self.origin)
        self.assertEqual(self.database["push_subscriptions"].items[identifier]["user_id"], "u1")
        self.assertEqual(self.client.post("/notifications/push/subscribe", json={**payload, "user_id": "u1"}, headers=self.origin).status_code, 422)

    def test_malformed_identifiers_other_projects_and_old_web_push_inputs_are_rejected(self):
        for payload in ({**self.payload, "fid": "https://127.0.0.1/"}, {**self.payload, "fid": "short"},
                        {**self.payload, "project_id": "other-project"}, {**self.payload, "project_id": "../../admin"},
                        {"endpoint": "https://evil.example", "keys": {}}):
            self.assertEqual(self.client.post("/notifications/push/subscribe", json=payload, headers=self.origin).status_code, 422)
        self.assertFalse(self.database["push_subscriptions"].items)

    def test_device_limit_and_disconnect_only_affect_the_requested_device(self):
        for index in range(service.MAX_DEVICES): self.subscribe(index=index)
        self.assertEqual(self.client.post("/notifications/push/subscribe", json=self.payload, headers=self.origin).status_code, 409)
        self.client.post("/notifications/push/unsubscribe", json={**self.payload, "fid": "c" + "0" * 21}, headers=self.origin)
        self.assertEqual(len(self.database["push_subscriptions"].items), service.MAX_DEVICES - 1)

    def test_missing_configuration_or_credential_safely_disables_fcm(self):
        for env in ({"FIREBASE_API_KEY": ""}, {"FCM_ENABLED": "false"},
                    {"FIREBASE_WEB_PUSH_CERTIFICATE_KEY": ""}, {"GOOGLE_APPLICATION_CREDENTIALS": ""}):
            with patch.dict(os.environ, env):
                self.assertFalse(service.push_config())
                self.assertFalse(self.client.get("/notifications/push/config").json()["enabled"])
                self.assertEqual(self.client.post("/notifications/push/subscribe", json=self.payload, headers=self.origin).status_code, 503)
                self.assertEqual(service.queue_notification_push("u1", "n1"), 0)

    def test_outbox_is_idempotent_and_only_targets_recipient_devices(self):
        identifier = self.queue()
        self.subscribe("u2", 99)
        service.queue_notification_push("u1", "n1")
        self.assertEqual(len(self.database["push_jobs"].items), 1)
        with patch.object(service, "send_push", return_value="projects/booking-test/messages/m1") as send:
            self.assertTrue(service.deliver_next_push())
            self.assertFalse(service.deliver_next_push())
        self.assertEqual(send.call_count, 1)
        self.assertEqual(send.call_args.args[0]["_id"], identifier)
        self.assertEqual(send.call_args.args[1]["user_id"], "u1")
        self.assertEqual(next(iter(self.database["push_jobs"].items.values()))["provider_id"], "projects/booking-test/messages/m1")

    def test_old_standalone_web_push_subscriptions_are_not_queued(self):
        self.database["push_subscriptions"].insert_one({"_id": "old", "user_id": "u1", "endpoint": "https://example.com"})
        self.assertEqual(service.queue_notification_push("u1", "n1"), 0)

    def test_languages_and_deep_links_follow_existing_notification_events_for_every_role(self):
        self.subscribe()
        for role, expected in (("user", "/user/booking-history"), ("driver", "/driver/home"),
                               ("office_coordinator", "/office/driver-history"), ("superadmin", "/admin/driver-history")):
            self.database["users"].items["u1"]["role"] = role
            with patch.object(notifications, "publish_notification"), \
                    patch.object(notifications, "email_delivery_enabled", return_value=False), \
                    patch.object(notifications, "telegram_delivery_enabled", return_value=False):
                identifier = notifications.create_user_notification("u1", "You have been assigned a new driver task by the booking system.",
                    event="assigned", entity_type="booking", entity_id="b1")
            with patch.object(service, "send_push", return_value="message-id") as send: service.deliver_next_push()
            payload = send.call_args.args[1]
            self.assertEqual(payload["url"], expected)
            self.assertEqual(payload["body"], self.database["notifications"].items[identifier]["message"])
            self.assertEqual("disetujui otomatis" in payload["body"], role == "driver")
        self.assertEqual(service.notification_path("superadmin", "ticket"), "/admin/ticket-history")

    def test_detached_disabled_deleted_rebound_or_changed_project_is_skipped(self):
        for mutation in ("detach", "disable", "delete", "rebind", "revision", "project", "notification-owner"):
            self.database["push_jobs"].items.clear()
            self.database["push_subscriptions"].items.clear()
            self.database["users"].items["u1"] = {"_id": "u1", "role": "user"}
            identifier = self.queue()
            if mutation == "detach": self.database["push_subscriptions"].items.clear()
            elif mutation == "disable": self.database["users"].items["u1"]["disabled"] = True
            elif mutation == "delete": del self.database["users"].items["u1"]
            elif mutation == "rebind": self.database["push_subscriptions"].items[identifier]["user_id"] = "u2"
            elif mutation == "revision": self.database["push_subscriptions"].items[identifier]["revision"] = "different"
            elif mutation == "project": self.database["push_subscriptions"].items[identifier]["project_id"] = "another-project"
            else: self.database["notifications"].items["n1"]["user_id"] = "u2"
            with patch.object(service, "send_push") as send:
                service.deliver_next_push()
                send.assert_not_called()
            self.assertEqual(next(iter(self.database["push_jobs"].items.values()))["status"], "skipped")

    def test_explicit_unregistered_error_removes_only_the_stale_device(self):
        self.queue()
        self.subscribe(index=1)
        with patch.object(service, "send_push", side_effect=service.FCMDeliveryError(404, "UNREGISTERED")):
            service.deliver_next_push()
        self.assertEqual(len(self.database["push_subscriptions"].items), 1)
        self.assertEqual(next(iter(self.database["push_jobs"].items.values()))["status"], "expired")

    def test_bad_project_or_credentials_do_not_delete_device_registrations(self):
        for code in (400, 403, 404):
            self.database["push_jobs"].items.clear()
            self.queue()
            with patch.object(service, "send_push", side_effect=service.FCMDeliveryError(code)):
                service.deliver_next_push()
            self.assertEqual(len(self.database["push_subscriptions"].items), 1)
            self.assertEqual(next(iter(self.database["push_jobs"].items.values()))["status"], "failed")

    def test_transient_retries_are_bounded_and_worker_leases_recover(self):
        self.queue()
        job = next(iter(self.database["push_jobs"].items.values()))
        with patch.object(service, "send_push", side_effect=requests.Timeout("private-credential")) as send:
            for _ in range(service.MAX_ATTEMPTS):
                job["next_attempt_at"] = service.utc_now() - timedelta(seconds=1)
                self.assertTrue(service.deliver_next_push())
            self.assertFalse(service.deliver_next_push())
            self.assertEqual(send.call_count, service.MAX_ATTEMPTS)
        self.assertNotIn("private-credential", str(job))
        job.update(status="processing", attempts=1, lease_until=service.utc_now() - timedelta(seconds=1))
        with patch.object(service, "send_push", return_value="m1"): self.assertTrue(service.deliver_next_push())
        self.assertEqual(job["status"], "sent")

    def test_queue_failure_preserves_notifications_email_and_telegram(self):
        self.database["users"].items["u1"].update(role="driver", email="driver@example.com", telegram_chat_id="123")
        with patch.object(notifications, "publish_notification"), \
                patch.object(notifications, "queue_notification_push", side_effect=RuntimeError("Database unavailable")), \
                patch.object(notifications, "email_delivery_enabled", return_value=True), \
                patch.object(notifications, "telegram_delivery_enabled", return_value=True), \
                patch.object(notifications, "send_notification_email", return_value="email-id") as email, \
                patch.object(notifications, "send_notification_telegram", return_value="telegram-id") as telegram:
            identifier = notifications.create_user_notification("u1", "Message", event="assigned", entity_type="booking", entity_id="b1")
        self.assertIn(identifier, self.database["notifications"].items)
        email.assert_called_once()
        telegram.assert_called_once()

    def test_sender_uses_google_oauth_http_v1_fid_and_data_only_payload(self):
        identifier = self.queue()
        subscription = self.database["push_subscriptions"].items[identifier]
        response = Mock(ok=True)
        response.json.return_value = {"name": "projects/booking-test/messages/m1"}
        with patch.object(service, "access_token", return_value="oauth-test-token"), \
                patch.object(requests.Session, "post", autospec=True, return_value=response) as post:
            self.assertEqual(service.send_push(subscription, {"body": "Tugas baru.", "notification_id": "n1", "user_id": "u1"}, service.push_config()), "projects/booking-test/messages/m1")
        request = post.call_args
        self.assertEqual(request.args[1], "https://fcm.googleapis.com/v1/projects/booking-test/messages:send")
        self.assertEqual(request.kwargs["headers"]["Authorization"], "Bearer oauth-test-token")
        self.assertFalse(request.kwargs["allow_redirects"])
        message = request.kwargs["json"]["message"]
        self.assertEqual(message["fid"], subscription["fid"])
        self.assertNotIn("notification", message)
        self.assertEqual(message["data"]["body"], "Tugas baru.")

    def test_sender_classifies_structured_fcm_errors_without_recording_response_secrets(self):
        identifier = self.queue()
        response = Mock(ok=False, status_code=404)
        response.json.return_value = {"error": {"message": "private-credential", "details": [{
            "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", "errorCode": "UNREGISTERED",
        }]}}
        with patch.object(service, "access_token", return_value="oauth-test-token"), \
                patch.object(requests.Session, "post", return_value=response):
            with self.assertRaises(service.FCMDeliveryError) as error:
                service.send_push(self.database["push_subscriptions"].items[identifier], {}, service.push_config())
        self.assertEqual(error.exception.provider_error, "UNREGISTERED")
        self.assertNotIn("private-credential", str(error.exception))

    def test_credential_project_is_checked_and_google_auth_refresh_uses_timeout(self):
        credential = Mock(project_id="booking-test", valid=False, token="oauth-token")
        config = service.push_config()
        with patch.object(service, "load_credentials", return_value=credential), \
                patch.object(service.os, "stat", return_value=Mock(st_mtime_ns=1)), \
                patch.object(service, "GoogleAuthRequest") as transport:
            self.assertEqual(service.access_token(config), "oauth-token")
            refresh = credential.refresh.call_args.args[0]
            refresh(url="https://oauth2.googleapis.com/token", method="POST")
            self.assertEqual(transport.return_value.call_args.kwargs["timeout"], 5)
            credential.project_id = "wrong-project"
            with self.assertRaises(ValueError): service.access_token(config)

    def test_installation_ids_and_private_credentials_are_redacted_from_audits(self):
        self.assertEqual(safe_request_details({**self.payload, "private_key": "secret"}), {"project_id": "booking-test"})


if __name__ == "__main__": unittest.main()
