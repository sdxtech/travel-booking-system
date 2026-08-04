import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import MainLayout from '../components/MainLayout'
import BookingFormSelect from '../components/BookingFormSelect'
import { DRIVER_SELECT_COLORS } from '../components/driverSelectColors'
import { API_BASE_URL } from '../config'

const tripTypeOptions = [
  { value: 'antar', label: 'Drop-off', icon: 'bi-box-arrow-right' },
  { value: 'jemput', label: 'Pick-up', icon: 'bi-box-arrow-in-left' },
  { value: 'fulltrip', label: 'Full Trip', icon: 'bi-arrow-left-right' },
]

const initialForm = {
  driver_id: '',
  pickup_location: '',
  destination: '',
  trip_type: '',
  departure_date: '',
  departure_time: '',
  arrival_date: '',
  arrival_time: '',
  passenger_count: 1,
}

// Create/edit a driver booking request.
function BookingDriver() {
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [editingBookingId, setEditingBookingId] = useState('')
  const [drivers, setDrivers] = useState([])
  const [driversLoading, setDriversLoading] = useState(true)
  const [unavailableDriverIds, setUnavailableDriverIds] = useState(() => new Set())
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityChecked, setAvailabilityChecked] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')
  const [submissionStatus, setSubmissionStatus] = useState('')

  // Convert API timestamps into a Date instance.
  const toDate = (value) => {
    if (!value) return null
    if (value?.seconds) return new Date(value.seconds * 1000)
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  // Format a Date into the YYYY-MM-DD input format.
  const formatDateInput = (date) => {
    const year = String(date.getFullYear())
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Format a Date into the HH:mm input format.
  const formatTimeInput = (date) => {
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${hours}:${minutes}`
  }

  // Update form field values, including passenger count parsing.
  const handleChange = (field) => (event) => {
    const value = field === 'passenger_count' ? event.target.value : event.target.value
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  // Load active drivers for the employee's required driver selection.
  useEffect(() => {
    const token = localStorage.getItem('authToken')
    if (!token) {
      setDriversLoading(false)
      return
    }

    const loadDrivers = async () => {
      setDriversLoading(true)
      try {
        const response = await fetch(`${API_BASE_URL}/bookings/driver-calendars`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) throw new Error('Failed to load drivers')
        const data = await response.json()
        setDrivers(Array.isArray(data) ? data.filter((driver) => driver.booking_enabled !== false) : [])
      } catch {
        setDrivers([])
        setErrorMessage('Failed to load the driver list. Please refresh the page.')
      } finally {
        setDriversLoading(false)
      }
    }

    loadDrivers()
  }, [])

  // Resolve driver status for the requested interval while still allowing conflicting requests to become pending.
  useEffect(() => {
    setAvailabilityChecked(false)
    setAvailabilityError('')
    setUnavailableDriverIds(new Set())

    if (!form.departure_date || !form.departure_time || !form.arrival_date || !form.arrival_time) return undefined

    const departureDateTime = new Date(`${form.departure_date}T${form.departure_time}`)
    const estimatedArrivalDateTime = new Date(`${form.arrival_date}T${form.arrival_time}`)
    if (
      Number.isNaN(departureDateTime.getTime()) ||
      Number.isNaN(estimatedArrivalDateTime.getTime()) ||
      estimatedArrivalDateTime <= departureDateTime
    ) {
      return undefined
    }

    const token = localStorage.getItem('authToken')
    if (!token) return undefined

    const controller = new AbortController()
    const loadAvailability = async () => {
      setAvailabilityLoading(true)
      try {
        const response = await fetch(
          `${API_BASE_URL}/bookings/unavailable-drivers?departure_time=${encodeURIComponent(departureDateTime.toISOString())}&estimated_arrival_time=${encodeURIComponent(estimatedArrivalDateTime.toISOString())}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }
        )
        if (!response.ok) throw new Error('Failed to check driver availability')
        const data = await response.json()
        setUnavailableDriverIds(new Set(Array.isArray(data) ? data.map(String) : []))
        setAvailabilityChecked(true)
      } catch (error) {
        if (error?.name !== 'AbortError') {
          setAvailabilityError('Unable to check driver availability. Please try again.')
        }
      } finally {
        if (!controller.signal.aborted) setAvailabilityLoading(false)
      }
    }

    loadAvailability()
    return () => controller.abort()
  }, [form.departure_date, form.departure_time, form.arrival_date, form.arrival_time])

  // Prefill the form when navigating from history with an existing booking.
  useEffect(() => {
    const booking = location.state?.booking
    if (!booking?.id) {
      setEditingBookingId('')
      setForm(initialForm)
      return
    }

    setEditingBookingId(booking.id)
    const departure = toDate(booking.departure_time)
    const arrival = toDate(booking.estimated_arrival_time)

    setForm({
      ...initialForm,
      driver_id: booking.driver_id || '',
      pickup_location: booking.pickup_location || '',
      destination: booking.destination || '',
      trip_type: booking.trip_type || '',
      departure_date: departure ? formatDateInput(departure) : '',
      departure_time: departure ? formatTimeInput(departure) : '',
      arrival_date: arrival ? formatDateInput(arrival) : '',
      arrival_time: arrival ? formatTimeInput(arrival) : '',
      passenger_count: booking.passenger_count ?? 1,
    })
    setErrorMessage('')
  }, [location.state])

  // Submit a new booking or save changes to an existing one.
  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setErrorMessage('')
    setSubmissionStatus('')

    if (!form.trip_type || !form.driver_id) {
      setErrorMessage('Trip type and driver are required.')
      setLoading(false)
      return
    }

    if (!form.departure_date || !form.departure_time || !form.arrival_date || !form.arrival_time) {
      setErrorMessage('Departure and estimated arrival date/time are required.')
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
    const estimatedArrivalDateTime = new Date(`${form.arrival_date}T${form.arrival_time}`)
    if (Number.isNaN(departureDateTime.getTime()) || Number.isNaN(estimatedArrivalDateTime.getTime())) {
      setErrorMessage('Invalid departure or estimated arrival date/time.')
      setLoading(false)
      return
    }

    if (estimatedArrivalDateTime <= departureDateTime) {
      setErrorMessage('Estimated arrival time must be later than departure time.')
      setLoading(false)
      return
    }

    const payload = {
      driver_id: form.driver_id,
      pickup_location: form.pickup_location,
      destination: form.destination,
      trip_type: form.trip_type,
      departure_time: departureDateTime.toISOString(),
      estimated_arrival_time: estimatedArrivalDateTime.toISOString(),
      passenger_count: Number(form.passenger_count) || 1,
    }

    try {
      const endpoint = editingBookingId
        ? `${API_BASE_URL}/bookings/${editingBookingId}`
        : `${API_BASE_URL}/bookings`
      const method = editingBookingId ? 'PATCH' : 'POST'

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let detail = 'Failed to submit booking request.'
        try {
          const data = await response.json()
          if (data?.detail) {
            detail = data.detail
          }
        } catch {
          // ignore parse error
        }
        setErrorMessage(detail)
      } else {
        const result = await response.json()
        setSubmissionStatus(String(result?.status || ''))
        if (!editingBookingId) {
          setForm(initialForm)
        }
        window.dispatchEvent(new Event('notifications:refresh'))
        setShowSuccessModal(true)
      }
    } catch {
      setErrorMessage('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <MainLayout title="Booking Driver">
      <div className="ticket-request-page booking-driver-page">
        <header className="ticket-request-header">
          <button className="back-link" type="button" onClick={() => navigate(-1)}>
            &larr; Back
          </button>
          <div>
            <p className="eyebrow">Booking Driver</p>
            <h1>{editingBookingId ? 'Edit Booking' : 'Create New Booking'}</h1>
            <p className="muted">Fill out the form below to request a driver</p>
          </div>
        </header>

        <form className="ticket-form" onSubmit={handleSubmit}>
          <section className="booking-card">
            <div className="booking-card__header">
              <div className="heading-icon" aria-hidden="true">
                <i className="bi bi-car-front-fill" />
              </div>
              <div>
                <h2>Trip Details</h2>
                <p className="muted">Schedule, route, trip details, then driver selection</p>
              </div>
            </div>

            <div className="booking-grid">
              <label className="form-field">
                <span>Departure Date</span>
                <input
                  type="date"
                  value={form.departure_date}
                  onChange={handleChange('departure_date')}
                  required
                />
              </label>
              <label className="form-field">
                <span>Estimated Arrival Date</span>
                <input
                  type="date"
                  value={form.arrival_date}
                  onChange={handleChange('arrival_date')}
                  required
                />
              </label>
              <label className="form-field">
                <span>Departure Time</span>
                <input
                  type="time"
                  value={form.departure_time}
                  onChange={handleChange('departure_time')}
                  required
                />
              </label>
              <label className="form-field">
                <span>Estimated Arrival Time</span>
                <input
                  type="time"
                  value={form.arrival_time}
                  onChange={handleChange('arrival_time')}
                  required
                />
              </label>
              <label className="form-field">
                <span>Pickup Location</span>
                <input
                  type="text"
                  placeholder="Office Lobby"
                  value={form.pickup_location}
                  onChange={handleChange('pickup_location')}
                  required
                />
              </label>
              <label className="form-field">
                <span>Destination</span>
                <input
                  type="text"
                  placeholder="Soekarno-Hatta Airport"
                  value={form.destination}
                  onChange={handleChange('destination')}
                  required
                />
              </label>
              <div className="form-field">
                <span>Trip Type</span>
                <BookingFormSelect
                  value={form.trip_type}
                  options={tripTypeOptions}
                  placeholder="Select type..."
                  ariaLabel="Select trip type"
                  onChange={(value) => setForm((prev) => ({ ...prev, trip_type: value }))}
                />
              </div>
              <label className="form-field">
                <span>Total Passenger</span>
                <input
                  type="number"
                  min="1"
                  value={form.passenger_count}
                  onChange={handleChange('passenger_count')}
                  required
                />
              </label>
              <div className="form-field">
                <span>Select Driver</span>
                <BookingFormSelect
                  value={form.driver_id}
                  options={drivers.map((driver, index) => ({
                    value: driver.driver_id,
                    label: driver.driver_name || driver.driver_email || 'Driver',
                    status: availabilityChecked
                      ? unavailableDriverIds.has(String(driver.driver_id))
                        ? 'Unavailable'
                        : 'Available'
                      : 'Not checked',
                    statusTone: availabilityChecked
                      ? unavailableDriverIds.has(String(driver.driver_id))
                        ? 'unavailable'
                        : 'available'
                      : 'neutral',
                    color: DRIVER_SELECT_COLORS[index % DRIVER_SELECT_COLORS.length],
                  }))}
                  placeholder={
                    driversLoading
                      ? 'Loading drivers...'
                      : availabilityLoading
                        ? 'Checking availability...'
                        : drivers.length
                          ? 'Select driver...'
                          : 'No drivers available'
                  }
                  disabled={driversLoading || availabilityLoading}
                  ariaLabel="Select driver"
                  onChange={(value) => setForm((prev) => ({ ...prev, driver_id: value }))}
                />
              </div>
            </div>
          </section>

          {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
          {availabilityError ? <p className="error-text">{availabilityError}</p> : null}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Submitting...' : editingBookingId ? 'Save Changes' : 'Submit Request'}
            </button>
            <button type="button" className="btn btn-outline-danger" onClick={() => navigate('/user/home')}>
              Cancel
            </button>
          </div>
        </form>

        {showSuccessModal ? (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="booking-success-title">
            <div className="modal success-modal">
              <div className="success-modal-icon" aria-hidden="true">
                <i className="bi bi-check-lg" />
              </div>
              <h2 id="booking-success-title" className="success-modal-title">
                {submissionStatus === 'approved' ? 'Booking Approved' : editingBookingId ? 'Changes Saved' : 'Request Sent'}
              </h2>
              <p className="success-modal-message">
                {submissionStatus === 'approved'
                  ? 'The selected driver is available, so your booking was approved automatically by the system.'
                  : 'The selected driver has an overlapping booking. Your request is pending Office Coordinator review.'}
              </p>
              <div className="success-modal-actions">
                <button
                  type="button"
                  className="btn btn-brand"
                  onClick={() => {
                    setShowSuccessModal(false)
                    navigate('/user/booking-history')
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
      </div>
    </MainLayout>
  )
}

export default BookingDriver
