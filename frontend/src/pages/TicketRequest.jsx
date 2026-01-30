import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import MainLayout from '../components/MainLayout'
import { API_BASE_URL } from '../config'

const initialForm = {
  destination: '',
  departure_point: '',
  departure_date: '',
  departure_time: '',
  purpose_of_travel: '',
  trip_type: '',
  hotel_accommodation: 'no',
  hotel_name: '',
  hotel_location: '',
  transportation_mode: '',
  transportation_other: '',
  superior_approval_note: '',
  additional_notes: '',
}

// Create/edit travel accommodation requests.
function TicketRequest() {
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [editingTicketId, setEditingTicketId] = useState('')

  // Update form fields and clear dependent inputs when switching options.
  const handleChange = (field) => (event) => {
    const value = event.target.value
    setForm((prev) => {
      const next = {
        ...prev,
        [field]: value,
      }

      if (field === 'hotel_accommodation' && value !== 'yes') {
        next.hotel_name = ''
        next.hotel_location = ''
      }

      if (field === 'transportation_mode' && value !== 'other') {
        next.transportation_other = ''
      }

      return next
    })
  }

  // If navigated from history with a ticket payload, prefill the form for editing.
  useEffect(() => {
    const ticket = location.state?.ticket
    if (!ticket?.id) {
      setEditingTicketId('')
      setForm(initialForm)
      return
    }

    setEditingTicketId(ticket.id)
    setForm({
      ...initialForm,
      destination: ticket.destination || '',
      departure_point: ticket.departure_point || '',
      departure_date: ticket.departure_date ? String(ticket.departure_date).slice(0, 10) : '',
      departure_time: ticket.departure_time || '',
      purpose_of_travel: ticket.purpose_of_travel || '',
      trip_type: ticket.trip_type || '',
      hotel_accommodation: ticket.hotel_accommodation ? 'yes' : 'no',
      hotel_name: ticket.hotel_name || '',
      hotel_location: ticket.hotel_location || '',
      transportation_mode: ticket.transportation_mode || '',
      transportation_other: ticket.transportation_other || '',
      superior_approval_note: ticket.superior_approval_note || '',
      additional_notes: ticket.additional_notes || '',
    })
  }, [location.state])

  // Submit a new request or update an existing ticket.
  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setErrorMessage('')

    const token = localStorage.getItem('authToken')
    if (!token) {
      setErrorMessage('Authentication token not found. Please login again.')
      setLoading(false)
      return
    }

    const payload = {
      ...form,
      hotel_accommodation: form.hotel_accommodation === 'yes',
    }

    if (form.hotel_accommodation !== 'yes') {
      payload.hotel_name = null
      payload.hotel_location = null
    }

    if (form.transportation_mode !== 'other') {
      payload.transportation_other = null
    }

    try {
      const endpoint = editingTicketId ? `${API_BASE_URL}/tickets/${editingTicketId}` : `${API_BASE_URL}/tickets`
      const method = editingTicketId ? 'PATCH' : 'POST'

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let detail = 'Failed to submit ticket request.'
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
        if (!editingTicketId) {
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
    <MainLayout title="Ticket Request">
      <div className="ticket-request-page">
        <header className="ticket-request-header">
          <button className="back-link" type="button" onClick={() => navigate(-1)}>
            &larr; Back
          </button>
          <div>
            <p className="eyebrow">Travel Request</p>
            <h1>Business Travel Accomodation Request</h1>
            <p className="muted">Fill out the form to submit a request</p>
          </div>
        </header>

        <form className="ticket-form" onSubmit={handleSubmit}>
          <section className="field-group">
            <div className="field-heading">
              <div className="heading-icon" aria-hidden="true">
                <i className="bi bi-airplane" />
              </div>
              <div>
                <h2>Travel Details</h2>
                <p className="muted">Where and when you need to go</p>
              </div>
            </div>
            <div className="field-grid">
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
                <span>Departure point</span>
                <input
                  type="text"
                  placeholder="Departure point (airport/station)"
                  value={form.departure_point}
                  onChange={handleChange('departure_point')}
                  required
                />
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
                <span>Purpose of travel</span>
                <textarea
                  placeholder="Purpose of travel"
                  rows="3"
                  value={form.purpose_of_travel}
                  onChange={handleChange('purpose_of_travel')}
                  required
                />
              </label>
              <label className="inline-label">
                <span>Type of trip</span>
                <select value={form.trip_type} onChange={handleChange('trip_type')} required>
                  <option value="" disabled>
                    Type of trip
                  </option>
                  <option value="one-way">One way</option>
                  <option value="round-trip">Return</option>
                  <option value="full-trip">Full Trip</option>
                </select>
              </label>
            </div>
          </section>

          <section className="field-group">
            <div className="field-heading">
              <div className="heading-icon" aria-hidden="true">
                <i className="bi bi-building" />
              </div>
              <div>
                <h2>Accommodation & Transportation</h2>
                <p className="muted">Hotel and ride preferences</p>
              </div>
            </div>
            <div className="field-grid">
              <div className="radio-row">
                <span>Hotel accommodation?</span>
                <div className="radio-options">
                  <label>
                    <input
                      type="radio"
                      name="hotel"
                      value="yes"
                      checked={form.hotel_accommodation === 'yes'}
                      onChange={handleChange('hotel_accommodation')}
                    />{' '}
                    Yes
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="hotel"
                      value="no"
                      checked={form.hotel_accommodation === 'no'}
                      onChange={handleChange('hotel_accommodation')}
                    />{' '}
                    No
                  </label>
                </div>
              </div>
              {form.hotel_accommodation === 'yes' ? (
                <>
                  <label className="inline-label">
                    <span>Hotel name</span>
                    <input
                      type="text"
                      placeholder="Hotel name"
                      value={form.hotel_name}
                      onChange={handleChange('hotel_name')}
                      required
                    />
                  </label>
                  <label className="inline-label">
                    <span>Hotel location</span>
                    <input
                      type="text"
                      placeholder="Hotel location"
                      value={form.hotel_location}
                      onChange={handleChange('hotel_location')}
                      required
                    />
                  </label>
                </>
              ) : null}
              <label className="inline-label">
                <span>Preferred mode of transportation</span>
                <select value={form.transportation_mode} onChange={handleChange('transportation_mode')} required>
                  <option value="" disabled>
                    Preferred mode of transportation
                  </option>
                  <option value="plane">Plane</option>
                  <option value="train">Train</option>
                  <option value="car">Car</option>
                  <option value="bus">Bus</option>
                  <option value="other">Other</option>
                </select>
              </label>
              {form.transportation_mode === 'other' ? (
                <label className="inline-label">
                  <span>Other transportation</span>
                  <input
                    type="text"
                    placeholder="If other, write name"
                    value={form.transportation_other}
                    onChange={handleChange('transportation_other')}
                  />
                </label>
              ) : null}
            </div>
          </section>

          <section className="field-group">
            <div className="field-heading">
              <div className="heading-icon" aria-hidden="true">
                <i className="bi bi-paperclip" />
              </div>
              <div>
                <h2>Approval & Attachments</h2>
                <p className="muted">Upload approvals or share notes</p>
              </div>
            </div>
            <div className="field-grid">
              <label className="inline-label">
                <span>Approval note (optional)</span>
                <textarea
                  placeholder="Superior approval note (link or description)"
                  rows="3"
                  value={form.superior_approval_note}
                  onChange={handleChange('superior_approval_note')}
                />
              </label>
              <label className="inline-label">
                <span>Additional notes (optional)</span>
                <textarea
                  placeholder="Additional notes"
                  rows="4"
                  value={form.additional_notes}
                  onChange={handleChange('additional_notes')}
                />
              </label>
            </div>
          </section>

          {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Submitting...' : editingTicketId ? 'Save Changes' : 'Submit Request'}
            </button>
            <button type="button" className="btn btn-outline-danger" onClick={() => navigate('/user/home')}>
              Cancel
            </button>
          </div>
        </form>

        {showSuccessModal ? (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="ticket-success-title">
            <div className="modal success-modal">
              <div className="success-modal-icon" aria-hidden="true">
                <i className="bi bi-check-lg" />
              </div>
              <h2 id="ticket-success-title" className="success-modal-title">
                {editingTicketId ? 'Changes Saved' : 'Request Sent'}
              </h2>
              <p className="success-modal-message">
                {editingTicketId
                  ? 'Your ticket request was updated successfully.'
                  : "Your travel request was sent successfully. We'll notify the office coordinator."}
              </p>
              <div className="success-modal-actions">
                <button
                  type="button"
                  className="btn btn-brand"
                  onClick={() => {
                    setShowSuccessModal(false)
                    navigate('/user/ticket-history')
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

export default TicketRequest
