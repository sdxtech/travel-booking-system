import unittest
from unittest.mock import Mock, patch

import main  # noqa: F401 -- initialize application before its routers
import routes_bookings as bookings
import test_booking_requester as requester_tests


class BookingCorrectionTests(unittest.TestCase):
    def setUp(self):
        requester_tests.BookingRequesterTests.setUp(self)
        patcher = patch.object(bookings, 'create_user_notification')
        self.notifications = patcher.start()
        self.addCleanup(patcher.stop)

    update_one = requester_tests.BookingRequesterTests.update_one

    def build_payload(self):
        keys = ('driver_id', 'pickup_location', 'destination', 'departure_time',
                'estimated_arrival_time', 'passenger_count', 'status', 'starting_mileage',
                'ending_mileage', 'started_at', 'driver_finished_at', 'validated_at',
                'created_at', 'validated_by_name')
        result = {key: self.document.get(key) for key in keys}
        result.update(self.payload_requester)
        return {key: value.isoformat() if hasattr(value, 'isoformat') else value for key, value in result.items()}

    def submit_correction(self, **changes):
        return self.client.patch('/bookings/booking-1/office-details', json={**self.correction, **changes})

    def prepare(self):
        # The shared fixture provides the requester payload as an instance attribute.
        self.payload_requester = self.payload
        self.correction = self.build_payload()

    def test_office_roles_correct_legacy_zero_mileage_and_keep_identity(self):
        self.prepare()
        for role in ('office_coordinator', 'superadmin'):
            for state in ('awaiting_validation', 'completed'):
                with self.subTest(role=role, state=state):
                    self.role = role
                    self.document.update(starting_mileage=0, ending_mileage=0, status=state)
                    response = self.submit_correction(starting_mileage=190600, ending_mileage=190692, status=state)
                    self.assertEqual(response.status_code, 200, response.text)
                    result = response.json()
                    self.assertEqual(result['ending_mileage'] - result['starting_mileage'], 92)
                    self.assertEqual(result['user_id'], 'original-employee')
                    self.assertEqual(result['request_id'], 'SDX-BD-26102026-001')
        self.users.update_one.assert_not_called()
        self.notifications.assert_not_called()

    def test_non_office_roles_denied(self):
        self.prepare()
        for role in ('user', 'driver', None):
            self.role = role
            self.assertEqual(self.submit_correction().status_code, 403)
        self.collection.update_one.assert_not_called()

    def test_reject_invalid_mileage_and_dates_without_writing(self):
        self.prepare()
        for change in ({'starting_mileage': -1}, {'ending_mileage': 1.5},
                       {'starting_mileage': None, 'ending_mileage': 120},
                       {'starting_mileage': 200, 'ending_mileage': 120},
                       {'status': 'completed', 'ending_mileage': None},
                       {'status': 'in_progress', 'started_at': None},
                       {'driver_finished_at': '2026-10-25T00:00:00Z'},
                       {'status': 'completed', 'validated_at': None},
                       {'user_id': 'another-account'}, {'request_id': 'changed'}):
            with self.subTest(change=change):
                self.assertIn(self.submit_correction(**change).status_code, (400, 422))
        self.collection.update_one.assert_not_called()

    def test_oc_checks_conflicts_and_superadmin_retains_override(self):
        self.prepare()
        with patch.object(bookings, 'resolve_driver', return_value={'name': 'New Driver'}), \
                patch.object(bookings, 'is_driver_busy', return_value=True) as busy:
            self.assertEqual(self.submit_correction(driver_id='driver-2').status_code, 409)
            self.collection.update_one.assert_not_called()
            self.assertEqual(busy.call_args.kwargs['exclude_booking_id'], 'booking-1')
            self.role = 'superadmin'
            self.assertEqual(self.submit_correction(driver_id='driver-2').status_code, 200)
            self.assertEqual(self.notifications.call_count, 2)

    def test_stale_edit_is_rejected(self):
        self.prepare()
        self.collection.update_one.side_effect = None
        self.collection.update_one.return_value = Mock(matched_count=0)
        self.assertEqual(self.submit_correction().status_code, 409)

    def test_driver_blank_and_invalid_mileage_never_writes(self):
        self.role = 'driver'
        self.document['driver_id'] = 'actor'
        for action, field in (('start', 'starting_mileage'), ('complete', 'ending_mileage')):
            for value in (None, '', '  ', -1, 1.5, True, '100'):
                response = self.client.patch(f'/bookings/booking-1/{action}', json={field: value})
                self.assertEqual(response.status_code, 422, response.text)
                self.assertIn('Kilometer ', response.json()['detail'][0]['msg'])
            response = self.client.patch(f'/bookings/booking-1/{action}', json={})
            self.assertEqual(response.status_code, 422)
            self.assertIn('wajib diisi', response.json()['detail'][0]['msg'])
        self.collection.update_one.assert_not_called()

    def test_driver_can_start_with_explicit_zero_then_finish(self):
        self.role = 'driver'
        self.document.update(driver_id='actor', starting_mileage=None, ending_mileage=None)
        response = self.client.patch('/bookings/booking-1/start', json={'starting_mileage': 0})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['status'], 'in_progress')
        with patch.object(bookings, 'create_user_notification'), patch.object(bookings, 'notify_roles'):
            response = self.client.patch('/bookings/booking-1/complete', json={'ending_mileage': 25})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['status'], 'awaiting_validation')


if __name__ == '__main__':
    unittest.main()
