const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WIB_OFFSET_MS = 7 * HOUR_MS

// Count only worked time in 17:00–08:00 WIB, including overnight/multi-day trips.
export function getNightOvertimeMinutes(startedAt, finishedAt) {
  if (!(startedAt instanceof Date) || !(finishedAt instanceof Date)) return null
  const start = startedAt.getTime() + WIB_OFFSET_MS
  const end = finishedAt.getTime() + WIB_OFFSET_MS
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null

  let overtimeMs = 0
  for (let day = Math.floor(start / DAY_MS) * DAY_MS; day < end; day += DAY_MS) {
    for (const [windowStart, windowEnd] of [[day, day + 8 * HOUR_MS], [day + 17 * HOUR_MS, day + DAY_MS]]) {
      overtimeMs += Math.max(0, Math.min(end, windowEnd) - Math.max(start, windowStart))
    }
  }

  const minutes = Math.floor(overtimeMs / MINUTE_MS)
  return minutes >= 30 ? minutes : 0
}
