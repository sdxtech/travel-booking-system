import { getNightOvertimeMinutes } from './bookingOvertime.js'

function timestamp(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function getHistoryDurationMinutes(booking) {
  if (booking.total_duration_minutes_override != null) return booking.total_duration_minutes_override
  const start = timestamp(booking.started_at)
  const end = timestamp(booking.driver_finished_at)
  if (!start || !end || end < start) return null
  return Math.floor((end - start) / 60000)
}

export function getHistoryOvertimeMinutes(booking) {
  const calculated = getNightOvertimeMinutes(timestamp(booking.started_at), timestamp(booking.driver_finished_at))
  if (booking.overtime_hours_override == null && booking.overtime_minutes_override == null) return calculated
  const hours = booking.overtime_hours_override ?? Math.floor((calculated ?? 0) / 60)
  const minutes = booking.overtime_minutes_override ?? (calculated ?? 0) % 60
  return hours * 60 + minutes
}

export function getHistoryDistance(booking) {
  if (booking.total_distance_override != null) return booking.total_distance_override
  if (booking.starting_mileage == null || booking.ending_mileage == null) return null
  const start = Number(booking.starting_mileage)
  const end = Number(booking.ending_mileage)
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null
}
