import { useRef, useState } from 'react'
import { API_BASE_URL } from '../config'
import useRequestEditPermissions from '../hooks/useRequestEditPermissions'

const roles = [['user', 'Employee'], ['office_coordinator', 'Office Coordinator'], ['superadmin', 'Super Admin']]

export default function RequestEditPermissions() {
  const { permissions, error: loadError, reload } = useRequestEditPermissions()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const pending = useRef(false)
  const toggle = async (role, label) => {
    if (pending.current || !permissions) return
    pending.current = true
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`${API_BASE_URL}/settings/request-edit-permissions`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, enabled: !permissions[role] }),
      })
      if (!response.ok) throw new Error('Failed to save edit permissions. Please try again.')
      setMessage(`${label} editing turned ${permissions[role] ? 'OFF' : 'ON'}.`)
      await reload()
    } catch (error) {
      setError(error.message || 'Network error. Please try again.')
    } finally {
      pending.current = false
      setSaving(false)
    }
  }
  return (
    <section className="field-group" aria-labelledby="request-edit-permissions-title">
      <div className="field-heading">
        <span className="heading-icon" aria-hidden="true"><i className="bi bi-pencil-square" /></span>
        <div>
          <h2 id="request-edit-permissions-title">Edit permissions</h2>
          <p className="muted">Allow editing Booking Driver and Travel Requests by role. Existing role and status rules still apply.</p>
        </div>
      </div>
      {!permissions && !loadError ? <p className="muted">Loading edit permissions...</p> : null}
      <div className="request-edit-permissions">
        {roles.map(([role, label]) => (
          <div className="request-edit-permissions__row" key={role}>
            <span>{label}</span>
            <button type="button" role="switch" aria-label={`${label} edit permission`}
              aria-checked={permissions?.[role] === true}
              className={`driver-availability-toggle ${permissions?.[role] ? 'is-on' : 'is-off'}`}
              disabled={!permissions || saving} onClick={() => toggle(role, label)}>
              <i className={`bi ${permissions?.[role] ? 'bi-toggle-on' : 'bi-toggle-off'}`} aria-hidden="true" />
              {permissions ? permissions[role] ? 'ON' : 'OFF' : '...'}
            </button>
          </div>
        ))}
      </div>
      {loadError || error ? <p className="error-text" role="alert">{loadError || error}</p> : null}
      {loadError ? <button type="button" className="btn btn-neutral" onClick={reload} disabled={saving}>Retry</button> : null}
      {message ? <p className="success-text" role="status">{message}</p> : null}
    </section>
  )
}
