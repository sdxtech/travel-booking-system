import { useLatestRequest } from '../hooks/useLatestRequest'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MainLayout from '../components/MainLayout'
import BookingFormSelect from '../components/BookingFormSelect'
import EmployeeRequesterName from '../components/EmployeeRequesterName'
import { DRIVER_SELECT_COLORS } from '../components/driverSelectColors'
import useBookingLocations from '../hooks/useBookingLocations'
import useOfficeSidebar from '../hooks/useOfficeSidebar'
import { API_BASE_URL } from '../config'
import { useAuth } from '../hooks/useAuth'

const menuItems = [
  { label: 'Quick View', icon: 'bi-speedometer2' },
  { label: 'Travel Status & History', icon: 'bi-clock-history' },
  { label: 'Travel Assign', icon: 'bi-building' },
  { label: 'Booking Driver Status & History', icon: 'bi-card-list' },
  { label: 'Booking Driver Assign', icon: 'bi-person-check' },
  { label: 'Manage User', icon: 'bi-people' },
]

const initialForm = {
  requester_name: '',
  requester_department: '',
  requester_job_position: '',
  requester_nik: '',
  requester_phone: '',
  requester_email: '',
  driver_email: '',
  pickup_location: '',
  destination: '',
  departure_date: '',
  departure_time: '',
  arrival_date: '',
  arrival_time: '',
  passenger_count: 1,
}


// Manual driver assignment form for office coordinators.
function OfficeAssignDrivers() {
  const [availabilityRevision, setAvailabilityRevision] = useState(0)
  useRealtimeRefresh(['availability', 'calendars'], () => setAvailabilityRevision((value) => value + 1))
  const navigate = useNavigate()
  const { collapsed: isSidebarCollapsed, toggle: toggleSidebar } = useOfficeSidebar()
  const { user } = useAuth()
const isSuperadmin =
  user?.role === 'superadmin'
  const [form, setForm] = useState(initialForm)
  const { locations, locationsLoading, locationsError } = useBookingLocations()
  const [loading, setLoading] = useState(false)
  const submittingRef = useRef(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [drivers, setDrivers] = useState([])
  const [employees, setEmployees] = useState([])
  const [driversLoading, setDriversLoading] = useState(false)
  const [driversError, setDriversError] = useState('')
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')
  const [driverAvailabilityError, setDriverAvailabilityError] = useState('')
  const [unavailableDriverIds, setUnavailableDriverIds] = useState(() => new Set())
  const [availabilityChecked, setAvailabilityChecked] = useState(false)

  // Load the list of available drivers (role === 'driver').
  const beginLoadDrivers = useLatestRequest()
  const loadDrivers = useCallback(async (background = false) => {
    const signal = beginLoadDrivers()
    if (!background) setDriversLoading(true)
    setDriversError('')

    try {
      const res = await fetch(`${API_BASE_URL}/users`, {
        credentials: 'include', signal,
      })
      if (!res.ok) {
        if (background) return
        let detail = 'Failed to load drivers.'
        try {
          const data = await res.json()
          if (signal.aborted) return
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setDriversError(detail)
        setDrivers([])
        setEmployees([])
        return
      }

      const data = await res.json()
      if (signal.aborted) return
      const allUsers = Array.isArray(data) ? data : []
      setEmployees(allUsers.filter((user) => user.role === 'user'))
      setDrivers(
        allUsers.filter(
          (user) => user.role === 'driver' && (isSuperadmin || (user.booking_enabled !== false && !user.disabled && !user.banned))
        )
      )
    } catch {
      if (signal.aborted || background) return
      setDriversError('Network error. Please try again.')
      setDrivers([])
      setEmployees([])
    } finally {
      if (!signal.aborted) setDriversLoading(false)
    }
  }, [beginLoadDrivers, isSuperadmin])
  useRealtimeRefresh(['users', 'availability'], () => loadDrivers(true))
  useEffect(() => { loadDrivers() }, [loadDrivers])

  // Check driver availability whenever the requested time range changes.
  useEffect(() => {
    setAvailabilityError('')
    setAvailabilityLoading(false)
    setAvailabilityChecked(false)
    setDriverAvailabilityError('')

    // The new booking is published before submit returns (email delivery can take time).
    // Do not treat its own realtime availability update as a conflicting booking.
    if (loading) return

    if (!form.departure_date || !form.departure_time || !form.arrival_date || !form.arrival_time) {
      setUnavailableDriverIds(new Set())
      return
    }

    const departureDateTime = new Date(`${form.departure_date}T${form.departure_time}`)
    const estimatedArrivalDateTime = new Date(`${form.arrival_date}T${form.arrival_time}`)
    if (Number.isNaN(departureDateTime.getTime()) || Number.isNaN(estimatedArrivalDateTime.getTime())) {
      setAvailabilityError('Invalid booking time range.')
      setUnavailableDriverIds(new Set())
      return
    }
    if (estimatedArrivalDateTime <= departureDateTime) {
      setAvailabilityError('Estimated arrival time must be later than departure time.')
      setUnavailableDriverIds(new Set())
      return
    }



    const controller = new AbortController()
    // Fetch the driver ids that are busy for the selected departure time.
    const loadUnavailableDrivers = async () => {
      setAvailabilityLoading(true)
      setUnavailableDriverIds(new Set())

      try {
        const res = await fetch(
          `${API_BASE_URL}/bookings/unavailable-drivers?departure_time=${encodeURIComponent(departureDateTime.toISOString())}&estimated_arrival_time=${encodeURIComponent(estimatedArrivalDateTime.toISOString())}`,
          {
            credentials: 'include',
            signal: controller.signal,
          }
        )
        if (controller.signal.aborted) return

        if (!res.ok) {
          let detail = 'Failed to check driver availability.'
          try {
            const data = await res.json()
            if (data?.detail) detail = data.detail
          } catch {
            // ignore parse error
          }
          if (controller.signal.aborted) return
          setAvailabilityError(detail)
          setUnavailableDriverIds(new Set())
          return
        }

        const data = await res.json()
        if (controller.signal.aborted) return
        const ids = Array.isArray(data) ? data.filter((id) => typeof id === 'string') : []
        setUnavailableDriverIds(new Set(ids))
        setAvailabilityChecked(true)
      } catch (err) {
        if (controller.signal.aborted || err?.name === 'AbortError') return
        setAvailabilityError('Network error. Please try again.')
        setUnavailableDriverIds(new Set())
      } finally {
        if (!controller.signal.aborted) setAvailabilityLoading(false)
      }
    }

    loadUnavailableDrivers()
    return () => controller.abort()
  }, [form.departure_date, form.departure_time, form.arrival_date, form.arrival_time, availabilityRevision, loading])

  // Guard against selecting a driver that is flagged as unavailable.
  useEffect(() => {
    if (loading || !availabilityChecked) return
    if (isSuperadmin) return
    if (!form.driver_email) return
    if (!form.departure_date || !form.departure_time || !form.arrival_date || !form.arrival_time) return
    if (!unavailableDriverIds.size) return

    const selected = drivers.find((driver) => driver.email === form.driver_email)
    if (!selected) return

    if (unavailableDriverIds.has(selected.uid)) {
      setDriverAvailabilityError('Selected driver has another booking that overlaps this time range.')
      setForm((prev) => ({ ...prev, driver_email: '' }))
    }
  }, [
    drivers,
    form.departure_date,
    form.departure_time,
    form.arrival_date,
    form.arrival_time,
    form.driver_email,
    isSuperadmin,
    loading,
    availabilityChecked,
    unavailableDriverIds,
  ])

  // Handle sidebar navigation clicks.
  const handleNavigate = (item) => {
    const quickViewRoute = isSuperadmin ? '/admin/home' : '/office/home'
    const manageUserRoute = isSuperadmin ? '/admin/manage-user' : '/office/manage-user'

    if (item === 'Quick View') navigate(quickViewRoute)
    if (item === 'Travel Status & History') navigate('/office/ticket-history')
    if (item === 'Booking Driver Status & History') navigate('/office/driver-history')
    if (item === 'Travel Assign') navigate('/office/travel-accommodation')
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
    if (submittingRef.current) return
    setLoading(true)
    setSuccessMessage('')
    setErrorMessage('')
    setShowSuccessModal(false)

    if (!form.pickup_location || !form.destination) {
      setErrorMessage('Pickup location and destination are required.')
      setLoading(false)
      return
    }

    if (!form.departure_date || !form.departure_time || !form.arrival_date || !form.arrival_time) {
      setErrorMessage('Departure and estimated arrival date/time are required.')
      setLoading(false)
      return
    }



    const departureDateTime = new Date(`${form.departure_date}T${form.departure_time}`)
    const estimatedArrivalDateTime = new Date(`${form.arrival_date}T${form.arrival_time}`)
    if (Number.isNaN(departureDateTime.getTime()) || Number.isNaN(estimatedArrivalDateTime.getTime())) {
      setErrorMessage('Invalid booking time range.')
      setLoading(false)
      return
    }
    if (estimatedArrivalDateTime <= departureDateTime) {
      setErrorMessage('Estimated arrival time must be later than departure time.')
      setLoading(false)
      return
    }

    const payload = {
      requester_name: form.requester_name,
      requester_department: form.requester_department,
      requester_job_position: form.requester_job_position,
      requester_nik: form.requester_nik,
      requester_phone: form.requester_phone,
      requester_email: form.requester_email,
      driver_email: form.driver_email,
      pickup_location: form.pickup_location,
      destination: form.destination,
      departure_time: departureDateTime.toISOString(),
      estimated_arrival_time: estimatedArrivalDateTime.toISOString(),
      passenger_count: Number(form.passenger_count) || 1,
    }

    submittingRef.current = true
    try {
      const response = await fetch(`${API_BASE_URL}/bookings/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',

        },
        credentials: 'include',
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
        setDriverAvailabilityError('')
        setSuccessMessage('Driver assigned successfully (approved).')
        setForm(initialForm)
        setShowSuccessModal(true)
      }
    } catch {
      setErrorMessage('Network error. Please try again.')
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  const hasCompleteSchedule = Boolean(
    form.departure_date && form.departure_time && form.arrival_date && form.arrival_time
  )
  const driverOptions = drivers
    .slice()
    .sort((a, b) => {
      if (!hasCompleteSchedule || availabilityLoading || availabilityError) return 0
      const aUnavailable = unavailableDriverIds.has(a.uid)
      const bUnavailable = unavailableDriverIds.has(b.uid)
      if (aUnavailable === bUnavailable) return 0
      return aUnavailable ? 1 : -1
    })
    .map((driver) => {
      const originalIndex = Math.max(0, drivers.findIndex((item) => item.uid === driver.uid))
      const isUnavailable = hasCompleteSchedule && availabilityChecked && unavailableDriverIds.has(driver.uid)
      const availabilityStatus = availabilityChecked ? (isUnavailable ? 'Unavailable' : 'Available') : 'Not checked'
      return {
        value: driver.email,
        label: driver.name || driver.email || 'Driver',
        status: availabilityStatus,
        statusTone: availabilityStatus === 'Available' ? 'available' : availabilityStatus === 'Unavailable' ? 'unavailable' : 'neutral',
        color: DRIVER_SELECT_COLORS[originalIndex % DRIVER_SELECT_COLORS.length],
        disabled: !isSuperadmin && isUnavailable,
      }
    })

  return (
    <MainLayout title="Assign Drivers">
      <div className={`office-quick-view fixed-sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
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
           
            <h1>Assign a Driver</h1>
           
          </header>

          <form className="ticket-form" onSubmit={handleSubmit}>
            <section className="field-group">
              <div className="field-heading">
                <div className="heading-icon" aria-hidden="true">
                  <i className="bi bi-person-badge" />
                </div>
                <div>
                  <h2>Requestor</h2>
                  <p className="muted">Select an Employee to fill their details, or enter requester details manually.</p>
                </div>
              </div>
              <div className="field-grid">
                <label className="inline-label">
                  <span>Full name</span>
                  <EmployeeRequesterName form={form} setForm={setForm} employees={employees} disabled={loading} />
                </label>
                <label className="inline-label">
                  <span>Department</span>
                  <input
                    type="text"
                    placeholder="Department"
                    value={form.requester_department}
                    onChange={handleChange('requester_department')}
                    required
                  />
                </label>
                <label className="inline-label">
                  <span>Title/Position</span>
                  <input type="text" placeholder="Title/Position" value={form.requester_job_position} onChange={handleChange('requester_job_position')} />
                </label>
                <label className="inline-label">
                  <span>National ID (optional)</span>
                  <input
                    type="text"
                    placeholder="National ID"
                    value={form.requester_nik}
                    onChange={handleChange('requester_nik')}
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
                <div className="inline-label">
                  <span>Pickup location</span>
                  <BookingFormSelect value={form.pickup_location} options={locations.map((item) => ({ value: item.name, label: item.name }))} placeholder={locationsLoading ? 'Loading locations...' : locations.length ? 'Select pickup location...' : 'No locations available'} disabled={locationsLoading || !locations.length} ariaLabel="Select pickup location" searchable onChange={(value) => setForm((current) => ({ ...current, pickup_location: value }))} />
                </div>
                <div className="inline-label">
                  <span>Destination</span>
                  <BookingFormSelect value={form.destination} options={locations.map((item) => ({ value: item.name, label: item.name }))} placeholder={locationsLoading ? 'Loading locations...' : locations.length ? 'Select destination...' : 'No locations available'} disabled={locationsLoading || !locations.length} ariaLabel="Select destination" searchable onChange={(value) => setForm((current) => ({ ...current, destination: value }))} />
                </div>
                <label className="inline-label">
                  <span>Departure date</span>
                  <input type="date" value={form.departure_date} onChange={handleChange('departure_date')} required />
                </label>
                <label className="inline-label">
                  <span>Departure time</span>
                  <input type="time" value={form.departure_time} onChange={handleChange('departure_time')} required />
                </label>
                <label className="inline-label">
                  <span>Estimated arrival date</span>
                  <input type="date" value={form.arrival_date} onChange={handleChange('arrival_date')} required />
                </label>
                <label className="inline-label">
                  <span>Estimated arrival time</span>
                  <input type="time" value={form.arrival_time} onChange={handleChange('arrival_time')} required />
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
                <div className="inline-label">
                  <span>Driver</span>
                  <BookingFormSelect
                    value={form.driver_email}
                    options={driverOptions}
                    placeholder={
                      driversLoading
                        ? 'Loading drivers...'
                        : availabilityLoading
                          ? 'Checking availability...'
                          : drivers.length
                            ? 'Select driver...'
                            : 'No drivers found'
                    }
                    disabled={driversLoading || loading || availabilityLoading || !drivers.length}
                    ariaLabel="Select driver"
                    onChange={(value) => setForm((prev) => ({ ...prev, driver_email: value }))}
                  />
                </div>
                {!form.departure_date || !form.departure_time || !form.arrival_date || !form.arrival_time ? (
                  <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
                    Set departure and estimated arrival date/time to check driver availability.
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
            {locationsError ? <p className="error-text">{locationsError}</p> : null}

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
                    Close
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
