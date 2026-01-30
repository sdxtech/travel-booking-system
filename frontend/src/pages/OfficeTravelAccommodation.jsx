import { useState } from 'react'
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
  full_name: '',
  dept_job_position: '',
  phone_number: '',
  email: '',
  national_id: '',
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

// Create a travel request on behalf of a user (office coordinator flow).
function OfficeTravelAccommodation() {
  const navigate = useNavigate()
  const { collapsed: isSidebarCollapsed, toggle: toggleSidebar } = useOfficeSidebar()
  const isSuperadmin = localStorage.getItem('authRole') === 'superadmin'
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [showSuccessModal, setShowSuccessModal] = useState(false)

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

  // Update form fields and clear dependent values when options change.
  const handleChange = (field) => (event) => {
    const value = event.target.value
    setForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'hotel_accommodation' && value === 'no'
        ? { hotel_name: '', hotel_location: '' }
        : null),
      ...(field === 'transportation_mode' && value !== 'other' ? { transportation_other: '' } : null),
    }))
  }

  // Submit the travel accommodation request.
  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setSuccessMessage('')
    setErrorMessage('')
    setShowSuccessModal(false)

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

    try {
      const response = await fetch(`${API_BASE_URL}/tickets/accommodation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let detail = 'Failed to submit travel request.'
        try {
          const data = await response.json()
          if (data?.detail) detail = data.detail
        } catch {
          // ignore parse error
        }
        setErrorMessage(detail)
      } else {
        setSuccessMessage('Travel request submitted. Awaiting approval.')
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
    <MainLayout title="Travel Assign">
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
                className={`sidebar-item ${item.label === 'Travel Assign' ? 'active' : ''}`}
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
            <p className="eyebrow">Travel Assign</p>
            <h1>Create Travel Accommodation</h1>
            <p className="muted">Create a travel request on behalf of a user (will appear in Travel Requests for approval).</p>
          </header>

          <form className="ticket-form" onSubmit={handleSubmit}>
            <section className="field-group">
            <div className="field-heading">
              <div className="heading-icon" aria-hidden="true">
                <i className="bi bi-person-badge" />
              </div>
              <div>
                <h2>Identity & Contact Information</h2>
                <p className="muted">Who is traveling</p>
              </div>
            </div>
              <div className="field-grid">
                <label className="inline-label">
                  <span>Full name</span>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={form.full_name}
                    onChange={handleChange('full_name')}
                    required
                  />
                </label>
                <label className="inline-label">
                  <span>User Dept/Job Position</span>
                  <input
                    type="text"
                    placeholder="User Dept/Job Position"
                    value={form.dept_job_position}
                    onChange={handleChange('dept_job_position')}
                    required
                  />
                </label>
                <label className="inline-label">
                  <span>Phone number</span>
                  <input
                    type="tel"
                    placeholder="Phone Number"
                    value={form.phone_number}
                    onChange={handleChange('phone_number')}
                    required
                  />
                </label>
                <label className="inline-label">
                  <span>Email</span>
                  <input
                    type="email"
                    placeholder="Email address"
                    value={form.email}
                    onChange={handleChange('email')}
                    required
                  />
                </label>
                <label className="inline-label">
                  <span>National ID</span>
                  <input
                    type="text"
                    placeholder="National ID"
                    value={form.national_id}
                    onChange={handleChange('national_id')}
                    required
                  />
                </label>
              </div>
            </section>

            <section className="field-group">
            <div className="field-heading">
              <div className="heading-icon" aria-hidden="true">
                <i className="bi bi-airplane" />
              </div>
              <div>
                <h2>Travel Details</h2>
                <p className="muted">Where and when the travel happens</p>
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
                <p className="muted">Hotel and ride details</p>
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
                      />
                    </label>
                    <label className="inline-label">
                      <span>Hotel location</span>
                      <input
                        type="text"
                        placeholder="Hotel location"
                        value={form.hotel_location}
                        onChange={handleChange('hotel_location')}
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
                      required
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
                <h2>Approval & Notes</h2>
                <p className="muted">Approval evidence and additional notes</p>
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

            {successMessage ? <p className="success-text">{successMessage}</p> : null}
            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Submitting...' : 'Submit Request'}
              </button>
              <button type="button" className="btn btn-neutral" onClick={() => navigate('/office/ticket-requests')}>
                View Travel Requests
              </button>
            </div>
          </form>

          {showSuccessModal ? (
            <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="accommodation-success-title">
              <div className="modal success-modal">
                <div className="success-modal-icon" aria-hidden="true">
                  <i className="bi bi-check-lg" />
                </div>
                <h2 id="accommodation-success-title" className="success-modal-title">
                  Submitted
                </h2>
                <p className="success-modal-message">
                  Travel request was submitted successfully. It will appear in Travel Requests for approval.
                </p>
                <div className="success-modal-actions">
                  <button
                    type="button"
                    className="btn btn-brand"
                    onClick={() => {
                      setShowSuccessModal(false)
                      navigate('/office/ticket-requests')
                    }}
                  >
                    View Travel Requests
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

export default OfficeTravelAccommodation
