import test from 'node:test'
import assert from 'node:assert/strict'
import { getNightOvertimeMinutes } from './bookingOvertime.js'

const wib = (value) => new Date(`${value}+07:00`)

for (const [label, start, end, expected] of [
  ['five minutes is below the minimum', '2026-09-11T08:00:00', '2026-09-11T17:05:00', 0],
  ['29 minutes 59 seconds is below the minimum', '2026-09-11T17:00:00', '2026-09-11T17:29:59', 0],
  ['exactly 30 minutes qualifies', '2026-09-11T17:00:00', '2026-09-11T17:30:00', 30],
  ['31 minutes counts in full', '2026-09-11T08:00:00', '2026-09-11T17:31:00', 31],
  ['a later Start counts only actual work', '2026-09-11T17:20:00', '2026-09-11T17:31:00', 0],
  ['daytime work is excluded', '2026-09-11T08:00:00', '2026-09-11T17:00:00', 0],
  ['morning work ends at 08:00', '2026-09-11T07:00:00', '2026-09-11T09:00:00', 60],
  ['midnight does not reset the minimum', '2026-09-11T23:45:00', '2026-09-12T00:16:00', 31],
  ['full overnight window', '2026-09-11T16:00:00', '2026-09-12T09:00:00', 900],
  ['multiple days exclude each daytime window', '2026-09-11T17:00:00', '2026-09-13T08:00:00', 1800],
]) {
  test(label, () => assert.equal(getNightOvertimeMinutes(wib(start), wib(end)), expected))
}

test('timestamps use WIB regardless of their original offset', () => {
  assert.equal(getNightOvertimeMinutes(new Date('2026-09-11T10:00:00Z'), new Date('2026-09-11T10:31:00Z')), 31)
})

test('missing, invalid, and reversed timestamps have no overtime value', () => {
  const start = wib('2026-09-11T17:00:00')
  assert.equal(getNightOvertimeMinutes(start, null), null)
  assert.equal(getNightOvertimeMinutes(null, start), null)
  assert.equal(getNightOvertimeMinutes(start, new Date('invalid')), null)
  assert.equal(getNightOvertimeMinutes(start, wib('2026-09-11T16:00:00')), null)
})
