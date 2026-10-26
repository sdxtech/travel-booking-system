import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { API_BASE_URL } from '../config'

const fields = [
  { key: 'requester_name', label: 'Name', required: true },
  { key: 'requester_department', label: 'Department' },
  { key: 'requester_job_position', label: 'Title/Position' },
  { key: 'requester_nik', label: 'NIK / National ID (optional)' },
  { key: 'requester_phone', label: 'Phone/WA', type: 'tel', required: true },
  { key: 'requester_email', label: 'Email', type: 'email', required: true },
]

export default function BookingRequesterEditModal({ booking, onClose, onSaved }) {
  const [form, setForm] = useState(() => Object.fromEntries(fields.map(({ key }) => [
    key,
    key === 'requester_department'
      ? booking.requester_department ?? booking.requester_dept_job_position ?? ''
      : booking[key] ?? '',
  ])))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const requestInFlight = useRef(false)
  const dialogRef = useRef(null)

  useEffect(() => {
    const previousFocus = document.activeElement
    dialogRef.current?.querySelector('input')?.focus()
    return () => previousFocus?.focus()
  }, [])

  const close = () => {
    if (!requestInFlight.current) onClose()
  }

  const submit = async (event) => {
    event.preventDefault()
    if (requestInFlight.current) return
    const payload = Object.fromEntries(fields.map(({ key }) => [key, form[key].trim()]))
    if (fields.some(({ key, required }) => required && !payload[key])) {
      setError('Name, Phone/WA, and Email are required.')
      return
    }
    requestInFlight.current = true
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/bookings/${booking.id}/requester`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setError(Array.isArray(data?.detail)
          ? data.detail.map((item) => item.msg || 'Invalid field').join('; ')
          : typeof data?.detail === 'string' ? data.detail : 'Failed to update booking user data.')
        return
      }
      if (!data?.id) {
        setError('Could not confirm the update. Please reopen this booking to check its data.')
        return
      }
      onSaved(data)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      requestInFlight.current = false
      setSaving(false)
    }
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
    if (event.key === 'Tab') {
      const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled)')]
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!first) event.preventDefault()
      else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  return createPortal(
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-requester-edit-title"
      aria-describedby="booking-requester-edit-note"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}
      onKeyDown={handleKeyDown}
    >
      <form ref={dialogRef} className="modal booking-requester-edit-modal" onSubmit={submit} aria-busy={saving}>
        <div className="modal-header">
          <div>
            <h2 id="booking-requester-edit-title">Edit User Data</h2>
            <p className="muted">{booking.request_id || 'Booking Driver'}</p>
          </div>
          <button type="button" className="modal-close" onClick={close} disabled={saving} aria-label="Close">
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>
        <div className="booking-requester-edit-modal__body">
          <p id="booking-requester-edit-note" className="muted">Changes apply to this booking only. The user account and linked Employee stay unchanged.</p>
          <div className="booking-requester-edit-modal__fields">
            {fields.map(({ key, label, type = 'text', required = false }) => (
              <label className="inline-label" key={key}>
                <span>{label}{required ? ' *' : ''}</span>
                <input
                  type={type}
                  value={form[key]}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                  required={required}
                  disabled={saving}
                />
              </label>
            ))}
          </div>
          {error ? <p className="error-text" role="alert">{error}</p> : null}
        </div>
        <div className="modal-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
          <button type="button" className="btn btn-outline-danger" onClick={close} disabled={saving}>Cancel</button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
