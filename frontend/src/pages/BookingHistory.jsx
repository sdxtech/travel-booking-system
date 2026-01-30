import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MainLayout from '../components/MainLayout'
import { API_BASE_URL } from '../config'

// List the signed-in user's driver bookings and their statuses.
function BookingHistory() {
  const navigate = useNavigate()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState('')
  const [page, setPage] = useState(1)
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' })

  const pageSize = 10

  // Convert Firestore timestamps/ISO strings into a Date instance.
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

  // Provide a stable sort value per table column.
  const getBookingSortValue = (booking, key) => {
    if (!booking) return ''
    switch (key) {
      case 'created_at':
        return toDate(booking.created_at)?.getTime() ?? null
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
      case 'passenger_count':
        {
          const count = Number(booking.passenger_count)
          return Number.isFinite(count) ? count : null
        }
      case 'trip_type':
        return booking.trip_type || ''
      case 'departure_time':
        return toDate(booking.departure_time)?.getTime() ?? null
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
  }, [bookings, sortConfig])

  const totalPages = Math.max(1, Math.ceil(sortedBookings.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedBookings = sortedBookings.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Keep page index within bounds when the list size changes.
  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages))
  }, [totalPages])

  // Load the current user's booking history.
  useEffect(() => {
    // Fetch bookings data from the API.
    const fetchBookings = async () => {
      setLoading(true)
      setError('')

      const token = localStorage.getItem('authToken')
      if (!token) {
        setError('Authentication token not found. Please login again.')
        setLoading(false)
        return
      }

      try {
        const response = await fetch(`${API_BASE_URL}/bookings/my`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!response.ok) {
          let detail = 'Failed to load bookings.'
          try {
            const data = await response.json()
            if (data?.detail) detail = data.detail
          } catch (err) {
            // ignore parse error
          }
          setError(detail)
          setBookings([])
        } else {
          const data = await response.json()
          setBookings(Array.isArray(data) ? data : [])
        }
      } catch (err) {
        setError('Network error. Please try again.')
        setBookings([])
      } finally {
        setLoading(false)
      }
    }

    fetchBookings()
  }, [])

  // Open the booking form with an existing booking for editing.
  const handleEdit = (booking) => {
    navigate('/user/booking-driver', { state: { booking } })
  }

  // Cancel a booking request (when allowed by status).
  const handleCancel = async (bookingId) => {
    const confirmed = window.confirm('Cancel this driver booking request?')
    if (!confirmed) return

    const token = localStorage.getItem('authToken')
    if (!token) {
      setActionError('Authentication token not found. Please login again.')
      return
    }

    setActionLoadingId(bookingId)
    setActionError('')

    try {
      const response = await fetch(`${API_BASE_URL}/bookings/${bookingId}/cancel`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        let detail = 'Failed to cancel booking.'
        try {
          const data = await response.json()
          if (data?.detail) detail = data.detail
        } catch (err) {
          // ignore parse error
        }
        setActionError(detail)
        return
      }

      const updated = await response.json()
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? updated : b)))
      window.dispatchEvent(new Event('notifications:refresh'))
    } catch (err) {
      setActionError('Network error. Please try again.')
    } finally {
      setActionLoadingId('')
    }
  }

  // Toggle sort direction for a column (or activate a new sort key).
  const toggleSort = (key) => {
    setPage(1)
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { key, direction: 'asc' }
    })
  }

  // Render the sort icon for the table header.
  const renderSortIcon = (key) => {
    const isActive = sortConfig.key === key
    if (!isActive) {
      return <i className="bi bi-arrow-down-up sort-indicator sort-indicator-muted" aria-hidden="true" />
    }
    return (
      <i
        className={`bi ${sortConfig.direction === 'asc' ? 'bi-caret-up-fill' : 'bi-caret-down-fill'} sort-indicator`}
        aria-hidden="true"
      />
    )
  }

  // Format the trip type values into labels users understand.
  const formatTripType = (value) => {
    if (!value) return '-'
    if (value === 'antar') return 'Drop-off'
    if (value === 'jemput') return 'Pick-up'
    if (value === 'fulltrip') return 'Full Trip'
    return value
  }

  // Format a date+time field for table display.
  const formatDateTime = (value) => {
    const date = toDate(value)
    if (!date) return '-'
    return `${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`
  }

  // Format a date-only field for table display.
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
            &larr; Back
          </button>
          <div>
            <p className="eyebrow">Booking Driver Status & History</p>
            <h1>List of all Booking Driver Request</h1>
            <p className="muted">Track the status of all your driver booking requests</p>
          </div>
        </header>

        {loading ? <p className="muted">Loading bookings...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {actionError ? <p className="error-text">{actionError}</p> : null}

        {!loading && !error ? (
          <>
            <div className="table-wrapper">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th className="table-col-no">No</th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('created_at')}>
                        Submission Date {renderSortIcon('created_at')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('requester_name')}>
                        Name {renderSortIcon('requester_name')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('requester_nik')}>
                        National ID {renderSortIcon('requester_nik')}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="table-sort"
                        onClick={() => toggleSort('requester_dept_job_position')}
                      >
                        Dept/Job Position {renderSortIcon('requester_dept_job_position')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('requester_phone')}>
                        Phone {renderSortIcon('requester_phone')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('requester_email')}>
                        Email {renderSortIcon('requester_email')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('pickup_location')}>
                        Pickup Location {renderSortIcon('pickup_location')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('destination')}>
                        Destination {renderSortIcon('destination')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('passenger_count')}>
                        Total Passenger {renderSortIcon('passenger_count')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('trip_type')}>
                        Trip Type {renderSortIcon('trip_type')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('departure_time')}>
                        Departure {renderSortIcon('departure_time')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="table-sort" onClick={() => toggleSort('status')}>
                        Status {renderSortIcon('status')}
                      </button>
                    </th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.length === 0 ? (
                    <tr>
                      <td colSpan="14" className="muted">
                        No driver bookings yet.
                      </td>
                    </tr>
                  ) : (
                    pagedBookings.map((booking, index) => {
                      const statusValue = getBookingStatus(booking)
                      const isPending = statusValue === 'pending'

                      return (
                        <tr key={booking.id}>
                          <td className="table-col-no">{(currentPage - 1) * pageSize + index + 1}</td>
                          <td>{formatDateOnly(booking.created_at)}</td>
                          <td className="cell-wrap">{booking.requester_name || '-'}</td>
                          <td>{booking.requester_nik || '-'}</td>
                          <td className="cell-wrap">{booking.requester_dept_job_position || '-'}</td>
                          <td>{booking.requester_phone || '-'}</td>
                          <td className="cell-wrap">{booking.requester_email || '-'}</td>
                          <td className="cell-wrap">{booking.pickup_location || '-'}</td>
                          <td className="cell-wrap">{booking.destination || '-'}</td>
                          <td>{booking.passenger_count ?? '-'}</td>
                          <td>{formatTripType(booking.trip_type)}</td>
                          <td>{formatDateTime(booking.departure_time)}</td>
                          <td>
                            <span className={`status-badge status-${statusValue}`}>{formatStatusText(statusValue)}</span>
                          </td>
                          <td>
                            {isPending ? (
                              <div className="table-row-actions">
                                <button
                                  type="button"
                                  className="btn btn-outline-brand"
                                  onClick={() => handleEdit(booking)}
                                  disabled={actionLoadingId === booking.id}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  onClick={() => handleCancel(booking.id)}
                                  disabled={actionLoadingId === booking.id}
                                >
                                  {actionLoadingId === booking.id ? 'Cancelling...' : 'Cancel'}
                                </button>
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

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
          </>
        ) : null}
      </div>
    </MainLayout>
  )
}

export default BookingHistory
