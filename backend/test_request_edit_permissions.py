import unittest
from unittest.mock import Mock, patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

import main
import routes_bookings as bookings
import routes_settings as settings
import routes_tickets as tickets
import settings_service


class RequestEditPermissionTests(unittest.TestCase):
    def setUp(self):
        self.role = 'superadmin'
        self.document = {}
        self.settings = Mock()
        self.settings.find_one.side_effect = lambda query: self.document.copy() if self.document else None
        self.settings.update_one.side_effect = self.update_setting
        self.bookings = Mock()
        self.bookings.find_one.return_value = None
        self.tickets = Mock()
        self.tickets.find_one.return_value = None
        def authorize(uid, roles):
            if self.role not in roles:
                raise HTTPException(status_code=403, detail='Forbidden')
            return self.role
        for patcher in (
            patch.object(settings_service, 'db', {'app_settings': self.settings}),
            patch.object(settings, 'db', {'app_settings': self.settings}),
            patch.object(bookings, 'db', {'bookings': self.bookings}),
            patch.object(tickets, 'db', {'tickets': self.tickets}),
            patch.object(bookings, 'ensure_role', side_effect=authorize),
            patch.object(bookings, 'enforce_employee_page_permission'),
            patch.object(tickets, 'ensure_user_role'),
            patch.object(tickets, 'enforce_employee_page_permission'),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        app = FastAPI()
        app.include_router(settings.router)
        app.include_router(bookings.router)
        app.include_router(tickets.router)
        app.dependency_overrides[main.get_current_user] = lambda: {'uid': 'actor', 'role': self.role}
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.booking_payload = dict(driver_id='driver-1', pickup_location='Office', destination='Site',
                                    passenger_count=1, departure_time='2026-10-30T08:00:00Z',
                                    estimated_arrival_time='2026-10-30T09:00:00Z')
        self.office_payload = dict(self.booking_payload, requester_name='Name', requester_email='name@example.com',
                                   status='approved')
        self.ticket_payload = dict(destination='Site', departure_point='Office', departure_date='2026-10-30',
                                   departure_time='08:00', purpose_of_travel='Work', trip_type='One way',
                                   hotel_accommodation=False, transportation_mode='Car')

    def update_setting(self, query, update, **kwargs):
        self.document.update(update['$set'])

    def toggle(self, role, enabled):
        return self.client.patch('/settings/request-edit-permissions', json={'role': role, 'enabled': enabled})

    def test_default_on_and_only_superadmin_can_change_permission(self):
        self.role = 'user'
        response = self.client.get('/settings/request-edit-permissions')
        self.assertEqual(response.json(), {'user': True, 'office_coordinator': True, 'superadmin': True})
        for role in ('user', 'office_coordinator', 'driver'):
            self.role = role
            self.assertEqual(self.toggle('user', False).status_code, 403)
        self.settings.update_one.assert_not_called()
        self.role = 'superadmin'
        self.assertEqual(self.toggle('user', False).json()['user'], False)
        self.assertEqual(self.client.get('/settings/request-edit-permissions').json()['user'], False)
        self.assertEqual(self.toggle('user', True).json()['user'], True)

    def test_disabled_role_cannot_edit_booking_or_travel_through_api(self):
        self.role = 'superadmin'
        self.toggle('user', False)
        self.role = 'user'
        self.assertEqual(self.client.patch('/bookings/b-1', json=self.booking_payload).status_code, 403)
        self.assertEqual(self.client.patch('/tickets/t-1', json=self.ticket_payload).status_code, 403)
        self.bookings.find_one.assert_not_called()
        self.tickets.find_one.assert_not_called()
        self.role = 'superadmin'
        self.toggle('user', True)
        self.role = 'user'
        self.assertEqual(self.client.patch('/bookings/b-1', json=self.booking_payload).status_code, 404)
        self.assertEqual(self.client.patch('/tickets/t-1', json=self.ticket_payload).status_code, 404)

    def test_office_roles_are_blocked_from_booking_edits_independently(self):
        for role in ('office_coordinator', 'superadmin'):
            with self.subTest(role=role):
                self.role = 'superadmin'
                self.toggle(role, False)
                self.role = role
                self.assertEqual(self.client.patch('/bookings/b-1/office-details', json=self.office_payload).status_code, 403)
                self.assertEqual(self.client.patch('/bookings/b-1/requester', json={
                    'requester_name': 'Changed', 'requester_email': 'changed@example.com',
                }).status_code, 403)
                if role == 'superadmin':
                    self.assertEqual(self.client.patch('/bookings/b-1', json=self.booking_payload).status_code, 403)
                self.bookings.find_one.assert_not_called()
                self.role = 'superadmin'
                self.toggle(role, True)

    def test_bad_payload_does_not_change_permissions(self):
        for payload in ({'role': 'driver', 'enabled': False}, {'role': 'user', 'enabled': 'false'},
                        {'role': 'user', 'enabled': False, 'another_role': False}):
            self.assertEqual(self.client.patch('/settings/request-edit-permissions', json=payload).status_code, 422)
        self.settings.update_one.assert_not_called()


if __name__ == '__main__':
    unittest.main()
