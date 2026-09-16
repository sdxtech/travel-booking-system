import { useState } from 'react'
import BookingFormSelect from './BookingFormSelect'
import { API_BASE_URL } from '../config'
import useBookingLocations from '../hooks/useBookingLocations'

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
  const defaultEnd = new Date(slot.start)
  defaultEnd.setMinutes(defaultEnd.getMinutes() + 30)
  const [form, setForm] = useState({
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

  const updateField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
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

    setSubmitting(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/bookings`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_id: slot.calendar.id,
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
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="quick-booking-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal quick-booking-modal">
        <div className="modal-header">
          <h2 id="quick-booking-title">{submissionStatus ? (submissionStatus === 'approved' ? 'Booking Approved' : 'Request Sent') : 'Create Booking Driver'}</h2>
          <button type="button" className="modal-close" aria-label="Close booking form" onClick={onClose}>
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>
        {submissionStatus ? (
          <div className="quick-booking-modal__success">
            <div className="success-modal-icon" aria-hidden="true"><i className="bi bi-check-lg" /></div>
            <p>
              {submissionStatus === 'approved'
                ? 'The selected driver is available, so your booking was approved automatically by the system.'
                : 'Your booking request has been sent for review.'}
            </p>
            <button type="button" className="btn btn-brand" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form className="ticket-form quick-booking-modal__form" onSubmit={submit}>
            <p className="quick-booking-modal__driver"><i className="bi bi-car-front" aria-hidden="true" /> {formatDriverHeader(slot.calendar)}</p>
            <div className="booking-grid">
              <label className="form-field"><span>Departure Date</span><input type="date" required value={form.departure_date} onChange={updateField('departure_date')} /></label>
              <label className="form-field"><span>Departure Time</span><input type="time" required value={form.departure_time} onChange={updateField('departure_time')} /></label>
              <label className="form-field"><span>Estimated Arrival Time</span><input type="time" required value={form.arrival_time} onChange={updateField('arrival_time')} /></label>
              <label className="form-field"><span>Estimated Arrival Date</span><input type="date" required value={form.arrival_date} onChange={updateField('arrival_date')} /></label>
              <div className="form-field"><span>Pickup Location</span><BookingFormSelect value={form.pickup_location} options={locations.map((item) => ({ value: item.name, label: item.name }))} placeholder={locationsLoading ? 'Loading locations...' : locations.length ? 'Select pickup location...' : 'No locations available'} disabled={locationsLoading || !locations.length} ariaLabel="Select pickup location" onChange={(value) => setForm((current) => ({ ...current, pickup_location: value }))} /></div>
              <div className="form-field"><span>Destination</span><BookingFormSelect value={form.destination} options={locations.map((item) => ({ value: item.name, label: item.name }))} placeholder={locationsLoading ? 'Loading locations...' : locations.length ? 'Select destination...' : 'No locations available'} disabled={locationsLoading || !locations.length} ariaLabel="Select destination" onChange={(value) => setForm((current) => ({ ...current, destination: value }))} /></div>
              <label className="form-field"><span>Total Passenger</span><input type="number" min="1" required value={form.passenger_count} onChange={updateField('passenger_count')} /></label>
            </div>
            {error ? <p className="error-text">{error}</p> : null}
            {locationsError ? <p className="error-text">{locationsError}</p> : null}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={submitting || locationsLoading || !locations.length}>{submitting ? 'Submitting...' : 'Submit Request'}</button>
              <button type="button" className="btn btn-outline-danger" onClick={onClose} disabled={submitting}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default QuickBookingModal
