import { useEffect, useState } from 'react'
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

const initialForm = {
  requester_name: '',
  requester_dept_job_position: '',
  requester_nik: '',
  requester_phone: '',
  requester_email: '',
  driver_email: '',
  pickup_location: '',
  destination: '',
  trip_type: '',
  departure_date: '',
  departure_time: '',
  passenger_count: 1,
}

// Manual driver assignment form for office coordinators.
function OfficeAssignDrivers() {
  const navigate = useNavigate()
  const { collapsed: isSidebarCollapsed, toggle: toggleSidebar } = useOfficeSidebar()
  const isSuperadmin = localStorage.getItem('authRole') === 'superadmin'
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [drivers, setDrivers] = useState([])
  const [driversLoading, setDriversLoading] = useState(false)
  const [driversError, setDriversError] = useState('')
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')
  const [driverAvailabilityError, setDriverAvailabilityError] = useState('')
  const [unavailableDriverIds, setUnavailableDriverIds] = useState(() => new Set())
  const [availabilityChecked, setAvailabilityChecked] = useState(false)

  // Load the list of available drivers (role === 'driver').
  useEffect(() => {
    const token = localStorage.getItem('authToken')
    if (!token) {
      setDriversError('Authentication token not found.')
      return
    }

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

  // Check driver availability whenever departure date/time changes.
  useEffect(() => {
    setAvailabilityError('')
    setAvailabilityChecked(false)
    setDriverAvailabilityError('')

    if (!form.departure_date || !form.departure_time) {
      setUnavailableDriverIds(new Set())
      return
    }

    const departureDateTime = new Date(`${form.departure_date}T${form.departure_time}`)
    if (Number.isNaN(departureDateTime.getTime())) {
      setAvailabilityError('Invalid departure date or time format.')
      setUnavailableDriverIds(new Set())
      return
    }

    const token = localStorage.getItem('authToken')
    if (!token) {
      setAvailabilityError('Authentication token not found.')
      setUnavailableDriverIds(new Set())
      return
    }

    const controller = new AbortController()
    // Fetch the driver ids that are busy for the selected departure time.
    const loadUnavailableDrivers = async () => {
      setAvailabilityLoading(true)
      setAvailabilityChecked(true)
      setUnavailableDriverIds(new Set())

      try {
        const res = await fetch(
          `${API_BASE_URL}/bookings/unavailable-drivers?departure_time=${encodeURIComponent(departureDateTime.toISOString())}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }
        )

        if (!res.ok) {
          let detail = 'Failed to check driver availability.'
          try {
            const data = await res.json()
            if (data?.detail) detail = data.detail
          } catch {
            // ignore parse error
          }
          setAvailabilityError(detail)
          setUnavailableDriverIds(new Set())
          return
        }

        const data = await res.json()
        const ids = Array.isArray(data) ? data.filter((id) => typeof id === 'string') : []
        setUnavailableDriverIds(new Set(ids))
      } catch (err) {
        if (err?.name === 'AbortError') return
        setAvailabilityError('Network error. Please try again.')
        setUnavailableDriverIds(new Set())
      } finally {
        setAvailabilityLoading(false)
      }
    }

    loadUnavailableDrivers()
    return () => controller.abort()
  }, [form.departure_date, form.departure_time])

  // Guard against selecting a driver that is flagged as unavailable.
  useEffect(() => {
    if (!form.driver_email) return
    if (!form.departure_date || !form.departure_time) return
    if (!unavailableDriverIds.size) return

    const selected = drivers.find((driver) => driver.email === form.driver_email)
    if (!selected) return

    if (unavailableDriverIds.has(selected.uid)) {
      setDriverAvailabilityError('Selected driver is not available at this departure time.')
      setForm((prev) => ({ ...prev, driver_email: '' }))
    }
  }, [drivers, form.departure_date, form.departure_time, form.driver_email, unavailableDriverIds])

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

  // Update form fields and reset availability errors as needed.
  const handleChange = (field) => (event) => {
    const value = field === 'passenger_count' ? event.target.value : event.target.value
    if (field === 'driver_email') {
      setDriverAvailabilityError('')
    }
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  // Submit the manual assignment request.
  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setSuccessMessage('')
    setErrorMessage('')
    setShowSuccessModal(false)

    if (!form.departure_date || !form.departure_time) {
      setErrorMessage('Departure date and time are required.')
      setLoading(false)
      return
    }

    const token = localStorage.getItem('authToken')
    if (!token) {
      setErrorMessage('Authentication token not found. Please login again.')
      setLoading(false)
      return
    }

    const departureDateTime = new Date(`${form.departure_date}T${form.departure_time}`)
    if (Number.isNaN(departureDateTime.getTime())) {
      setErrorMessage('Invalid departure date or time format.')
      setLoading(false)
      return
    }

    const payload = {
      requester_name: form.requester_name,
      requester_dept_job_position: form.requester_dept_job_position,
      requester_nik: form.requester_nik,
      requester_phone: form.requester_phone,
      requester_email: form.requester_email,
      driver_email: form.driver_email,
      pickup_location: form.pickup_location,
      destination: form.destination,
      trip_type: form.trip_type,
      departure_time: departureDateTime.toISOString(),
      passenger_count: Number(form.passenger_count) || 1,
    }

    try {
      const response = await fetch(`${API_BASE_URL}/bookings/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let detail = 'Failed to assign driver.'
        try {
          const data = await response.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setErrorMessage(detail)
      } else {
        setSuccessMessage('Driver assigned successfully (approved).')
        setForm(initialForm)
        setShowSuccessModal(true)
      }
    } catch (error) {
      setErrorMessage('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <MainLayout title="Assign Drivers">
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
                className={`sidebar-item ${item.label === 'Booking Driver Assign' ? 'active' : ''}`}
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
            <p className="eyebrow">Assign Drivers</p>
            <h1>Assign a Driver</h1>
            <p className="muted">
              Create an approved driver booking on behalf of a user (will go directly to driver history).
            </p>
          </header>

          <form className="ticket-form" onSubmit={handleSubmit}>
            <section className="field-group">
              <div className="field-heading">
                <div className="heading-icon" aria-hidden="true">
                  <i className="bi bi-person-badge" />
                </div>
                <div>
                  <h2>Requestor</h2>
                  <p className="muted">User details (can be a non-account user)</p>
                </div>
              </div>
              <div className="field-grid">
                <label className="inline-label">
                  <span>Full name</span>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={form.requester_name}
                    onChange={handleChange('requester_name')}
                    required
                  />
                </label>
                <label className="inline-label">
                  <span>User Dept/Job Position</span>
                  <input
                    type="text"
                    placeholder="User Dept/Job Position"
                    value={form.requester_dept_job_position}
                    onChange={handleChange('requester_dept_job_position')}
                    required
                  />
                </label>
                <label className="inline-label">
                  <span>National ID</span>
                  <input
                    type="text"
                    placeholder="National ID"
                    value={form.requester_nik}
                    onChange={handleChange('requester_nik')}
                    required
                  />
                </label>
                <label className="inline-label">
                  <span>Phone number</span>
                  <input
                    type="tel"
                    placeholder="Phone number"
                    value={form.requester_phone}
                    onChange={handleChange('requester_phone')}
                    required
                  />
                </label>
                <label className="inline-label">
                  <span>Email</span>
                  <input
                    type="email"
                    placeholder="Email address"
                    value={form.requester_email}
                    onChange={handleChange('requester_email')}
                    required
                  />
                </label>
              </div>
            </section>

            <section className="field-group">
              <div className="field-heading">
                <div className="heading-icon" aria-hidden="true">
                  <i className="bi bi-car-front-fill" />
                </div>
                <div>
                  <h2>Booking Details</h2>
                  <p className="muted">Pickup, destination, schedule</p>
                </div>
              </div>
              <div className="field-grid">
                <label className="inline-label">
                  <span>Pickup location</span>
                  <input
                    type="text"
                    placeholder="Pickup location"
                    value={form.pickup_location}
                    onChange={handleChange('pickup_location')}
                    required
                  />
                </label>
                <label className="inline-label">
                  <span>Destination</span>
                  <input
                    type="text"
                    placeholder="Destination"
                    value={form.destination}
                    onChange={handleChange('destination')}
                    required
                  />
                </label>
                <label className="inline-label">
                  <span>Type of trip</span>
                  <select value={form.trip_type} onChange={handleChange('trip_type')} required>
                    <option value="" disabled>
                      Type of trip
                    </option>
                    <option value="antar">Drop-off</option>
                    <option value="jemput">Pick-up</option>
                    <option value="fulltrip">Full Trip</option>
                  </select>
                </label>
                <label className="inline-label">
                  <span>Departure date</span>
                  <input type="date" value={form.departure_date} onChange={handleChange('departure_date')} required />
                </label>
                <label className="inline-label">
                  <span>Departure time</span>
                  <input type="time" value={form.departure_time} onChange={handleChange('departure_time')} required />
                </label>
                <label className="inline-label">
                  <span>Total Passenger</span>
                  <input
                    type="number"
                    min="1"
                    value={form.passenger_count}
                    onChange={handleChange('passenger_count')}
                    required
                  />
                </label>
              </div>
            </section>

            <section className="field-group">
              <div className="field-heading">
                <div className="heading-icon" aria-hidden="true">
                  <i className="bi bi-person-check" />
                </div>
                <div>
                  <h2>Driver</h2>
                  <p className="muted">Assign a driver</p>
                </div>
              </div>
              <div className="field-grid">
                {driversError ? <p className="error-text">{driversError}</p> : null}
                {driverAvailabilityError ? <p className="error-text">{driverAvailabilityError}</p> : null}
                <label className="inline-label">
                  <span>Driver</span>
                  <select
                    value={form.driver_email}
                    onChange={handleChange('driver_email')}
                    disabled={driversLoading || loading || availabilityLoading || !drivers.length}
                    required
                  >
                    <option value="" disabled>
                      {driversLoading
                        ? 'Loading drivers...'
                        : availabilityLoading
                          ? 'Checking availability...'
                          : drivers.length
                            ? 'Select driver...'
                            : 'No drivers found'}
                    </option>
                    {drivers
                      .slice()
                      .sort((a, b) => {
                        if (!form.departure_date || !form.departure_time || availabilityLoading || availabilityError) return 0
                        const aUnavailable = unavailableDriverIds.has(a.uid)
                        const bUnavailable = unavailableDriverIds.has(b.uid)
                        if (aUnavailable === bUnavailable) return 0
                        return aUnavailable ? 1 : -1
                      })
                      .map((driver) => {
                        const isCheckingAvailability = form.departure_date && form.departure_time && availabilityChecked
                        const isUnavailable = isCheckingAvailability && unavailableDriverIds.has(driver.uid)
                        const label = driver.name ? `${driver.name} (${driver.email})` : driver.email
                        return (
                          <option key={driver.uid} value={driver.email} disabled={isUnavailable}>
                            {isUnavailable ? `${label} — Unavailable` : label}
                          </option>
                        )
                      })}
                  </select>
                </label>
                {!form.departure_date || !form.departure_time ? (
                  <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
                    Set departure date and time to check driver availability.
                  </p>
                ) : availabilityLoading ? (
                  <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
                    Checking availability...
                  </p>
                ) : availabilityError ? (
                  <p className="error-text" style={{ gridColumn: '1 / -1', margin: 0 }}>
                    {availabilityError}
                  </p>
                ) : availabilityChecked && drivers.length ? (
                  <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
                    Availability: {Math.max(0, drivers.length - unavailableDriverIds.size)} available · {unavailableDriverIds.size} unavailable
                  </p>
                ) : null}
              </div>
            </section>

            {successMessage ? <p className="success-text">{successMessage}</p> : null}
            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={loading || availabilityLoading}>
                {loading ? 'Submitting...' : availabilityLoading ? 'Checking availability...' : 'Assign Driver'}
              </button>
              <button type="button" className="btn btn-neutral" onClick={() => navigate('/office/driver-history')}>
                View History
              </button>
            </div>
          </form>

          {showSuccessModal ? (
            <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="assign-success-title">
              <div className="modal success-modal">
                <div className="success-modal-icon" aria-hidden="true">
                  <i className="bi bi-check-lg" />
                </div>
                <h2 id="assign-success-title" className="success-modal-title">
                  Assignment Saved
                </h2>
                <p className="success-modal-message">
                  Driver assignment was saved successfully. It will appear in driver history.
                </p>
                <div className="success-modal-actions">
                  <button
                    type="button"
                    className="btn btn-brand"
                    onClick={() => {
                      setShowSuccessModal(false)
                      navigate('/office/driver-history')
                    }}
                  >
                    View History
                  </button>
                  <button type="button" className="btn btn-outline-brand" onClick={() => setShowSuccessModal(false)}>
                    Back to Form
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

export default OfficeAssignDrivers
