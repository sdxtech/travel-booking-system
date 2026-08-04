export function parseApiDate(value) {
  if (!value) return null
  if (value?.seconds) return new Date(value.seconds * 1000)

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map((part) => Number(part))
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
    return new Date(year, month - 1, day)
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function combineDateAndTime(dateValue, timeValue) {
  const base = parseApiDate(dateValue)
  if (!base) return null

  const [hoursRaw, minutesRaw] = String(timeValue || '').split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)

  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    Number.isFinite(hours) ? hours : 9,
    Number.isFinite(minutes) ? minutes : 0,
    0,
    0
  )
}

export function addMinutes(date, minutes) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
  return new Date(date.getTime() + minutes * 60 * 1000)
}

export function toDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatStatusLabel(value) {
  if (!value) return 'Draft'
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const COMPLETED_EVENT_COLOR = '#6b7280'

export function getBookingEventColor(status, driverColor) {
  return String(status || '').toLowerCase() === 'completed' ? COMPLETED_EVENT_COLOR : driverColor
}
