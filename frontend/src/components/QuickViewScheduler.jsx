import { useEffect, useMemo, useRef, useState } from 'react'
import { addMinutes, parseApiDate, toDateKey } from './quickViewSchedulerUtils'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_IN_WEEK = WEEKDAYS.length
const START_HOUR = 0
const END_HOUR = 24
const HOUR_HEIGHT = 64

function formatEventDateTime(value) {
  return value.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

function startOfWorkWeek(date) {
  const base = parseApiDate(date) || new Date()
  const day = base.getDay()
  const diff = -day
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + diff)
}

function formatWeekRange(days) {
  const first = days[0]
  const last = days[days.length - 1]
  if (!first || !last) return ''

  const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()
  if (sameMonth) {
    const month = first.toLocaleDateString('en-US', { month: 'long' })
    return `${month} ${first.getDate()}-${last.getDate()}, ${first.getFullYear()}`
  }

  const startLabel = first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endLabel = last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startLabel} - ${endLabel}`
}

function formatTimeLabel(hour) {
  const normalizedHour = hour % 24
  const suffix = normalizedHour >= 12 ? 'PM' : 'AM'
  const value = normalizedHour % 12 || 12
  return `${value} ${suffix}`
}

function getEventSegments(event, weekDays) {
  if (!(event.start instanceof Date) || Number.isNaN(event.start.getTime())) return []

  const fallbackEnd = addMinutes(event.start, 60)
  const eventEnd = event.end instanceof Date && !Number.isNaN(event.end.getTime()) ? event.end : fallbackEnd
  if (!(eventEnd instanceof Date) || eventEnd <= event.start) return []

  const rangeStart = START_HOUR * 60
  const rangeEnd = END_HOUR * 60

  return weekDays.flatMap((day, dayIndex) => {
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), START_HOUR, 0, 0, 0)
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, START_HOUR, 0, 0, 0)
    const segmentStart = event.start > dayStart ? event.start : dayStart
    const segmentEnd = eventEnd < dayEnd ? eventEnd : dayEnd
    if (segmentEnd <= segmentStart) return []

    const startMinutes = (segmentStart.getTime() - dayStart.getTime()) / 60000
    const endMinutes = (segmentEnd.getTime() - dayStart.getTime()) / 60000
    if (endMinutes <= rangeStart || startMinutes >= rangeEnd) return []

    const clampedStart = Math.max(startMinutes, rangeStart)
    const clampedEnd = Math.min(endMinutes, rangeEnd)
    const top = ((clampedStart - rangeStart) / 60) * HOUR_HEIGHT
    const height = ((clampedEnd - clampedStart) / 60) * HOUR_HEIGHT
    if (height <= 0) return []

    return [
      {
        dayIndex,
        top,
        height,
        segmentStart,
        segmentEnd,
      },
    ]
  })
}

function QuickViewScheduler({
  title,
  toolbarLabel = title,
  selectorLabel = 'Driver availability',
  calendars,
  events,
  loading = false,
  error = '',
  onEmptySlotClick,
}) {
  const today = useMemo(() => new Date(), [])
  const [selectedDate, setSelectedDate] = useState(today)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const eventDialogRef = useRef(null)

  useEffect(() => {
    if (selectedEvent) eventDialogRef.current?.showModal()
  }, [selectedEvent])
  const [selectedCalendarIds, setSelectedCalendarIds] = useState([])
  const [hasCustomizedCalendarSelection, setHasCustomizedCalendarSelection] = useState(false)
  const availableCalendarIds = useMemo(() => new Set(calendars.map((calendar) => String(calendar.id))), [calendars])
  // Until the user changes the selection, immediately show the first two
  // driver calendars returned by the API.
  const defaultCalendarIds = useMemo(() => calendars.slice(0, 2).map((calendar) => String(calendar.id)), [calendars])
  const effectiveSelectedCalendarIds = hasCustomizedCalendarSelection ? selectedCalendarIds : defaultCalendarIds

  const activeCalendarIds = useMemo(
    () => new Set(effectiveSelectedCalendarIds.filter((calendarId) => availableCalendarIds.has(calendarId))),
    [availableCalendarIds, effectiveSelectedCalendarIds]
  )

  const weekDays = useMemo(() => {
    const start = startOfWorkWeek(selectedDate)
    return Array.from({ length: DAYS_IN_WEEK }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return date
    })
  }, [selectedDate])

  const weekLabel = useMemo(() => formatWeekRange(weekDays), [weekDays])
  const weekInterval = useMemo(() => {
    const firstDay = weekDays[0]
    const start = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate())
    const end = new Date(start)
    end.setDate(start.getDate() + DAYS_IN_WEEK)
    return { start, end }
  }, [weekDays])
  const todayKey = toDateKey(today)
  const hours = useMemo(
    () => Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => START_HOUR + index),
    []
  )
  const halfHourSlots = useMemo(
    () => Array.from({ length: (END_HOUR - START_HOUR) * 2 }, (_, index) => index),
    []
  )

  const visibleCalendars = useMemo(
    () => calendars.filter((calendar) => activeCalendarIds.has(String(calendar.id))),
    [activeCalendarIds, calendars]
  )
  const normalizedEvents = useMemo(
    () =>
      events
        .map((event) => {
          const start = parseApiDate(event.start)
          const parsedEnd = parseApiDate(event.end)
          const end = start && parsedEnd && parsedEnd > start ? parsedEnd : start ? addMinutes(start, 60) : null
          return { ...event, start, end }
        })
        .filter((event) => event.start && event.end),
    [events]
  )

  const eventsByCalendar = useMemo(() => {
    const map = new Map(visibleCalendars.map((calendar) => [String(calendar.id), []]))
    normalizedEvents.forEach((event) => {
      if (event.end <= weekInterval.start || event.start >= weekInterval.end) return
      const bucket = map.get(String(event.calendarId))
      if (!bucket) return
      bucket.push(event)
    })

    map.forEach((items) => {
      items.sort((a, b) => a.start - b.start)
    })

    return map
  }, [normalizedEvents, visibleCalendars, weekInterval])

  const currentTimePlacement = useMemo(() => {
    const now = new Date()
    const todayIndex = weekDays.findIndex((day) => toDateKey(day) === toDateKey(now))
    if (todayIndex < 0) return null

    const minutes = now.getHours() * 60 + now.getMinutes()
    const rangeStart = START_HOUR * 60
    const rangeEnd = END_HOUR * 60
    if (minutes < rangeStart || minutes > rangeEnd) return null

    return {
      dayIndex: todayIndex,
      top: ((minutes - rangeStart) / 60) * HOUR_HEIGHT,
    }
  }, [weekDays])

  const changeWeek = (delta) => {
    setSelectedDate((current) => {
      const next = new Date(current)
      next.setDate(current.getDate() + delta * 7)
      return next
    })
  }

  const goToday = () => {
    setSelectedDate(new Date())
  }

  const toggleCalendar = (calendarId) => {
    const normalizedId = String(calendarId)
    setSelectedCalendarIds(() => {
      const next = new Set(activeCalendarIds)
      if (next.has(normalizedId)) {
        next.delete(normalizedId)
      } else {
        next.add(normalizedId)
      }
      return [...next]
    })
    setHasCustomizedCalendarSelection(true)
  }

  const selectEmptySlot = (date, calendar, slotIndex) => {
    if (!onEmptySlotClick) return
    const start = new Date(date)
    const minutes = (START_HOUR * 60) + (slotIndex * 30)
    start.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
    onEmptySlotClick({ calendar, start })
  }

  const selectedDriverLabel = visibleCalendars.length
    ? `${visibleCalendars.length} driver${visibleCalendars.length > 1 ? 's' : ''} selected`
    : 'Select drivers'

  return (
    <section className="quick-scheduler" aria-label={title}>
      <div className="quick-scheduler__main">
        <header className="quick-scheduler__toolbar">
          <div className="quick-scheduler__toolbar-left">
            <button type="button" className="quick-today-button" onClick={goToday}>
              <i className="bi bi-calendar2-check" aria-hidden="true" />
              <span>Today</span>
            </button>
            <button type="button" className="quick-icon-button" onClick={() => changeWeek(-1)} aria-label="Previous week">
              <i className="bi bi-chevron-left" aria-hidden="true" />
            </button>
            <div>
              <h1 className="quick-scheduler__title">{weekLabel}</h1>
              {toolbarLabel ? <p>{toolbarLabel}</p> : null}
            </div>
            <button type="button" className="quick-icon-button" onClick={() => changeWeek(1)} aria-label="Next week">
              <i className="bi bi-chevron-right" aria-hidden="true" />
            </button>
          </div>
          <div className="quick-scheduler__toolbar-meta">
            <div className="quick-scheduler__driver-select">
              <span>{selectorLabel}</span>
              <details className="quick-driver-multiselect">
                <summary aria-label={selectorLabel} aria-disabled={loading || calendars.length === 0}>
                  <span>{calendars.length ? selectedDriverLabel : 'No drivers available'}</span>
                  <i className="bi bi-chevron-down" aria-hidden="true" />
                </summary>
                {calendars.length ? (
                  <div className="quick-driver-multiselect__menu">
                    {calendars.map((calendar) => {
                      const calendarId = String(calendar.id)
                      return (
                        <label key={calendar.id} className="quick-driver-multiselect__option">
                          <input
                            type="checkbox"
                            checked={activeCalendarIds.has(calendarId)}
                            onChange={() => toggleCalendar(calendarId)}
                          />
                          <span className="quick-driver-multiselect__color" style={{ backgroundColor: calendar.color }} />
                          <span>{calendar.name}{calendar.plateLabel ? ` — ${calendar.plateLabel}` : ''}</span>
                        </label>
                      )
                    })}
                  </div>
                ) : null}
              </details>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="quick-scheduler__notice">
            <i className="bi bi-arrow-clockwise" aria-hidden="true" />
            <span>Loading schedule...</span>
          </div>
        ) : null}
        {!loading && error ? (
          <div className="quick-scheduler__notice is-error">
            <i className="bi bi-exclamation-triangle" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {visibleCalendars.length === 0 ? (
          <div className="quick-scheduler__blank" />
        ) : (
          <div
            className="quick-scheduler__board"
            style={{
              '--quick-hour-height': `${HOUR_HEIGHT}px`,
              '--quick-body-height': `${(END_HOUR - START_HOUR) * HOUR_HEIGHT}px`,
            }}
          >
            <div className="quick-scheduler__time-column" aria-hidden="true">
              <div className="quick-scheduler__time-spacer" />
              <div className="quick-scheduler__time-body">
                {hours.map((hour) => (
                  <span key={hour} style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}>
                    {formatTimeLabel(hour)}
                  </span>
                ))}
              </div>
            </div>

            <div className="quick-scheduler__lanes">
              {visibleCalendars.map((calendar) => {
                const laneEvents = eventsByCalendar.get(String(calendar.id)) || []

                return (
                  <section key={calendar.id} className="quick-scheduler-lane" aria-label={calendar.name}>
                    <div className="quick-scheduler-lane__title" style={{ color: calendar.color }}>
                      <span>{calendar.name}</span>
                    </div>
                    <div className="quick-scheduler-lane__days">
                      {weekDays.map((date, index) => (
                        <div key={toDateKey(date)} className={toDateKey(date) === todayKey ? 'is-today' : ''}>
                          <strong>{date.getDate()}</strong>
                          <span>{WEEKDAYS[index]}</span>
                        </div>
                      ))}
                    </div>
                    <div className="quick-scheduler-lane__body">
                      {weekDays.map((date) => <div key={toDateKey(date)} className="quick-scheduler-lane__day" />)}
                      {onEmptySlotClick ? (
                        <div className="quick-scheduler-lane__slots">
                          {halfHourSlots.flatMap((slotIndex) => weekDays.map((date) => {
                            const minutes = slotIndex * 30
                            const hour = String(Math.floor(minutes / 60)).padStart(2, '0')
                            const minute = String(minutes % 60).padStart(2, '0')
                            return (
                              <button
                                key={`${toDateKey(date)}-${slotIndex}`}
                                type="button"
                                className="quick-scheduler-lane__slot"
                                onClick={() => selectEmptySlot(date, calendar, slotIndex)}
                                aria-label={`Create booking for ${calendar.name} on ${date.toLocaleDateString('en-GB')} at ${hour}:${minute}`}
                              />
                            )
                          }))}
                        </div>
                      ) : null}

                      {currentTimePlacement ? (
                        <div
                          className="quick-scheduler__now-line"
                          style={{
                            top: `${currentTimePlacement.top}px`,
                            left: `calc(${currentTimePlacement.dayIndex} * (100% / ${DAYS_IN_WEEK}))`,
                          }}
                          aria-hidden="true"
                        >
                          <span />
                        </div>
                      ) : null}

                      {laneEvents.flatMap((event) =>
                        getEventSegments(event, weekDays).map((placement) => {
                          const compact = placement.height < 42
                          const details = [
                            event.departurePoint || '-',
                            'To',
                            event.destinationPoint || '-',
                          ]
                          const eventDescription = [event.title, ...details, event.meta].filter(Boolean).join('\n')

                          return (
                          <button
                            type="button"
                            onClick={() => setSelectedEvent({ ...event, driverName: calendar.name })}
                            aria-haspopup="dialog"
                            key={`${event.id}-${placement.dayIndex}`}
                            className={`quick-scheduler-event ${compact ? 'is-compact' : ''}`}
                            style={{
                              top: `${placement.top}px`,
                              height: `${placement.height}px`,
                              left: `calc(${placement.dayIndex} * (100% / ${DAYS_IN_WEEK}) + 4px)`,
                              width: `calc((100% / ${DAYS_IN_WEEK}) - 8px)`,
                              backgroundColor: event.color || calendar.color,
                            }}
                            title={eventDescription}
                            aria-label={eventDescription}
                          >
                            <strong>{event.title}</strong>
                            {!compact ? details.map((detail, index) => <span key={index}>{detail}</span>) : null}
                          </button>
                          )
                        })
                      )}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>
        )}
      </div>
      {selectedEvent ? (
        <dialog
          ref={eventDialogRef}
          className="modal quick-scheduler-event-dialog"
          aria-labelledby="scheduler-event-details-title"
          onClose={() => setSelectedEvent(null)}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return
            const bounds = event.currentTarget.getBoundingClientRect()
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
              event.currentTarget.close()
            }
          }}
        >
          <div className="modal-header">
            <h2 id="scheduler-event-details-title">Booking Driver Details</h2>
            <button type="button" className="modal-close" aria-label="Close details" onClick={() => eventDialogRef.current?.close()}>
              <i className="bi bi-x-lg" aria-hidden="true" />
            </button>
          </div>
          <dl className="ticket-details-grid">
            {[
              ['Driver', selectedEvent.driverName],
              ['Status', selectedEvent.statusLabel],
              ['Departure Date & Time', formatEventDateTime(selectedEvent.start)],
              ['Estimated Arrival Date & Time', formatEventDateTime(selectedEvent.end)],
              ['DEPARTURE POINT', selectedEvent.departurePoint],
              ['DESTINATION POINT', selectedEvent.destinationPoint],
            ].map(([label, value]) => (
              <div key={label} className="ticket-details-item ticket-details-item--full">
                <dt>{label}</dt>
                <dd>{value || '-'}</dd>
              </div>
            ))}
          </dl>
        </dialog>
      ) : null}
    </section>
  )
}

export default QuickViewScheduler
