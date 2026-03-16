import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import MainLayout from '../components/MainLayout'
import { API_BASE_URL } from '../config'

const initialForm = {
  pickup_location: '',
  destination: '',
  trip_type: '',
  departure_date: '',
  departure_time: '',
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

    setForm({
      ...initialForm,
      pickup_location: booking.pickup_location || '',
      destination: booking.destination || '',
      trip_type: booking.trip_type || '',
      departure_date: departure ? formatDateInput(departure) : '',
      departure_time: departure ? formatTimeInput(departure) : '',
      passenger_count: booking.passenger_count ?? 1,
    })
    setErrorMessage('')
  }, [location.state])

  // Submit a new booking or save changes to an existing one.
  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setErrorMessage('')

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
      setErrorMessage('Invalid date or time format.')
      setLoading(false)
      return
    }

    const payload = {
      pickup_location: form.pickup_location,
      destination: form.destination,
      trip_type: form.trip_type,
      departure_time: departureDateTime.toISOString(),
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
        } catch (error) {
          // ignore parse error
        }
        setErrorMessage(detail)
      } else {
        if (!editingBookingId) {
          setForm(initialForm)
        }
        window.dispatchEvent(new Event('notifications:refresh'))
        setShowSuccessModal(true)
      }
    } catch (error) {
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
                <p className="muted">Pickup, destination, and departure schedule</p>
              </div>
            </div>

            <div className="booking-grid">
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
              <label className="form-field">
                <span>Trip Type</span>
                <select value={form.trip_type} onChange={handleChange('trip_type')} required>
                  <option value="" disabled>
                    Select type...
                  </option>
                  <option value="antar">Drop-off</option>
                  <option value="jemput">Pick-up</option>
                  <option value="fulltrip">Full Trip</option>
                </select>
              </label>
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
                <span>Departure Time</span>
                <input
                  type="time"
                  value={form.departure_time}
                  onChange={handleChange('departure_time')}
                  required
                />
              </label>
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
            </div>
          </section>

          {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

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
                {editingBookingId ? 'Changes Saved' : 'Request Sent'}
              </h2>
              <p className="success-modal-message">
                {editingBookingId
                  ? 'Your driver booking request was updated successfully.'
                  : "Your driver booking request was sent successfully. We'll notify the office coordinator."}
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
