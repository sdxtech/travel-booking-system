import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import BookingFormSelect from './BookingFormSelect'
import EmployeeRequesterName from './EmployeeRequesterName'
import { API_BASE_URL } from '../config'
import useBookingLocations from '../hooks/useBookingLocations'
import { useAuth } from '../hooks/useAuth'

const OTHER_LOCATION_VALUE = '__other_location__'

function formatDateInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatTimeInput(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatDriverHeader(calendar) {
  const plateLabel = String(calendar.plateLabel || '').trim()
  const match = plateLabel.match(/^(.*?)\s*\((Ganjil|Genap)\)$/)
  if (match) return `${calendar.name} | ${match[1].trim()} | ${match[2]}`
  return plateLabel ? `${calendar.name} | ${plateLabel}` : calendar.name
}

function QuickBookingModal({ slot, onClose, onBooked }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isOfficeBooking = ['office_coordinator', 'superadmin'].includes(user?.role)
  const submittingRef = useRef(false)
  const defaultEnd = new Date(slot.start)
  defaultEnd.setMinutes(defaultEnd.getMinutes() + 30)
  const [form, setForm] = useState({
    requester_name: '',
    requester_department: '',
    requester_job_position: '',
    requester_nik: '',
    requester_phone: '',
    requester_email: '',
    pickup_location: '',
    destination: '',
    passenger_count: 1,
    departure_date: formatDateInput(slot.start),
    departure_time: formatTimeInput(slot.start),
    arrival_date: formatDateInput(defaultEnd),
    arrival_time: formatTimeInput(defaultEnd),
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submissionStatus, setSubmissionStatus] = useState('')
  const { locations, locationsLoading, locationsError } = useBookingLocations()
  const [pickupLocationOther, setPickupLocationOther] = useState(false)
  const [destinationOther, setDestinationOther] = useState(false)
  const locationOptions = [...locations.map((item) => ({ value: item.name, label: item.name })), { value: OTHER_LOCATION_VALUE, label: 'Others' }]

  const updateField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    if (submittingRef.current) return
    if (isOfficeBooking && !slot.calendar.email) {
      setError('The selected driver is no longer available. Close this form and select a driver again.')
      return
    }
    if (isOfficeBooking && [form.requester_name, form.requester_department, form.requester_phone, form.requester_email].some((value) => !value.trim())) {
      setError('Please complete all requester details.')
      return
    }
    if (!form.pickup_location || !form.destination) {
      setError('Pickup location and destination are required.')
      return
    }
    const departure = new Date(`${form.departure_date}T${form.departure_time}`)
    const arrival = new Date(`${form.arrival_date}T${form.arrival_time}`)
    if (Number.isNaN(departure.getTime()) || Number.isNaN(arrival.getTime()) || arrival <= departure) {
      setError('Estimated arrival time must be later than departure time.')
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/bookings${isOfficeBooking ? '/assign' : ''}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isOfficeBooking ? {
            driver_email: slot.calendar.email,
            requester_name: form.requester_name.trim(),
            requester_department: form.requester_department.trim(),
            requester_job_position: form.requester_job_position.trim(),
            requester_nik: form.requester_nik.trim(),
            requester_phone: form.requester_phone.trim(),
            requester_email: form.requester_email.trim(),
          } : { driver_id: slot.calendar.id }),
          pickup_location: form.pickup_location,
          destination: form.destination,
          passenger_count: Number(form.passenger_count) || 1,
          departure_time: departure.toISOString(),
          estimated_arrival_time: arrival.toISOString(),
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.detail || 'Failed to submit booking request.')
      }
      const result = await response.json()
      window.dispatchEvent(new Event('notifications:refresh'))
      onBooked()
      setSubmissionStatus(String(result?.status || 'pending'))
    } catch (requestError) {
      setError(requestError.message || 'Network error. Please try again.')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="modal-overlay quick-calendar-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="quick-booking-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      {submissionStatus ? (
        <div className="modal success-modal">
          <div className="success-modal-icon" aria-hidden="true">
            <i className="bi bi-check-lg" />
          </div>
          <h2 id="quick-booking-title" className="success-modal-title">
            {submissionStatus === 'approved' ? 'Booking Approved' : 'Request Sent'}
          </h2>
          <p className="success-modal-message">
            {isOfficeBooking
              ? 'The booking has been created and the driver has been assigned successfully.'
              : submissionStatus === 'approved'
              ? 'The selected driver is available, so your booking was approved automatically by the system.'
              : 'Your booking request has been sent for review.'}
          </p>
          <div className="success-modal-actions">
            <button
              type="button"
              className="btn btn-brand"
              onClick={() => {
                onClose()
                navigate(isOfficeBooking ? '/office/driver-history' : '/user/booking-history')
              }}
            >
              View History
            </button>
            <button type="button" className="btn btn-outline-brand" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <div className="modal quick-booking-modal">
          <div className="modal-header">
            <h2 id="quick-booking-title">Create Booking Driver</h2>
            <button type="button" className="modal-close" aria-label="Close booking form" onClick={onClose}>
              <i className="bi bi-x-lg" aria-hidden="true" />
            </button>
          </div>
          <form className="ticket-form quick-booking-modal__form" onSubmit={submit}>
            <p className="quick-booking-modal__driver"><i className="bi bi-car-front" aria-hidden="true" /> {formatDriverHeader(slot.calendar)}</p>
            <div className="booking-grid">
              {isOfficeBooking ? (
                <>
                  <label className="form-field"><span>Full Name</span><EmployeeRequesterName form={form} setForm={setForm} disabled={submitting} /></label>
                  <label className="form-field"><span>Department</span><input type="text" required value={form.requester_department} onChange={updateField('requester_department')} /></label>
                  <label className="form-field"><span>Title/Position</span><input type="text" value={form.requester_job_position} onChange={updateField('requester_job_position')} /></label>
                  <label className="form-field"><span>National ID (optional)</span><input type="text" value={form.requester_nik} onChange={updateField('requester_nik')} /></label>
                  <label className="form-field"><span>Phone/WA</span><input type="tel" required value={form.requester_phone} onChange={updateField('requester_phone')} /></label>
                  <label className="form-field"><span>Email</span><input type="email" required value={form.requester_email} onChange={updateField('requester_email')} /></label>
                </>
              ) : null}
              <label className="form-field"><span>Departure Date</span><input type="date" required value={form.departure_date} onChange={updateField('departure_date')} /></label>
              <label className="form-field"><span>Departure Time</span><input type="time" required value={form.departure_time} onChange={updateField('departure_time')} /></label>
              <label className="form-field"><span>Estimated Arrival Time</span><input type="time" required value={form.arrival_time} onChange={updateField('arrival_time')} /></label>
              <label className="form-field"><span>Estimated Arrival Date</span><input type="date" required value={form.arrival_date} onChange={updateField('arrival_date')} /></label>
              <div className="form-field"><span>Pickup Location</span><BookingFormSelect value={pickupLocationOther ? OTHER_LOCATION_VALUE : form.pickup_location} options={locationOptions} placeholder={locationsLoading ? 'Loading locations...' : 'Select pickup location...'} disabled={locationsLoading} ariaLabel="Select pickup location" searchable onChange={(value) => { setPickupLocationOther(value === OTHER_LOCATION_VALUE); setForm((current) => ({ ...current, pickup_location: value === OTHER_LOCATION_VALUE ? '' : value })) }} />{pickupLocationOther ? <input type="text" placeholder="Enter pickup location" value={form.pickup_location} onChange={updateField('pickup_location')} required /> : null}</div>
              <div className="form-field"><span>Destination</span><BookingFormSelect value={destinationOther ? OTHER_LOCATION_VALUE : form.destination} options={locationOptions} placeholder={locationsLoading ? 'Loading locations...' : 'Select destination...'} disabled={locationsLoading} ariaLabel="Select destination" searchable onChange={(value) => { setDestinationOther(value === OTHER_LOCATION_VALUE); setForm((current) => ({ ...current, destination: value === OTHER_LOCATION_VALUE ? '' : value })) }} />{destinationOther ? <input type="text" placeholder="Enter destination" value={form.destination} onChange={updateField('destination')} required /> : null}</div>
              <label className="form-field"><span>Total Passenger</span><input type="number" min="1" required value={form.passenger_count} onChange={updateField('passenger_count')} /></label>
            </div>
            {error ? <p className="error-text">{error}</p> : null}
            {locationsError ? <p className="error-text">{locationsError}</p> : null}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={submitting || locationsLoading}>{submitting ? 'Submitting...' : isOfficeBooking ? 'Assign Driver' : 'Submit Request'}</button>
              <button type="button" className="btn btn-outline-danger" onClick={onClose} disabled={submitting}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>,
    document.body
  )
}

export default QuickBookingModal
