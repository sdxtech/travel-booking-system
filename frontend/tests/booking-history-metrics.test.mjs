import test from 'node:test'
import assert from 'node:assert/strict'
import { getHistoryDistance, getHistoryDurationMinutes, getHistoryOvertimeMinutes } from '../src/components/bookingHistoryMetrics.js'

const trip = {
  started_at: '2026-10-29T10:00:00Z',
  driver_finished_at: '2026-10-29T11:31:00Z',
  starting_mileage: 100, ending_mileage: 127,
}

test('history metrics keep existing calculations until an office correction is supplied', () => {
  assert.equal(getHistoryDurationMinutes(trip), 91)
  assert.equal(getHistoryOvertimeMinutes(trip), 91)
  assert.equal(getHistoryDistance(trip), 27)
  const corrected = { ...trip, total_duration_minutes_override: 120,
    overtime_hours_override: 2, overtime_minutes_override: 15, total_distance_override: 30.5 }
  assert.equal(getHistoryDurationMinutes(corrected), 120)
  assert.equal(getHistoryOvertimeMinutes(corrected), 135)
  assert.equal(getHistoryDistance(corrected), 30.5)
})

test('explicit zero corrections are retained and clearing corrections restores automatic values', () => {
  assert.equal(getHistoryDurationMinutes({ ...trip, total_duration_minutes_override: 0 }), 0)
  assert.equal(getHistoryOvertimeMinutes({ ...trip, overtime_hours_override: 0, overtime_minutes_override: 0 }), 0)
  assert.equal(getHistoryDistance({ ...trip, total_distance_override: 0 }), 0)
  assert.equal(getHistoryDurationMinutes({ ...trip, total_duration_minutes_override: null }), 91)
  assert.equal(getHistoryOvertimeMinutes({ ...trip, overtime_hours_override: null, overtime_minutes_override: null }), 91)
  assert.equal(getHistoryDistance({ ...trip, total_distance_override: null }), 27)
})

test('incomplete trip data stays empty unless a correction is provided', () => {
  assert.equal(getHistoryDurationMinutes({}), null)
  assert.equal(getHistoryOvertimeMinutes({}), null)
  assert.equal(getHistoryDistance({ starting_mileage: null, ending_mileage: 100 }), null)
  assert.equal(getHistoryOvertimeMinutes({ overtime_hours_override: 2 }), 120)
  assert.equal(getHistoryOvertimeMinutes({ ...trip, overtime_minutes_override: 5 }), 65)
})
