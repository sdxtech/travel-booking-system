import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MainLayout from '../components/MainLayout'
import useOfficeSidebar from '../hooks/useOfficeSidebar'
import { API_BASE_URL } from '../config'

const menuItems = [
  { label: 'Dashboard', icon: 'bi-speedometer2' },
  { label: 'Travel Requests', icon: 'bi-ticket-perforated' },
  { label: 'Travel Status & History', icon: 'bi-clock-history' },
  { label: 'Travel Assign', icon: 'bi-building' },
  { label: 'Booking Driver Requests', icon: 'bi-car-front' },
  { label: 'Booking Driver Status & History', icon: 'bi-card-list' },
  { label: 'Booking Driver Assign', icon: 'bi-person-check' },
  { label: 'Manage User', icon: 'bi-people' },
]

// Driver booking history page for office coordinators (with export + date range).
function OfficeDriverHistory() {
  const navigate = useNavigate()
  const { collapsed: isSidebarCollapsed, toggle: toggleSidebar } = useOfficeSidebar()
  const isSuperadmin = localStorage.getItem('authRole') === 'superadmin'
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [page, setPage] = useState(1)
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' })
  const [hasLoaded, setHasLoaded] = useState(false)
  const [rangeModalOpen, setRangeModalOpen] = useState(true)
  const [rangeMode, setRangeMode] = useState('all')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [rangeError, setRangeError] = useState('')
  const [activeRange, setActiveRange] = useState({ mode: 'all', start: '', end: '' })

  const pageSize = 10

  // Convert API timestamps into a Date instance.
  const toDate = (value) => {
    if (!value) return null
    if (value?.seconds) return new Date(value.seconds * 1000)
    const dt = new Date(value)
    return Number.isNaN(dt.getTime()) ? null : dt
  }

  // Compute total kilometers based on starting/ending mileage.
  const getDistanceNumber = (booking) => {
    const starting = Number(booking?.starting_mileage)
    const ending = Number(booking?.ending_mileage)
    if (!Number.isFinite(starting) || !Number.isFinite(ending)) return null
    if (ending < starting) return null
    return ending - starting
  }

  // Provide a stable sort value per table column.
  const getBookingSortValue = (booking, key) => {
    if (!booking) return ''
    switch (key) {
      case 'requester_name':
        return booking.requester_name || ''
      case 'requester_dept_job_position':
        return booking.requester_dept_job_position || ''
      case 'requester_phone':
        return booking.requester_phone || ''
      case 'requester_email':
        return booking.requester_email || ''
      case 'requester_nik':
        return booking.requester_nik || ''
      case 'pickup_location':
        return booking.pickup_location || ''
      case 'destination':
        return booking.destination || ''
      case 'passenger_count':
        {
          const count = Number(booking.passenger_count)
          return Number.isFinite(count) ? count : null
        }
      case 'day':
        return toDate(booking.departure_time)?.getTime() ?? null
      case 'departure_time':
        return toDate(booking.departure_time)?.getTime() ?? null
      case 'starting_time':
        return toDate(booking.started_at)?.getTime() ?? null
      case 'ending_time':
        return toDate(booking.completed_at)?.getTime() ?? null
      case 'total_duration':
        return getDurationMinutes(booking) ?? null
      case 'ot_hour':
        {
          const minutes = getOvertimeMinutes(booking)
          return minutes === null ? null : Math.floor(minutes / 60)
        }
      case 'ot_minutes':
        {
          const minutes = getOvertimeMinutes(booking)
          return minutes === null ? null : minutes % 60
        }
      case 'trip_type':
        return booking.trip_type || ''
      case 'driver':
        return booking.driver_name || booking.driver_id || ''
      case 'starting_mileage':
        {
          const starting = Number(booking.starting_mileage)
          return Number.isFinite(starting) ? starting : null
        }
      case 'ending_mileage':
        {
          const ending = Number(booking.ending_mileage)
          return Number.isFinite(ending) ? ending : null
        }
      case 'total_distance':
        return getDistanceNumber(booking) ?? null
      case 'status':
        return String(booking.status || '').toLowerCase()
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

  // Build the label shown beside the active date range selector.
  const getActiveRangeLabel = () => {
    if (!hasLoaded) return 'Not loaded'
    if (activeRange.mode === 'all') return 'All time'
    if (activeRange.start && activeRange.end) return `${activeRange.start} to ${activeRange.end}`
    return 'Custom range'
  }

  // Open the date range modal and prefill with current range.
  const openRangeModal = () => {
    setRangeError('')
    setRangeMode(activeRange.mode || 'all')
    setRangeStart(activeRange.start || '')
    setRangeEnd(activeRange.end || '')
    setRangeModalOpen(true)
  }

  // Close the range modal unless a fetch is in progress.
  const closeRangeModal = () => {
    if (loading) return
    setRangeError('')
    setRangeModalOpen(false)
  }

  // Convert the date-only range into concrete Date objects for filtering.
  const getRangeBounds = (range) => {
    if (!range || range.mode !== 'range') return { start: null, end: null }
    const start = new Date(`${range.start}T00:00:00`)
    const end = new Date(`${range.end}T23:59:59.999`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { start: null, end: null }
    }
    return { start, end }
  }

  // Load driver booking history and apply optional date filtering client-side.
  const loadBookings = async (range) => {
    const token = localStorage.getItem('authToken')
    if (!token) {
      setError('Authentication token not found.')
      setBookings([])
      setHasLoaded(true)
      return
    }

    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/bookings/history`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        let detail = 'Failed to load driver history.'
        try {
          const data = await res.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setError(detail)
        setBookings([])
        return
      }

      const data = await res.json()
      const rawBookings = Array.isArray(data) ? data : []

      if (range?.mode === 'range') {
        const { start, end } = getRangeBounds(range)
        if (start && end) {
          const filtered = rawBookings.filter((booking) => {
            const departureTime = toDate(booking?.departure_time)
            if (!departureTime) return false
            return departureTime >= start && departureTime <= end
          })
          setBookings(filtered)
        } else {
          setBookings([])
        }
      } else {
        setBookings(rawBookings)
      }
    } catch (err) {
      setError('Network error. Please try again.')
      setBookings([])
    } finally {
      setLoading(false)
      setHasLoaded(true)
    }
  }

  // Validate and apply the current range selection, then reload data.
  const applyRange = async () => {
    setRangeError('')

    const nextRange = { mode: rangeMode, start: rangeStart, end: rangeEnd }

    if (rangeMode === 'range') {
      if (!rangeStart || !rangeEnd) {
        setRangeError('Start date and end date are required.')
        return
      }

      const { start, end } = getRangeBounds(nextRange)
      if (!start || !end) {
        setRangeError('Invalid date range.')
        return
      }

      if (start > end) {
        setRangeError('Start date must be before or equal to end date.')
        return
      }
    }

    setActiveRange(nextRange)
    setPage(1)
    setRangeModalOpen(false)
    await loadBookings(nextRange)
  }

  // Handle sidebar navigation clicks.
  const handleNavigate = (item) => {
    const dashboardRoute = isSuperadmin ? '/admin/home' : '/office/home'
    const manageUserRoute = isSuperadmin ? '/admin/manage-user' : '/office/manage-user'

    if (item === 'Dashboard') navigate(dashboardRoute)
    if (item === 'Travel Requests') navigate('/office/ticket-requests')
    if (item === 'Travel Status & History') navigate('/office/ticket-history')
    if (item === 'Booking Driver Status & History') navigate('/office/driver-history')
    if (item === 'Travel Assign') navigate('/office/travel-accommodation')
    if (item === 'Booking Driver Requests') navigate('/office/driver-requests')
    if (item === 'Booking Driver Assign') navigate('/office/assign-drivers')
    if (item === 'Manage User') navigate(manageUserRoute)
  }

  // Format a date-only value for table display.
  const formatDate = (value) => {
    const dt = toDate(value)
    return dt ? dt.toLocaleDateString('en-GB') : '-'
  }

  // Format weekday name for exports/table.
  const formatDay = (value) => {
    const dt = toDate(value)
    return dt ? dt.toLocaleDateString('en-US', { weekday: 'short' }) : '-'
  }

  // Format time values for table display.
  const formatTime = (value) => {
    const dt = toDate(value)
    return dt
      ? dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
      : '-'
  }

  // Convert trip type values into user-facing labels.
  const formatTripType = (value) => {
    if (!value) return '-'
    if (value === 'antar') return 'Drop-off'
    if (value === 'jemput') return 'Pick-up'
    if (value === 'fulltrip') return 'Full Trip'
    return value
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

  // Determine whether the booking can still be cancelled by the office.
  const canCancelBooking = (booking) => {
    const status = getBookingStatus(booking)
    const hasStarted = booking?.starting_mileage !== null && booking?.starting_mileage !== undefined
    return status === 'approved' && !hasStarted && !booking?.started_at
  }

  // Cancel an approved booking before it has started.
  const handleCancelBooking = async (booking) => {
    const confirmed = window.confirm('Cancel this approved booking?')
    if (!confirmed) return

    const token = localStorage.getItem('authToken')
    if (!token) {
      setActionError('Authentication token not found.')
      return
    }

    setActionLoadingId(booking.id)
    setActionError('')
    setActionMessage('')

    try {
      const res = await fetch(`${API_BASE_URL}/bookings/${booking.id}/cancel`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        let detail = 'Failed to cancel booking.'
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
      setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, ...updated } : b)))
      setActionMessage('Booking cancelled.')
    } catch (err) {
      setActionError('Network error. Please try again.')
    } finally {
      setActionLoadingId('')
    }
  }

  // Compute trip duration in minutes based on started/completed timestamps.
  function getDurationMinutes(booking) {
    const startedAt = toDate(booking?.started_at)
    const completedAt = toDate(booking?.completed_at)
    if (!startedAt || !completedAt) return null
    const diffMs = completedAt.getTime() - startedAt.getTime()
    if (diffMs < 0) return null
    return Math.floor(diffMs / 60000)
  }

  // Format duration into "Xh YYm".
  const formatDuration = (booking) => {
    const minutes = getDurationMinutes(booking)
    if (minutes === null) return '-'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${String(mins).padStart(2, '0')}m`
  }

  // Compute overtime minutes beyond an 8-hour baseline.
  function getOvertimeMinutes(booking) {
    const minutes = getDurationMinutes(booking)
    if (minutes === null) return null
    const overtime = minutes - 8 * 60
    return overtime > 0 ? overtime : 0
  }

  // Format overtime hours for exports/table.
  const formatOvertimeHours = (booking) => {
    const overtimeMinutes = getOvertimeMinutes(booking)
    if (overtimeMinutes === null) return '-'
    return String(Math.floor(overtimeMinutes / 60))
  }

  // Format overtime minutes for exports/table.
  const formatOvertimeMinutes = (booking) => {
    const overtimeMinutes = getOvertimeMinutes(booking)
    if (overtimeMinutes === null) return '-'
    return String(overtimeMinutes % 60)
  }

  // Format distance in kilometers for table display.
  const formatDistance = (booking) => {
    const distance = getDistanceNumber(booking)
    return distance === null ? '-' : String(distance)
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

  // Escape values for the HTML-based Excel export.
  const escapeHtml = (value) => {
    if (value === null || value === undefined) return ''
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  // Export the current filtered/sorted view as an Excel-readable HTML table.
  const handleExport = () => {
    if (!sortedBookings.length) return

    const rangeLabel =
      activeRange.mode === 'range' && activeRange.start && activeRange.end
        ? `${activeRange.start}_to_${activeRange.end}`
        : 'all-time'

    const headers = [
      'No',
      'Name',
      'User Dept/Job Position',
      'Phone',
      'Email',
      'National ID',
      'Pickup Location',
      'Destination',
      'Total Passenger',
      'Day',
      'Departure Date',
      'Starting Time',
      'Ending Time',
      'Total Duration',
      'OT hour',
      'OT minutes',
      'Type of Trip',
      'Driver',
      'Starting Kilometer',
      'Ending Kilometer',
      'Total Distance',
      'Status',
    ]

    const rows = sortedBookings.map((booking, index) => [
      index + 1,
      booking.requester_name || '',
      booking.requester_dept_job_position || '',
      booking.requester_phone || '',
      booking.requester_email || '',
      booking.requester_nik || '',
      booking.pickup_location || '',
      booking.destination || '',
      booking.passenger_count ?? '',
      formatDay(booking.departure_time),
      formatDate(booking.departure_time),
      formatTime(booking.started_at),
      formatTime(booking.completed_at),
      formatDuration(booking),
      formatOvertimeHours(booking),
      formatOvertimeMinutes(booking),
      formatTripType(booking.trip_type),
      booking.driver_name || booking.driver_id || '',
      booking.starting_mileage ?? '',
      booking.ending_mileage ?? '',
      formatDistance(booking),
      formatStatusText(getBookingStatus(booking)),
    ])

    const headerHtml = `<tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>`
    const bodyHtml = rows
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
      .join('')

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
  </head>
  <body>
    <table border="1">
      <thead>${headerHtml}</thead>
      <tbody>${bodyHtml}</tbody>
    </table>
  </body>
</html>`

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `driver_history_${rangeLabel}_${new Date().toISOString().slice(0, 10)}.xls`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <MainLayout title="Driver History">
      <div className={`office-dashboard fixed-sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
        <aside className="office-sidebar visible">
          <div className="sidebar-header">
            <span className="sidebar-role">{isSuperadmin ? 'Super Admin' : 'Office Coordinator'}</span>
            <button
              type="button"
              className="sidebar-toggle"
              onClick={toggleSidebar}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <i className={`bi ${isSidebarCollapsed ? 'bi-chevron-right' : 'bi-chevron-left'}`} aria-hidden="true" />
            </button>
          </div>
          <nav className="sidebar-menu">
            {menuItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`sidebar-item ${item.label === 'Booking Driver Status & History' ? 'active' : ''}`}
                onClick={() => handleNavigate(item.label)}
                aria-label={item.label}
                title={item.label}
              >
                <i className={`bi ${item.icon} sidebar-item__icon`} aria-hidden="true" />
                <span className="sidebar-item__label">{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="office-content">
          <header className="office-header">
            <p className="eyebrow">Driver History</p>
            <h1>Driver History</h1>
            <p className="muted">All processed driver requests (non-pending)</p>
          </header>

          <div className="form-actions">
            <button type="button" className="btn btn-neutral" onClick={openRangeModal} disabled={loading}>
              <i className="bi bi-calendar3" aria-hidden="true" />
              {hasLoaded ? 'Change Date Range' : 'Date Range'}
            </button>
            <button
              type="button"
              className="btn btn-outline-brand"
              onClick={handleExport}
              disabled={!hasLoaded || loading || !bookings.length}
              title={bookings.length ? 'Export to Excel (.xls)' : 'No data to export'}
            >
              <i className="bi bi-file-earmark-excel" />
              Export Excel
            </button>
          </div>

          {hasLoaded ? <p className="muted">Date Range: {getActiveRangeLabel()}</p> : <p className="muted">Date Range: Not loaded</p>}
          {!loading && actionMessage ? <p className="success-text">{actionMessage}</p> : null}
          {!loading && actionError ? <p className="error-text">{actionError}</p> : null}

          <div className="office-table-wrapper">
            <table className="office-table">
              <thead>
                <tr>
                  <th className="table-col-no">No</th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('requester_name')}>
                      Name {renderSortIcon('requester_name')}
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className="table-sort"
                      onClick={() => toggleSort('requester_dept_job_position')}
                    >
                      User Dept/Job Position {renderSortIcon('requester_dept_job_position')}
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
                    <button type="button" className="table-sort" onClick={() => toggleSort('requester_nik')}>
                      National ID {renderSortIcon('requester_nik')}
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
                    <button type="button" className="table-sort" onClick={() => toggleSort('day')}>
                      Day {renderSortIcon('day')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('departure_time')}>
                      Departure Date {renderSortIcon('departure_time')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('starting_time')}>
                      Starting Time {renderSortIcon('starting_time')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('ending_time')}>
                      Ending Time {renderSortIcon('ending_time')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('total_duration')}>
                      Total Duration {renderSortIcon('total_duration')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('ot_hour')}>
                      OT hour {renderSortIcon('ot_hour')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('ot_minutes')}>
                      OT minutes {renderSortIcon('ot_minutes')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('trip_type')}>
                      Type of Trip {renderSortIcon('trip_type')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('driver')}>
                      Driver {renderSortIcon('driver')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('starting_mileage')}>
                      Starting Kilometer {renderSortIcon('starting_mileage')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('ending_mileage')}>
                      Ending Kilometer {renderSortIcon('ending_mileage')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="table-sort" onClick={() => toggleSort('total_distance')}>
                      Total Distance {renderSortIcon('total_distance')}
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
                {loading ? (
                  <tr>
                    <td colSpan="23" className="muted">
                      Loading...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan="23" className="error-text">
                      {error}
                    </td>
                  </tr>
                ) : !hasLoaded ? (
                  <tr>
                    <td colSpan="23" className="muted">
                      Select a date range to load driver history.
                    </td>
                  </tr>
                ) : bookings.length === 0 ? (
                  <tr>
                    <td colSpan="23" className="muted">
                      No driver history found.
                    </td>
                  </tr>
                ) : (
                  pagedBookings.map((booking, index) => (
                    <tr key={booking.id}>
                      <td className="table-col-no">{(currentPage - 1) * pageSize + index + 1}</td>
                      <td>{booking.requester_name || '-'}</td>
                      <td>{booking.requester_dept_job_position || '-'}</td>
                      <td>{booking.requester_phone || '-'}</td>
                      <td>{booking.requester_email || '-'}</td>
                      <td>{booking.requester_nik || '-'}</td>
                      <td>{booking.pickup_location || '-'}</td>
                      <td>{booking.destination || '-'}</td>
                      <td>{booking.passenger_count ?? '-'}</td>
                      <td>{formatDay(booking.departure_time)}</td>
                      <td>{formatDate(booking.departure_time)}</td>
                      <td>{formatTime(booking.started_at)}</td>
                      <td>{formatTime(booking.completed_at)}</td>
                      <td>{formatDuration(booking)}</td>
                      <td>{formatOvertimeHours(booking)}</td>
                      <td>{formatOvertimeMinutes(booking)}</td>
                      <td>{formatTripType(booking.trip_type)}</td>
                      <td>{booking.driver_name || booking.driver_id || '-'}</td>
                      <td>{booking.starting_mileage ?? '-'}</td>
                      <td>{booking.ending_mileage ?? '-'}</td>
                      <td>{formatDistance(booking)}</td>
                      <td>
                        {booking.status ? (
                          <span className={`status-badge status-${getBookingStatus(booking)}`}>
                            {formatStatusText(getBookingStatus(booking))}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        {canCancelBooking(booking) ? (
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => handleCancelBooking(booking)}
                            disabled={actionLoadingId === booking.id || loading}
                          >
                            {actionLoadingId === booking.id ? 'Cancelling...' : 'Cancel'}
                          </button>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="office-pagination">
            <button
              type="button"
              className="btn btn-neutral"
              disabled={loading || !hasLoaded || currentPage <= 1 || bookings.length === 0}
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
              disabled={loading || !hasLoaded || currentPage >= totalPages || bookings.length === 0}
              onClick={() => setPage((prev) => Math.min(totalPages, Math.min(prev, totalPages) + 1))}
            >
              Next
            </button>
          </div>

          {rangeModalOpen ? (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="driver-range-title"
              onClick={() => {
                if (!loading) closeRangeModal()
              }}
            >
              <div
                className="modal"
                onClick={(event) => {
                  event.stopPropagation()
                }}
              >
                <div className="modal-header">
                  <h2 id="driver-range-title">Load Driver History</h2>
                  <button
                    type="button"
                    className="modal-close"
                    onClick={closeRangeModal}
                    disabled={loading}
                    aria-label="Close"
                  >
                    &times;
                  </button>
                </div>

                <p className="muted" style={{ marginTop: 0 }}>
                  Choose a departure date range to load and export driver history.
                </p>

                {rangeError ? <p className="error-text">{rangeError}</p> : null}

                <div className="radio-row">
                  <span>Date range</span>
                  <div className="radio-options">
                    <label>
                      <input
                        type="radio"
                        name="driver-range-mode"
                        value="all"
                        checked={rangeMode === 'all'}
                        onChange={() => setRangeMode('all')}
                        disabled={loading}
                      />
                      All time
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="driver-range-mode"
                        value="range"
                        checked={rangeMode === 'range'}
                        onChange={() => setRangeMode('range')}
                        disabled={loading}
                      />
                      Custom range
                    </label>
                  </div>
                </div>

                {rangeMode === 'range' ? (
                  <div className="field-grid">
                    <label className="inline-label">
                      <span>Start date</span>
                      <input
                        type="date"
                        value={rangeStart}
                        onChange={(event) => setRangeStart(event.target.value)}
                        disabled={loading}
                        required
                      />
                    </label>
                    <label className="inline-label">
                      <span>End date</span>
                      <input
                        type="date"
                        value={rangeEnd}
                        onChange={(event) => setRangeEnd(event.target.value)}
                        disabled={loading}
                        required
                      />
                    </label>
                  </div>
                ) : null}

                <div className="modal-actions">
                  <button type="button" className="btn btn-primary" onClick={applyRange} disabled={loading}>
                    {loading ? 'Loading...' : 'Load Data'}
                  </button>
                  <button type="button" className="btn btn-outline-danger" onClick={closeRangeModal} disabled={loading}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </MainLayout>
  )
}

export default OfficeDriverHistory
