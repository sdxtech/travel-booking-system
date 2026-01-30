import { useEffect, useMemo, useRef, useState } from 'react'
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

// Pending driver bookings for office coordinators (approve/reject/assign).
function OfficeDriverRequests() {
  const navigate = useNavigate()
  const { collapsed: isSidebarCollapsed, toggle: toggleSidebar } = useOfficeSidebar()
  const isSuperadmin = localStorage.getItem('authRole') === 'superadmin'
  const [profile, setProfile] = useState({ name: '' })
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [processing, setProcessing] = useState({})
  const [page, setPage] = useState(1)
  const [drivers, setDrivers] = useState([])
  const [driversLoading, setDriversLoading] = useState(false)
  const [driversError, setDriversError] = useState('')
  const [unavailableDriverIds, setUnavailableDriverIds] = useState([])
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignTarget, setAssignTarget] = useState(null)
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const availabilityRequestIdRef = useRef(0)

  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(bookings.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedBookings = bookings.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Keep page index within bounds when the list size changes.
  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages))
  }, [totalPages])

  // Load profile for the greeting header.
  useEffect(() => {
    const token = localStorage.getItem('authToken')
    if (!token) return
    // Fetch current user details from the API.
    const loadProfile = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setProfile({ name: data.name || data.email || 'User' })
        }
      } catch (err) {
        console.error('Failed to load profile', err)
      }
    }
    loadProfile()
  }, [])

  // Load selectable drivers for assignment.
  useEffect(() => {
    const token = localStorage.getItem('authToken')
    if (!token) return

    // Fetch drivers from the user list endpoint.
    const loadDrivers = async () => {
      setDriversLoading(true)
      setDriversError('')

      try {
        const res = await fetch(`${API_BASE_URL}/users`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          let detail = 'Failed to load drivers.'
          try {
            const data = await res.json()
            if (data?.detail) detail = data.detail
          } catch {
            // ignore parse error
          }
          setDriversError(detail)
          setDrivers([])
          return
        }

        const data = await res.json()
        const allUsers = Array.isArray(data) ? data : []
        setDrivers(allUsers.filter((user) => user.role === 'driver'))
      } catch (err) {
        setDriversError('Network error. Please try again.')
        setDrivers([])
      } finally {
        setDriversLoading(false)
      }
    }

    loadDrivers()
  }, [])

  // Load all pending driver bookings.
  useEffect(() => {
    const token = localStorage.getItem('authToken')
    if (!token) {
      setLoading(false)
      setError('Authentication token not found.')
      return
    }

    // Fetch pending bookings from the API.
    const loadBookings = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`${API_BASE_URL}/bookings/pending`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          let detail = 'Failed to load bookings.'
          try {
            const data = await res.json()
            if (data?.detail) detail = data.detail
          } catch (err) {
            // ignore parse error
          }
          setError(detail)
          setBookings([])
        } else {
          const data = await res.json()
          setBookings(Array.isArray(data) ? data : [])
        }
      } catch (err) {
        setError('Network error. Please try again.')
        setBookings([])
      } finally {
        setLoading(false)
      }
    }

    loadBookings()
  }, [])

  // Fetch driver ids that are unavailable for the booking departure time.
  const loadUnavailableDrivers = async (booking) => {
    availabilityRequestIdRef.current += 1
    const requestId = availabilityRequestIdRef.current

    if (!booking?.departure_time) {
      setUnavailableDriverIds([])
      setAvailabilityError('')
      setAvailabilityLoading(false)
      return
    }

    const token = localStorage.getItem('authToken')
    if (!token) {
      setUnavailableDriverIds([])
      setAvailabilityError('Authentication token not found.')
      setAvailabilityLoading(false)
      return
    }

    setAvailabilityLoading(true)
    setAvailabilityError('')
    setUnavailableDriverIds([])

    try {
      const url = new URL(`${API_BASE_URL}/bookings/unavailable-drivers`)
      url.searchParams.set('departure_time', booking.departure_time)

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        let detail = 'Failed to check driver availability.'
        try {
          const data = await res.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }

        if (requestId === availabilityRequestIdRef.current) {
          setUnavailableDriverIds([])
          setAvailabilityError(detail)
        }
        return
      }

      const data = await res.json()
      const ids = Array.isArray(data) ? data : []
      const normalized = ids.filter((id) => typeof id === 'string' && id.trim().length)

      if (requestId === availabilityRequestIdRef.current) {
        setUnavailableDriverIds(normalized)
        setAvailabilityError('')
      }
    } catch (err) {
      if (requestId === availabilityRequestIdRef.current) {
        setUnavailableDriverIds([])
        setAvailabilityError('Network error. Please try again.')
      }
    } finally {
      if (requestId === availabilityRequestIdRef.current) {
        setAvailabilityLoading(false)
      }
    }
  }

  // Filter driver list to those not marked as unavailable.
  const availableDrivers = useMemo(() => {
    if (!drivers.length) return []
    if (!unavailableDriverIds.length) return drivers
    const unavailable = new Set(unavailableDriverIds)
    return drivers.filter((driver) => !unavailable.has(driver.uid))
  }, [drivers, unavailableDriverIds])

  // Clear selection if it becomes unavailable after a refresh.
  useEffect(() => {
    if (!selectedDriverId) return
    if (unavailableDriverIds.includes(selectedDriverId)) {
      setSelectedDriverId('')
    }
  }, [selectedDriverId, unavailableDriverIds])

  // Open the assign modal and run availability check for the selected booking.
  const openAssignModal = (booking) => {
    setAssignTarget(booking)
    setSelectedDriverId('')
    setUnavailableDriverIds([])
    setAvailabilityError('')
    setAssignModalOpen(true)
    setActionMessage('')
    setActionError('')
    loadUnavailableDrivers(booking)
  }

  // Close and reset the assign modal state.
  const closeAssignModal = () => {
    availabilityRequestIdRef.current += 1
    setAssignModalOpen(false)
    setAssignTarget(null)
    setSelectedDriverId('')
    setUnavailableDriverIds([])
    setAvailabilityError('')
    setAvailabilityLoading(false)
  }

  // Approve the booking and attach the selected driver.
  const handleAssign = async () => {
    if (!assignTarget?.id) return
    if (!selectedDriverId) {
      setActionError('Please select a driver.')
      return
    }

    const token = localStorage.getItem('authToken')
    if (!token) {
      setActionError('Authentication token not found.')
      return
    }

    setProcessing((prev) => ({ ...prev, [assignTarget.id]: true }))
    setActionMessage('')
    setActionError('')

    try {
      const res = await fetch(`${API_BASE_URL}/bookings/${assignTarget.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'approved', driver_id: selectedDriverId }),
      })

      if (!res.ok) {
        let detail = 'Failed to assign driver.'
        try {
          const data = await res.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setActionError(detail)
        loadUnavailableDrivers(assignTarget)
        return
      }

      setBookings((prev) => prev.filter((booking) => booking.id !== assignTarget.id))
      setActionMessage('Driver assigned. Moved to driver history and will appear in driver tasks.')
      closeAssignModal()
    } catch (err) {
      setActionError('Network error. Please try again.')
    } finally {
      setProcessing((prev) => {
        const next = { ...prev }
        delete next[assignTarget.id]
        return next
      })
    }
  }

  // Reject a booking request.
  const handleReject = async (bookingId) => {
    const token = localStorage.getItem('authToken')
    if (!token) {
      setActionError('Authentication token not found.')
      return
    }

    setProcessing((prev) => ({ ...prev, [bookingId]: true }))
    setActionMessage('')
    setActionError('')

    try {
      const res = await fetch(`${API_BASE_URL}/bookings/${bookingId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'rejected' }),
      })

      if (!res.ok) {
        let detail = 'Failed to reject booking.'
        try {
          const data = await res.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setActionError(detail)
        return
      }

      setBookings((prev) => prev.filter((booking) => booking.id !== bookingId))
      setActionMessage('Booking rejected. Moved to driver history.')
    } catch (err) {
      setActionError('Network error. Please try again.')
    } finally {
      setProcessing((prev) => {
        const next = { ...prev }
        delete next[bookingId]
        return next
      })
    }
  }

  // Format a date-only display value.
  const formatDate = (value) => {
    if (!value) return '-'
    const dt = new Date(value)
    return Number.isNaN(dt.getTime()) ? '-' : dt.toLocaleDateString('en-GB')
  }

  // Format a time-only display value.
  const formatTime = (value) => {
    if (!value) return '-'
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return '-'
    return dt.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  // Format trip type values into user-facing labels.
  const formatTripType = (value) => {
    if (!value) return '-'
    if (value === 'antar') return 'Drop-off'
    if (value === 'jemput') return 'Pick-up'
    if (value === 'fulltrip') return 'Full Trip'
    return value
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

  return (
    <MainLayout title="Driver Requests">
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
                className={`sidebar-item ${item.label === 'Booking Driver Requests' ? 'active' : ''}`}
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
            <p className="eyebrow">Driver Requests</p>
            <h1>List of all driver bookings</h1>
            <p className="muted">Manage assignments and driver procurement</p>
          </header>

          {actionMessage ? <p className="success-text">{actionMessage}</p> : null}
          {actionError ? <p className="error-text">{actionError}</p> : null}

          <div className="office-table-wrapper">
            <table className="office-table">
              <thead>
                <tr>
                  <th className="table-col-no">No</th>
                  <th>Name</th>
                  <th>User Dept/Job Position</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>National ID</th>
                  <th>Pickup Location</th>
                  <th>Destination</th>
                  <th>Total Passenger</th>
                  <th>Departure Date</th>
                  <th>Departure Time</th>
                  <th>Type of Trip</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="14" className="muted">
                      Loading...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan="14" className="error-text">
                      {error}
                    </td>
                  </tr>
                ) : bookings.length === 0 ? (
                  <tr>
                    <td colSpan="14" className="muted">
                      No driver requests found.
                    </td>
                  </tr>
                ) : (
                  pagedBookings.map((booking, index) => {
                    const statusValue = String(booking.status || 'pending').toLowerCase()

                    return (
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
                        <td>{formatDate(booking.departure_time)}</td>
                        <td>{formatTime(booking.departure_time)}</td>
                        <td>{formatTripType(booking.trip_type)}</td>
                        <td>
                          <span className={`status-badge status-${statusValue}`}>{booking.status || 'pending'}</span>
                        </td>
                        <td>
                          <div className="office-row-actions">
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={processing[booking.id]}
                              onClick={() => openAssignModal(booking)}
                            >
                              Assign Driver
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger"
                              disabled={processing[booking.id]}
                              onClick={() => handleReject(booking.id)}
                            >
                              Reject
                            </button>
                          </div>
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

          {assignModalOpen ? (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              onClick={() => {
                if (!processing[assignTarget?.id]) closeAssignModal()
              }}
            >
              <div
                className="modal"
                onClick={(event) => {
                  event.stopPropagation()
                }}
              >
                <div className="modal-header">
                  <h2>Assign Driver</h2>
                  <button
                    type="button"
                    className="modal-close"
                    onClick={closeAssignModal}
                    disabled={processing[assignTarget?.id]}
                    aria-label="Close"
                  >
                    &times;
                  </button>
                </div>

                <p className="muted" style={{ marginTop: 0 }}>
                  Select a driver for this request. After assigning, the request will move to driver history.
                </p>

                {driversError ? <p className="error-text">{driversError}</p> : null}
                {availabilityError ? <p className="error-text">{availabilityError}</p> : null}
                {actionError ? <p className="error-text">{actionError}</p> : null}

                <label className="inline-label">
                  <span>Driver</span>
                  <select
                    value={selectedDriverId}
                    onChange={(e) => setSelectedDriverId(e.target.value)}
                    disabled={driversLoading || availabilityLoading || processing[assignTarget?.id]}
                    required
                  >
                    <option value="" disabled>
                      {driversLoading
                        ? 'Loading drivers...'
                        : availabilityLoading
                          ? 'Checking availability...'
                          : availableDrivers.length
                            ? 'Select driver...'
                            : 'No drivers available'}
                    </option>
                    {availableDrivers.map((driver) => (
                      <option key={driver.uid} value={driver.uid}>
                        {driver.name ? `${driver.name} (${driver.email})` : driver.email}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleAssign}
                    disabled={driversLoading || availabilityLoading || !availableDrivers.length || processing[assignTarget?.id]}
                  >
                    Assign
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-danger"
                    onClick={closeAssignModal}
                    disabled={processing[assignTarget?.id]}
                  >
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

export default OfficeDriverRequests
