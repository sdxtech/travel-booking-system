import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MainLayout from '../components/MainLayout'
import { API_BASE_URL } from '../config'
import ViewModeToggle from '../components/ViewModeToogle'
import DataCard from '../components/DataCard'
import DataTable from '../components/DataTable'


// List the signed-in user's driver bookings and their statuses.
function BookingHistory() {
  const navigate = useNavigate()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState('')
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [cancellationPolicy, setCancellationPolicy] = useState(null)

  const [page, setPage] = useState(1)
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' })


  const [viewMode, setViewMode] = useState('card')

  const pageSize = 10


  useEffect(() => {
    if (window.innerWidth <= 768) {
      setViewMode('card')
    }
  }, [])

  // Convert API timestamps into a Date instance.
  const toDate = (value) => {
    if (!value) return null
    if (value?.seconds) return new Date(value.seconds * 1000)
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
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

  // Format status strings for display.
  const formatStatusText = (value) => {
    if (!value) return '-'
    return String(value).replace(/_/g, ' ')
  }

  const getCancellationPolicyLabel = () => {
    if (!cancellationPolicy) return ''
    const value = Number(cancellationPolicy.value) || 1
    if (cancellationPolicy.unit === 'hours') {
      return `${value} ${value === 1 ? 'hour' : 'hours'} before departure`
    }
    return `${value} ${value === 1 ? 'day' : 'days'} before departure at ${cancellationPolicy.cutoff_time || '17:00'} WIB`
  }

  // Match the server-side cutoff so unavailable cancellation actions are disabled in advance.
  const canCancelBooking = (booking) => {
    if (booking.cancellation_status === 'pending') return false
    if (getBookingStatus(booking) !== 'pending') return false
    if (!cancellationPolicy) return true

    const departureTime = toDate(booking?.departure_time)
    if (!departureTime) return true

    if (cancellationPolicy.unit === 'days') {
      const dateParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(departureTime)
        .reduce((parts, item) => ({ ...parts, [item.type]: item.value }), {})
      const [cutoffHour, cutoffMinute] = String(cancellationPolicy.cutoff_time || '17:00').split(':').map(Number)
      const dayOffset = Number(cancellationPolicy.value) || 1
      const deadline = Date.UTC(
        Number(dateParts.year),
        Number(dateParts.month) - 1,
        Number(dateParts.day) - dayOffset,
        cutoffHour - 7,
        cutoffMinute
      )
      return Date.now() <= deadline
    }

    const cutoffMinutes = Number(cancellationPolicy.cutoff_minutes)
    if (!Number.isFinite(cutoffMinutes)) return true
    return departureTime.getTime() - Date.now() >= cutoffMinutes * 60 * 1000
  }

  // Provide a stable sort value per table column.
  const getBookingSortValue = (booking, key) => {
    if (!booking) return ''
    switch (key) {
      case 'created_at':
        return toDate(booking.created_at)?.getTime() ?? null
      case 'request_id':
        return booking.request_id || ''
      case 'requester_name':
        return booking.requester_name || ''
      case 'requester_nik':
        return booking.requester_nik || ''
      case 'requester_dept_job_position':
        return booking.requester_dept_job_position || ''
      case 'requester_phone':
        return booking.requester_phone || ''
      case 'requester_email':
        return booking.requester_email || ''
      case 'pickup_location':
        return booking.pickup_location || ''
      case 'destination':
        return booking.destination || ''
      case 'driver_name':
        return booking.driver_name || booking.driver_id || ''
      case 'passenger_count': {
        const count = Number(booking.passenger_count)
        return Number.isFinite(count) ? count : null
      }
      case 'trip_type':
        return booking.trip_type || ''
      case 'departure_time':
        return toDate(booking.departure_time)?.getTime() ?? null
      case 'estimated_arrival_time':
        return toDate(booking.estimated_arrival_time)?.getTime() ?? null
      case 'status':
        return getBookingStatus(booking)
      default:
        return ''
    }
  }

  // Compare values while keeping empty values at the bottom.
  const compareValues = (aValue, bValue) => {
    const aEmpty = aValue === null || aValue === undefined || aValue === ''
    const bEmpty = bValue === null || bValue === undefined || bValue === ''

    if (aEmpty && bEmpty) return 0
    if (aEmpty) return 1
    if (bEmpty) return -1

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return aValue - bValue
    }

    return String(aValue).localeCompare(String(bValue), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  }

  // Sort bookings based on the active column/direction.
  const sortedBookings = useMemo(() => {
    if (!sortConfig.key) return bookings

    return bookings
      .map((booking, index) => ({ booking, index }))
      .sort((a, b) => {
        const aValue = getBookingSortValue(a.booking, sortConfig.key)
        const bValue = getBookingSortValue(b.booking, sortConfig.key)
        const base = compareValues(aValue, bValue)

        if (base !== 0) {
          return sortConfig.direction === 'asc' ? base : -base
        }

        return a.index - b.index
      })
      .map((entry) => entry.booking)
  // Sorting helpers are pure and intentionally scoped to this component.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, sortConfig])

  const totalPages = Math.max(1, Math.ceil(sortedBookings.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedBookings = sortedBookings.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Keep page index within bounds when the list size changes.
  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages))
  }, [totalPages])

  // Allow the details dialog to be closed with the Escape key.
  useEffect(() => {
    if (!selectedBooking) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSelectedBooking(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedBooking])

  // Load the current user's booking history.
  useEffect(() => {
    const fetchBookings = async () => {
      setLoading(true)
      setError('')

      try {
        const [response, policyResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/bookings/my`, { credentials: 'include' }),
          fetch(`${API_BASE_URL}/settings/booking-cancellation`, { credentials: 'include' }),
        ])

        if (policyResponse.ok) {
          const policyData = await policyResponse.json()
          setCancellationPolicy(policyData)
        }

        if (!response.ok) {
          let detail = 'Failed to load bookings.'
          try {
            const data = await response.json()
            if (data?.detail) detail = data.detail
          } catch {
            // ignore parse error
          }
          setError(detail)
          setBookings([])
        } else {
          const data = await response.json()
          setBookings(Array.isArray(data) ? data : [])
        }
      } catch {
        setError('Network error. Please try again.')
        setBookings([])
      } finally {
        setLoading(false)
      }
    }

    fetchBookings()
  }, [])

  const handleEdit = (booking) => {
    navigate('/user/booking-driver', { state: { booking } })
  }

  const handleCancel = async (bookingId) => {
    const confirmed = window.confirm(cancellationPolicy?.auto_approve === false
      ? 'Request Office Coordinator approval to cancel this booking?'
      : 'Cancel this driver booking request?')
    if (!confirmed) return

    setActionLoadingId(bookingId)
    setActionError('')
    setActionMessage('')

    try {
      const response = await fetch(`${API_BASE_URL}/bookings/${bookingId}/cancel`, {
        method: 'PATCH',
        credentials: 'include',
      })

      if (!response.ok) {
        let detail = 'Failed to cancel booking.'
        try {
          const data = await response.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setActionError(detail)
        return
      }

      const updated = await response.json()
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? updated : b)))
      setActionMessage(updated.cancellation_status === 'pending'
        ? 'Cancellation requested. Waiting for Office Coordinator approval.'
        : 'Booking cancelled.')
      window.dispatchEvent(new Event('notifications:refresh'))
    } catch {
      setActionError('Network error. Please try again.')
    } finally {
      setActionLoadingId('')
    }
  }

  const handleValidateCompletion = async (booking) => {
    const confirmed = window.confirm('Confirm that this trip has been completed?')
    if (!confirmed) return

    setActionLoadingId(booking.id)
    setActionError('')
    setActionMessage('')
    try {
      const response = await fetch(`${API_BASE_URL}/bookings/${booking.id}/validate-completion`, {
        method: 'PATCH',
        credentials: 'include',
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setActionError(data?.detail || 'Failed to validate trip completion.')
        return
      }

      const updated = await response.json()
      setBookings((prev) => prev.map((item) => (item.id === booking.id ? updated : item)))
      setSelectedBooking((current) => (current?.id === booking.id ? updated : current))
      setActionMessage('Trip completion validated.')
      window.dispatchEvent(new Event('notifications:refresh'))
    } catch {
      setActionError('Network error. Please try again.')
    } finally {
      setActionLoadingId('')
    }
  }

  const toggleSort = (key) => {
    setPage(1)
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { key, direction: 'asc' }
    })
  }

  const formatTripType = (value) => {
    if (!value) return '-'
    if (value === 'antar') return 'Drop-off'
    if (value === 'jemput') return 'Pick-up'
    if (value === 'fulltrip') return 'Full Trip'
    return value
  }

  const formatDateTime = (value) => {
    const date = toDate(value)
    if (!date) return '-'
    return `${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`
  }

  const formatDateOnly = (value) => {
    const date = toDate(value)
    if (!date) return '-'
    return date.toLocaleDateString('en-GB')
  }

  return (
    <MainLayout title="Booking Driver History">
      <div className="ticket-history">
       <header className="history-header">
  <button className="back-link" type="button" onClick={() => navigate(-1)}>
    <i className="bi bi-arrow-left" aria-hidden="true" />
    <span>Back</span>
  </button>

  <div className="history-header-main">
    <div className="header-title-group">
      <span className="eyebrow">Booking Driver Status & History</span>
      <h1 className="header-title">List of all Booking Driver Request</h1>
      <p className="muted">Track the status of all your driver booking requests</p>
    </div>

    <div className="header-actions">
      <ViewModeToggle viewMode={viewMode} onChange={setViewMode} />
    </div>
  </div>
</header>


        {loading ? <p className="muted">Loading bookings...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {actionError ? <p className="error-text">{actionError}</p> : null}
        {actionMessage ? <p className="success-text">{actionMessage}</p> : null}
        {cancellationPolicy ? (
          <p className="muted booking-cancellation-policy">
            Pending bookings can be cancelled until {getCancellationPolicyLabel()}.
            {cancellationPolicy.auto_approve === false ? ' Cancellation requires Office Coordinator approval.' : ''}
          </p>
        ) : null}


        {!loading && !error ? (
          <>
            {/* Table View Component */}
            {viewMode === 'table' ? (
             <DataTable
                bookings={pagedBookings}
                currentPage={currentPage}
                pageSize={pageSize}
                sortConfig={sortConfig}
                onSort={toggleSort}
                getBookingStatus={getBookingStatus}
                canCancelBooking={canCancelBooking}
                getCancellationPolicyLabel={getCancellationPolicyLabel}
                formatDateOnly={formatDateOnly}
                formatStatusText={formatStatusText}
                actionLoadingId={actionLoadingId}
                onEdit={handleEdit}
                onCancel={handleCancel}
                onValidate={handleValidateCompletion}
                onDetails={setSelectedBooking}
              />
            ) : null}

            {/* Card View Component (Responsive Card List) */}
            {viewMode === 'card' ? (
              <div className="booking-cards-grid">
                {bookings.length === 0 ? (
                  <p className="muted">No driver bookings yet.</p>
                ) : (
                  pagedBookings.map((booking) => (
                    <DataCard
                      key={booking.id}
                      booking={booking}
                      statusValue={getBookingStatus(booking)}
                      canCancel={canCancelBooking(booking)}
                      cancellationPolicyLabel={getCancellationPolicyLabel()}
                      actionLoadingId={actionLoadingId}
                      formatDateOnly={formatDateOnly}
                      formatDateTime={formatDateTime}
                      formatTripType={formatTripType}
                      formatStatusText={formatStatusText}
                      onEdit={handleEdit}
                      onCancel={handleCancel}
                      onValidate={handleValidateCompletion}
                      onDetails={setSelectedBooking}
                    />
                  ))
                )}
              </div>
            ) : null}

            <div className="office-pagination">
              <button
                type="button"
                className="btn btn-neutral"
                disabled={loading || currentPage <= 1 || bookings.length === 0}
                onClick={() => setPage((prev) => Math.max(1, Math.min(prev, totalPages) - 1))}
              >
                Prev
              </button>
              <span className="office-page-info">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-neutral"
                disabled={loading || currentPage >= totalPages || bookings.length === 0}
                onClick={() => setPage((prev) => Math.min(totalPages, Math.min(prev, totalPages) + 1))}
              >
                Next
              </button>
            </div>

            {selectedBooking ? (
              <div
                className="modal-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="booking-details-title"
                onClick={() => setSelectedBooking(null)}
              >
                <div className="modal ticket-details-modal" onClick={(event) => event.stopPropagation()}>
                  <div className="modal-header">
                    <div>
                      <p className="eyebrow">Booking Driver Details</p>
                      <h2 id="booking-details-title">{selectedBooking.request_id || 'Driver Booking'}</h2>
                    </div>
                    <button
                      type="button"
                      className="modal-close"
                      onClick={() => setSelectedBooking(null)}
                      aria-label="Close details"
                    >
                      &times;
                    </button>
                  </div>

                  <div className="ticket-details-summary">
                    <span>Submitted {formatDateOnly(selectedBooking.created_at)}</span>
                    <span className={`status-badge status-${getBookingStatus(selectedBooking)}`}>
                      {formatStatusText(getBookingStatus(selectedBooking))}
                    </span>
                  </div>

                  <section className="ticket-details-section">
                    <h3>Employee Information</h3>
                    <dl className="ticket-details-grid">
                      <div className="ticket-details-item">
                        <dt>Name</dt>
                        <dd>{selectedBooking.requester_name || '-'}</dd>
                      </div>
                      <div className="ticket-details-item">
                        <dt>National ID</dt>
                        <dd>{selectedBooking.requester_nik || '-'}</dd>
                      </div>
                      <div className="ticket-details-item">
                        <dt>Department / Job Position</dt>
                        <dd>{selectedBooking.requester_dept_job_position || '-'}</dd>
                      </div>
                      <div className="ticket-details-item">
                        <dt>Phone</dt>
                        <dd>{selectedBooking.requester_phone || '-'}</dd>
                      </div>
                      <div className="ticket-details-item ticket-details-item--full">
                        <dt>Email</dt>
                        <dd>{selectedBooking.requester_email || '-'}</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="ticket-details-section">
                    <h3>Schedule & Route</h3>
                    <dl className="ticket-details-grid">
                      <div className="ticket-details-item">
                        <dt>Departure</dt>
                        <dd>{formatDateTime(selectedBooking.departure_time)}</dd>
                      </div>
                      <div className="ticket-details-item">
                        <dt>Estimated Arrival</dt>
                        <dd>{formatDateTime(selectedBooking.estimated_arrival_time)}</dd>
                      </div>
                      <div className="ticket-details-item">
                        <dt>Pickup Location</dt>
                        <dd>{selectedBooking.pickup_location || '-'}</dd>
                      </div>
                      <div className="ticket-details-item">
                        <dt>Destination</dt>
                        <dd>{selectedBooking.destination || '-'}</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="ticket-details-section">
                    <h3>Trip & Driver</h3>
                    <dl className="ticket-details-grid">
                      <div className="ticket-details-item">
                        <dt>Trip Type</dt>
                        <dd>{formatTripType(selectedBooking.trip_type)}</dd>
                      </div>
                      <div className="ticket-details-item">
                        <dt>Total Passenger</dt>
                        <dd>{selectedBooking.passenger_count ?? '-'}</dd>
                      </div>
                      <div className="ticket-details-item ticket-details-item--full">
                        <dt>Driver</dt>
                        <dd>{selectedBooking.driver_name || selectedBooking.driver_id || '-'}</dd>
                      </div>
                    </dl>
                  </section>

                  {selectedBooking.starting_mileage != null ||
                  selectedBooking.ending_mileage != null ||
                  selectedBooking.started_at ||
                  selectedBooking.driver_finished_at ||
                  selectedBooking.validated_at ||
                  selectedBooking.validated_by_name ||
                  selectedBooking.validated_by ||
                  selectedBooking.completed_at ? (
                    <section className="ticket-details-section">
                      <h3>Trip Progress</h3>
                      <dl className="ticket-details-grid">
                        <div className="ticket-details-item">
                          <dt>Started At</dt>
                          <dd>{formatDateTime(selectedBooking.started_at)}</dd>
                        </div>
                        <div className="ticket-details-item">
                          <dt>Driver Finished At</dt>
                          <dd>{formatDateTime(selectedBooking.driver_finished_at || selectedBooking.completed_at)}</dd>
                        </div>
                        <div className="ticket-details-item">
                          <dt>Validated At</dt>
                          <dd>{formatDateTime(selectedBooking.validated_at)}</dd>
                        </div>
                        <div className="ticket-details-item">
                          <dt>Validated By</dt>
                          <dd>{selectedBooking.validated_by_name || selectedBooking.validated_by || '-'}</dd>
                        </div>
                        <div className="ticket-details-item">
                          <dt>Starting Mileage</dt>
                          <dd>{selectedBooking.starting_mileage ?? '-'}</dd>
                        </div>
                        <div className="ticket-details-item">
                          <dt>Ending Mileage</dt>
                          <dd>{selectedBooking.ending_mileage ?? '-'}</dd>
                        </div>
                      </dl>
                    </section>
                  ) : null}

                  <div className="modal-actions">
                    <button type="button" className="btn btn-neutral" onClick={() => setSelectedBooking(null)}>
                      Close
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </MainLayout>
  )
}

export default BookingHistory
