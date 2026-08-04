import { useEffect, useMemo, useState } from 'react'
import MainLayout from '../components/MainLayout'
import { API_BASE_URL } from '../config'

const STATUS_STEPS = [
  { key: 'approved', label: 'Approved' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
]

// Driver task quick view (calendar + status stepper + start/finish flow).
function DriverHome() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [processing, setProcessing] = useState({})

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState(() => new Date())

  const [startModalOpen, setStartModalOpen] = useState(false)
  const [finishModalOpen, setFinishModalOpen] = useState(false)
  const [activeBooking, setActiveBooking] = useState(null)
  const [startingMileage, setStartingMileage] = useState('')
  const [endingMileage, setEndingMileage] = useState('')

  const completedDistance = useMemo(() => {
    const startingValue = Number(activeBooking?.starting_mileage)
    const endingValue = Number(endingMileage)
    if (!Number.isFinite(startingValue) || !Number.isFinite(endingValue)) return ''
    if (endingValue < startingValue) return ''
    return String(endingValue - startingValue)
  }, [activeBooking?.starting_mileage, endingMileage])

  const distanceInvalid = useMemo(() => {
    if (!endingMileage) return false
    const startingValue = Number(activeBooking?.starting_mileage)
    const endingValue = Number(endingMileage)
    if (!Number.isFinite(startingValue) || !Number.isFinite(endingValue)) return false
    return endingValue < startingValue
  }, [activeBooking?.starting_mileage, endingMileage])

  // Load bookings assigned to the signed-in driver.
  useEffect(() => {
    const token = localStorage.getItem('authToken')
    if (!token) {
      setLoading(false)
      setError('Authentication token not found.')
      return
    }

    // Fetch assigned bookings for the driver.
    const loadAssigned = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`${API_BASE_URL}/bookings/assigned`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          let detail = 'Failed to load assignments.'
          try {
            const data = await res.json()
            if (data?.detail) detail = data.detail
          } catch {
            // ignore parse error
          }
          setError(detail)
          setBookings([])
        } else {
          const data = await res.json()
          setBookings(Array.isArray(data) ? data : [])
        }
      } catch {
        setError('Network error. Please try again.')
        setBookings([])
      } finally {
        setLoading(false)
      }
    }

    loadAssigned()
  }, [])

  // Update a booking record in local state after actions.
  const updateBookingInState = (bookingId, updatedFields) => {
    setBookings((prev) =>
      prev.map((booking) => {
        if (booking.id !== bookingId) return booking
        return { ...booking, ...updatedFields }
      })
    )
  }

  // Open the start trip modal for a booking.
  const openStartModal = (booking) => {
    setActiveBooking(booking)
    setStartingMileage('')
    setStartModalOpen(true)
    setActionMessage('')
    setActionError('')
  }

  // Open the finish trip modal for a booking.
  const openFinishModal = (booking) => {
    setActiveBooking(booking)
    setEndingMileage('')
    setFinishModalOpen(true)
    setActionMessage('')
    setActionError('')
  }

  // Close all modals and reset transient state.
  const closeModals = () => {
    setStartModalOpen(false)
    setFinishModalOpen(false)
    setActiveBooking(null)
    setStartingMileage('')
    setEndingMileage('')
  }

  // Mark a booking as started and store starting mileage.
  const handleStart = async () => {
    if (!activeBooking?.id) return

    const mileageValue = Number(startingMileage)
    if (!Number.isFinite(mileageValue) || mileageValue < 0) {
      setActionError('Starting mileage must be a valid number.')
      return
    }

    const token = localStorage.getItem('authToken')
    if (!token) {
      setActionError('Authentication token not found.')
      return
    }

    setProcessing((prev) => ({ ...prev, [activeBooking.id]: true }))
    setActionMessage('')
    setActionError('')

    try {
      const res = await fetch(`${API_BASE_URL}/bookings/${activeBooking.id}/start`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ starting_mileage: mileageValue }),
      })

      if (!res.ok) {
        let detail = 'Failed to start booking.'
        try {
          const data = await res.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setActionError(detail)
        return
      }

      const updated = await res.json()
      updateBookingInState(activeBooking.id, updated)
      setActionMessage('Trip started.')
      closeModals()
    } catch {
      setActionError('Network error. Please try again.')
    } finally {
      setProcessing((prev) => {
        const next = { ...prev }
        delete next[activeBooking.id]
        return next
      })
    }
  }

  // Submit the driver's finish report for Employee or Office validation.
  const handleFinish = async () => {
    if (!activeBooking?.id) return

    const endingValue = Number(endingMileage)
    if (!Number.isFinite(endingValue) || endingValue < 0) {
      setActionError('Ending mileage must be a valid number.')
      return
    }

    const token = localStorage.getItem('authToken')
    if (!token) {
      setActionError('Authentication token not found.')
      return
    }

    setProcessing((prev) => ({ ...prev, [activeBooking.id]: true }))
    setActionMessage('')
    setActionError('')

    try {
      const res = await fetch(`${API_BASE_URL}/bookings/${activeBooking.id}/complete`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ending_mileage: endingValue }),
      })

      if (!res.ok) {
        let detail = 'Failed to complete booking.'
        try {
          const data = await res.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setActionError(detail)
        return
      }

      const updated = await res.json()
      updateBookingInState(activeBooking.id, updated)
      setActionMessage('Finish submitted. Waiting for completion validation.')
      closeModals()
    } catch {
      setActionError('Network error. Please try again.')
    } finally {
      setProcessing((prev) => {
        const next = { ...prev }
        delete next[activeBooking.id]
        return next
      })
    }
  }

  // Normalize booking status for UI (approved + started => in_progress).
  const getBookingStatus = (booking) => {
    const raw = String(booking?.status || 'pending').toLowerCase()

    if (raw === 'approved') {
      const hasStarted = booking?.starting_mileage !== null && booking?.starting_mileage !== undefined
      if (hasStarted || booking?.started_at) return 'in_progress'
    }

    return raw
  }

  // Format status values into human readable text.
  const formatStatusText = (value) => {
    if (!value) return '-'
    return String(value).replace(/_/g, ' ')
  }

  // Render the horizontal status stepper for a booking status value.
  const renderStatusStepper = (value) => {
    const statusValue = String(value || '').toLowerCase()
    const steps = statusValue === 'awaiting_validation'
      ? [STATUS_STEPS[0], STATUS_STEPS[1], { key: 'awaiting_validation', label: 'Awaiting Validation' }]
      : STATUS_STEPS
    const activeIndex = steps.findIndex((step) => step.key === statusValue)

    if (activeIndex < 0) {
      return <span className={`status-badge status-${statusValue}`}>{formatStatusText(statusValue)}</span>
    }

    const nodes = []
    steps.forEach((step, index) => {
      const isDone = index < activeIndex
      const isActive = index === activeIndex
      const stateClass = isDone ? 'is-done' : isActive ? 'is-active' : 'is-upcoming'

      nodes.push(
        <div
          key={`step-${step.key}`}
          className={`status-stepper__step ${stateClass}`}
          role="listitem"
          aria-current={isActive ? 'step' : undefined}
        >
          <span className="status-stepper__label">{step.label}</span>
          <span className="status-stepper__dot" aria-hidden="true">
            {isDone || (isActive && step.key === 'completed') ? (
              <i className="bi bi-check-lg" aria-hidden="true" />
            ) : (
              index + 1
            )}
          </span>
        </div>
      )

      if (index < steps.length - 1) {
        nodes.push(
          <span
            key={`connector-${step.key}`}
            className={`status-stepper__connector ${index < activeIndex ? 'is-done' : ''}`}
            aria-hidden="true"
          />
        )
      }
    })

    return (
      <div className="status-stepper" aria-label="Task status" role="list">
        {nodes}
      </div>
    )
  }

  // Convert a Date into YYYY-MM-DD for grouping/filtering.
  function toDateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
    const year = String(date.getFullYear())
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const normalizedBookings = useMemo(
    () => bookings.map((booking) => ({ ...booking, status: getBookingStatus(booking) })),
    [bookings]
  )

  const items = useMemo(() => {
    const selectedKey = toDateKey(selectedDate)

    const dateFiltered = normalizedBookings.filter((booking) => {
      if (!['approved', 'in_progress', 'awaiting_validation', 'completed'].includes(booking.status)) return false
      if (!booking?.departure_time) return false
      const dt = new Date(booking.departure_time)
      if (Number.isNaN(dt.getTime())) return false
      return toDateKey(dt) === selectedKey
    })

    // Ensure invalid date values don't crash sorting.
    const safeTime = (value) => {
      const dt = new Date(value)
      return Number.isNaN(dt.getTime()) ? null : dt
    }

    const sorted = [...dateFiltered].sort((a, b) => {
      const statusRank = (status) => (status === 'completed' ? 2 : status === 'awaiting_validation' ? 1 : 0)
      const aRank = statusRank(a.status)
      const bRank = statusRank(b.status)
      if (aRank !== bRank) return aRank - bRank

      const aTime = safeTime(a.departure_time)
      const bTime = safeTime(b.departure_time)
      if (!aTime && !bTime) return 0
      if (!aTime) return 1
      if (!bTime) return -1
      return aTime - bTime
    })

    return sorted
  }, [normalizedBookings, selectedDate])

  const monthLabel = useMemo(() => {
    const label = calendarMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : ''
  }, [calendarMonth])

  const calendarWeeks = useMemo(() => {
    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const startIndex = (firstDay.getDay() + 6) % 7 // Monday = 0
    const totalSlots = Math.ceil((startIndex + daysInMonth) / 7) * 7

    const slots = Array.from({ length: totalSlots }, (_, index) => {
      const dayNumber = index - startIndex + 1
      if (dayNumber < 1 || dayNumber > daysInMonth) return null
      return new Date(year, month, dayNumber)
    })

    const weeks = []
    for (let i = 0; i < slots.length; i += 7) {
      weeks.push(slots.slice(i, i + 7))
    }

    return weeks
  }, [calendarMonth])

  const taskMetaByDate = useMemo(() => {
    const map = new Map()
    normalizedBookings.forEach((booking) => {
      if (!['approved', 'in_progress', 'awaiting_validation', 'completed'].includes(booking.status)) return
      if (!booking?.departure_time) return
      const dt = new Date(booking.departure_time)
      if (Number.isNaN(dt.getTime())) return
      const key = toDateKey(dt)
      if (!key) return

      const existing = map.get(key) || { total: 0, incomplete: 0, completed: 0 }
      existing.total += 1
      if (booking.status === 'completed') {
        existing.completed += 1
      } else {
        existing.incomplete += 1
      }
      map.set(key, existing)
    })
    return map
  }, [normalizedBookings])

  const selectedKey = toDateKey(selectedDate)
  const todayKey = useMemo(() => toDateKey(new Date()), [])

  // Format the combined departure date/time for display.
  const formatDeparture = (value) => {
    if (!value) return '-'
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return '-'
    const datePart = dt.toLocaleDateString('en-GB')
    const timePart = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
    return `${datePart} ${timePart}`
  }

  // Move the calendar to the next/previous month and adjust selected day.
  const changeMonth = (delta) => {
    const targetMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + delta, 1)
    const today = new Date()
    const isCurrentMonth =
      today.getFullYear() === targetMonth.getFullYear() && today.getMonth() === targetMonth.getMonth()

    const nextSelectedDate = isCurrentMonth
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate())
      : targetMonth

    setCalendarMonth(targetMonth)
    setSelectedDate(nextSelectedDate)

  }

  const selectedDateLabel =
    selectedDate instanceof Date && !Number.isNaN(selectedDate.getTime())
      ? selectedDate.toLocaleDateString('en-GB')
      : 'this date'

  return (
    <MainLayout title="Driver Tasks">
      <div className="driver-page">
        <section className="driver-calendar" aria-label="Task calendar">
          <div className="calendar-header">
            <button
              type="button"
              className="calendar-nav"
              onClick={() => changeMonth(-1)}
              aria-label="Previous month"
            >
              <i className="bi bi-chevron-left" aria-hidden="true" />
            </button>
            <div className="calendar-month" aria-live="polite">
              {monthLabel}
            </div>
            <button
              type="button"
              className="calendar-nav"
              onClick={() => changeMonth(1)}
              aria-label="Next month"
            >
              <i className="bi bi-chevron-right" aria-hidden="true" />
            </button>
          </div>

          <div className="calendar-legend" aria-label="Calendar legend">
            <div className="calendar-legend-item">
              <span className="calendar-dot task-pending" aria-hidden="true" />
              <span>Pending tasks</span>
            </div>
            <div className="calendar-legend-item">
              <span className="calendar-dot task-completed" aria-hidden="true" />
              <span>Active tasks</span>
            </div>
            <div className="calendar-legend-item">
              <span className="calendar-dot no-task" aria-hidden="true" />
              <span>No tasks</span>
            </div>
          </div>

          <div className="calendar-grid" role="grid" aria-label={monthLabel}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
              <div key={label} className="calendar-weekday" role="columnheader">
                {label}
              </div>
            ))}

            {calendarWeeks.map((week, weekIndex) =>
              week.map((date, dayIndex) => {
                if (!date) {
                  return <div key={`${weekIndex}-${dayIndex}`} className="calendar-cell calendar-cell--empty" />
                }

                const key = toDateKey(date)
                const isSelected = key === selectedKey
                const isToday = key === todayKey
                const meta = taskMetaByDate.get(key)
                const count = meta?.total || 0
                const dayNumber = date.getDate()
                const dotState = meta ? (meta.incomplete > 0 ? 'task-pending' : 'task-completed') : 'no-task'

                return (
                  <button
                    key={key}
                    type="button"
                    className={`calendar-cell ${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}`}
                    onClick={() => setSelectedDate(date)}
                    aria-label={`${dayNumber} ${monthLabel}${count ? `, ${count} task(s)` : ''}`}
                  >
                    <span className="calendar-date">{dayNumber}</span>
                    <span className={`calendar-dot ${dotState}`} aria-hidden="true" />
                  </button>
                )
              })
            )}
          </div>
        </section>

        {loading ? <p className="muted">Loading assignments...</p> : null}
        {!loading && error ? <p className="error-text">{error}</p> : null}
        {!loading && !error && actionMessage ? <p className="success-text">{actionMessage}</p> : null}
        {!loading && !error && actionError ? <p className="error-text">{actionError}</p> : null}

        {!loading && !error && items.length === 0 ? (
          <div className="driver-empty">
            <h2>No tasks for {selectedDateLabel}</h2>
            <p className="muted">Try selecting another date or navigating to another month.</p>
          </div>
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <div className="driver-list">
            {items.map((booking) => {
              const phone = booking.requester_phone || ''
              const email = booking.requester_email || ''
              const isCompleted = booking.status === 'completed'
              const isAwaitingValidation = booking.status === 'awaiting_validation'
              const isStarted = booking.starting_mileage !== null && booking.starting_mileage !== undefined
              return (
                <article key={booking.id} className="driver-card">
                  <h2 className="driver-task-request-id">{booking.request_id || '-'}</h2>
                  {renderStatusStepper(booking.status)}

                  <dl className="driver-task-details">
                    <div className="driver-task-details__row">
                      <dt>Requestor</dt>
                      <dd>{booking.requester_name || '-'}</dd>
                    </div>
                    <div className="driver-task-details__row">
                      <dt>Pick Up Location</dt>
                      <dd>{booking.pickup_location || '-'}</dd>
                    </div>
                    <div className="driver-task-details__row">
                      <dt>Destination</dt>
                      <dd>{booking.destination || '-'}</dd>
                    </div>
                    <div className="driver-task-details__row">
                      <dt>Departure</dt>
                      <dd>{formatDeparture(booking.departure_time)}</dd>
                    </div>
                    <div className="driver-task-details__row">
                      <dt>Estimated Arrival</dt>
                      <dd>{formatDeparture(booking.estimated_arrival_time)}</dd>
                    </div>
                    <div className="driver-task-details__row">
                      <dt>Total Passenger</dt>
                      <dd>{booking.passenger_count ?? '-'}</dd>
                    </div>
                    <div className="driver-task-details__row driver-task-details__row--spaced">
                      <dt>Phone/WA</dt>
                      <dd>{phone || '-'}</dd>
                    </div>
                    <div className="driver-task-details__row">
                      <dt>Email</dt>
                      <dd>{email || '-'}</dd>
                    </div>
                  </dl>

                  <div className="driver-actions driver-actions--task-card">
                    {!isCompleted && !isAwaitingValidation ? (
                      <button
                        type="button"
                        className="btn btn-neutral driver-task-action"
                        disabled={processing[booking.id]}
                        onClick={() => {
                          if (isStarted) {
                            openFinishModal(booking)
                          } else {
                            openStartModal(booking)
                          }
                        }}
                      >
                        {isStarted ? 'Finish' : 'Start'}
                      </button>
                    ) : null}
                    {isAwaitingValidation ? (
                      <span className="driver-validation-waiting">
                        <i className="bi bi-clock-history" aria-hidden="true" />
                        Waiting for completion validation
                      </span>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}

        {startModalOpen ? (
          <div className="modal-overlay" role="dialog" aria-modal="true" onClick={closeModals}>
            <div
              className="modal"
              onClick={(event) => {
                event.stopPropagation()
              }}
            >
              <div className="modal-header">
                <h2>Start Trip</h2>
                <button type="button" className="modal-close" onClick={closeModals} aria-label="Close">
                  &times;
                </button>
              </div>

              {actionError ? <p className="error-text">{actionError}</p> : null}

              <div className="field-grid">
                <label className="inline-label">
                  <span>Starting mileage</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Starting mileage"
                    value={startingMileage}
                    onChange={(e) => setStartingMileage(e.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleStart}
                  disabled={processing[activeBooking?.id]}
                >
                  Save & Start
                </button>
                <button type="button" className="btn btn-outline-danger" onClick={closeModals} disabled={processing[activeBooking?.id]}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {finishModalOpen ? (
          <div className="modal-overlay" role="dialog" aria-modal="true" onClick={closeModals}>
            <div
              className="modal"
              onClick={(event) => {
                event.stopPropagation()
              }}
            >
              <div className="modal-header">
                <h2>Completion Report</h2>
                <button type="button" className="modal-close" onClick={closeModals} aria-label="Close">
                  &times;
                </button>
              </div>

              {actionError ? <p className="error-text">{actionError}</p> : null}

              <div className="field-grid">
                <label className="inline-label">
                  <span>Starting mileage</span>
                  <input type="number" value={activeBooking?.starting_mileage ?? ''} disabled readOnly />
                </label>
                <label className="inline-label">
                  <span>Ending mileage</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Ending mileage"
                    value={endingMileage}
                    onChange={(e) => setEndingMileage(e.target.value)}
                    required
                  />
                </label>
                <label className="inline-label">
                  <span>Total distance (auto)</span>
                  <input type="number" placeholder="Auto calculated" value={completedDistance} disabled readOnly />
                </label>
                {distanceInvalid ? (
                  <p className="error-text" style={{ gridColumn: '1 / -1' }}>
                    Ending mileage must be greater than or equal to starting mileage.
                  </p>
                ) : null}
                <div className="driver-completion-validation-note" style={{ gridColumn: '1 / -1' }}>
                  <i className="bi bi-person-check" aria-hidden="true" />
                  <span>The trip will be marked as awaiting validation after this report is submitted.</span>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleFinish}
                  disabled={processing[activeBooking?.id]}
                >
                  Submit Finish
                </button>
                <button type="button" className="btn btn-outline-danger" onClick={closeModals} disabled={processing[activeBooking?.id]}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </MainLayout>
  )
}

export default DriverHome
