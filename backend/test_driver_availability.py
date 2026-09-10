import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException

import main  # noqa: F401 - Initialize routers before importing their handlers.
import routes_settings as settings


class DriverAvailabilityTests(unittest.TestCase):
    def setUp(self):
        self.driver = {
            "_id": "driver-1", "role": "driver", "name": "Driver 1",
            "email": "driver@example.com", "booking_enabled": True, "disabled": False,
        }
        self.users = Mock()
        self.users.find.return_value = [self.driver]
        self.users.find_one.return_value = self.driver
        self.users.update_one.side_effect = lambda query, update: self.driver.update(update["$set"])
        self.app_settings = Mock()
        for patcher in (
            patch.object(settings, "db", {"users": self.users, "app_settings": self.app_settings}),
            patch.object(settings, "create_user_notification"),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_coordinator_and_superadmin_can_read_driver_availability(self):
        for role in ("office_coordinator", "superadmin"):
            with self.subTest(role=role):
                result = settings.list_driver_availability({"uid": "actor", "role": role})
                self.assertEqual(result[0].driver_id, "driver-1")
                self.assertTrue(result[0].booking_enabled)

    def test_both_roles_can_turn_driver_off_and_on_with_correct_notification_actor(self):
        for role, label in (("office_coordinator", "Office Coordinator"), ("superadmin", "Super Admin")):
            for enabled in (False, True):
                with self.subTest(role=role, enabled=enabled):
                    result = settings.update_driver_availability(
                        "driver-1", settings.DriverAvailabilityUpdate(booking_enabled=enabled),
                        {"uid": role, "role": role},
                    )
                    self.assertEqual(result.booking_enabled, enabled)
                    self.assertEqual(result.updated_by, role)
                    notification = settings.create_user_notification.call_args
                    self.assertIn(f"by {label}.", notification.args[1])
                    self.assertEqual(notification.kwargs["actor_id"], role)
                    self.assertEqual(notification.kwargs["status"], "on" if enabled else "off")

    def test_employee_and_driver_cannot_read_or_change_availability(self):
        for role in ("user", "driver", None):
            with self.subTest(role=role):
                actor = {"uid": "unauthorized", "role": role}
                with self.assertRaises(HTTPException) as denied:
                    settings.list_driver_availability(actor)
                self.assertEqual(denied.exception.status_code, 403)
                with self.assertRaises(HTTPException) as denied:
                    settings.update_driver_availability(
                        "driver-1", settings.DriverAvailabilityUpdate(booking_enabled=False), actor,
                    )
                self.assertEqual(denied.exception.status_code, 403)
        self.users.find.assert_not_called()
        self.users.update_one.assert_not_called()
        settings.create_user_notification.assert_not_called()

    def test_coordinator_cannot_change_cancellation_policy(self):
        with self.assertRaises(HTTPException) as denied:
            settings.update_booking_cancellation_policy(
                settings.BookingCancellationPolicyUpdate(value=1, unit="days", cutoff_time="17:00"),
                {"uid": "coordinator", "role": "office_coordinator"},
            )
        self.assertEqual(denied.exception.status_code, 403)
        self.app_settings.update_one.assert_not_called()

    def test_toggle_preserves_login_state_and_only_changes_booking_availability_metadata(self):
        self.driver["disabled"] = True
        result = settings.update_driver_availability(
            "driver-1", settings.DriverAvailabilityUpdate(booking_enabled=False),
            {"uid": "coordinator", "role": "office_coordinator"},
        )
        self.assertTrue(result.account_disabled)
        changed_fields = self.users.update_one.call_args.args[1]["$set"]
        self.assertEqual(set(changed_fields), {
            "booking_enabled", "booking_enabled_updated_at", "booking_enabled_updated_by",
            "updated_at", "updated_by",
        })

    def test_non_driver_accounts_cannot_be_toggled(self):
        self.driver["role"] = "user"
        with self.assertRaises(HTTPException) as denied:
            settings.update_driver_availability(
                "driver-1", settings.DriverAvailabilityUpdate(booking_enabled=False),
                {"uid": "coordinator", "role": "office_coordinator"},
            )
        self.assertEqual(denied.exception.status_code, 400)
        self.users.update_one.assert_not_called()


if __name__ == "__main__":
    unittest.main()
