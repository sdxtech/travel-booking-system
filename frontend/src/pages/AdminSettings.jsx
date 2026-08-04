import { useEffect, useState } from 'react'
import MainLayout from '../components/MainLayout'
import { API_BASE_URL } from '../config'

const initialPolicy = {
  value: '1',
  unit: 'days',
  cutoff_time: '17:00',
}

function getPolicyLabel(policy) {
  const value = Number(policy.value) || 1
  if (policy.unit === 'hours') {
    return `${value} ${value === 1 ? 'hour' : 'hours'} before departure`
  }
  return `${value} ${value === 1 ? 'day' : 'days'} before departure at ${policy.cutoff_time || '17:00'} WIB`
}

// Super Admin configuration for the Employee booking cancellation cutoff.
function AdminSettings() {
  const [policy, setPolicy] = useState(initialPolicy)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const loadPolicy = async () => {
      const token = localStorage.getItem('authToken')
      if (!token) {
        setError('Authentication token not found. Please login again.')
        setLoading(false)
        return
      }

      try {
        const response = await fetch(`${API_BASE_URL}/settings/booking-cancellation`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          setError(data?.detail || 'Failed to load cancellation settings.')
          return
        }

        const data = await response.json()
        setPolicy({
          value: String(data.value || 1),
          unit: data.unit === 'hours' ? 'hours' : 'days',
          cutoff_time: data.cutoff_time || '17:00',
        })
      } catch {
        setError('Network error. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    loadPolicy()
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    const value = Number.parseInt(policy.value, 10)
    const maximumValue = policy.unit === 'days' ? 365 : 8760

    if (!Number.isInteger(value) || value < 1 || value > maximumValue) {
      setError(`Enter a value between 1 and ${maximumValue}.`)
      setSuccess('')
      return
    }

    const token = localStorage.getItem('authToken')
    if (!token) {
      setError('Authentication token not found. Please login again.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const response = await fetch(`${API_BASE_URL}/settings/booking-cancellation`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value, unit: policy.unit, cutoff_time: policy.cutoff_time }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError(data?.detail || 'Failed to save cancellation settings.')
        return
      }

      const updated = await response.json()
      const nextPolicy = {
        value: String(updated.value),
        unit: updated.unit,
        cutoff_time: updated.cutoff_time || '17:00',
      }
      setPolicy(nextPolicy)
      setSuccess(`Cancellation deadline updated to ${getPolicyLabel(nextPolicy)}.`)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <MainLayout title="Cancel Booking Driver Settings">
      <section className="office-content admin-settings">
        <header className="office-header">
          <p className="eyebrow">Settings</p>
          <h1>Cancel Booking Driver</h1>
          <p className="muted">Set how long before departure an Employee may cancel a pending driver booking.</p>
        </header>

        <form className="ticket-form admin-settings__form" onSubmit={handleSubmit}>
          <section className="field-group">
            <div className="field-heading">
              <span className="heading-icon" aria-hidden="true">
                <i className="bi bi-calendar-x" />
              </span>
              <div>
                <h2>Cancellation deadline</h2>
                <p className="muted">Use a rolling duration in hours, or a specific Jakarta cutoff time on a prior day.</p>
              </div>
            </div>

            <div className="field-grid">
              <label className="form-field">
                <span>Minimum time before departure</span>
                <input
                  type="number"
                  min="1"
                  max={policy.unit === 'days' ? '365' : '8760'}
                  step="1"
                  value={policy.value}
                  onChange={(event) => setPolicy((prev) => ({ ...prev, value: event.target.value }))}
                  disabled={loading || saving}
                  required
                />
              </label>

              <label className="form-field">
                <span>Unit</span>
                <select
                  value={policy.unit}
                  onChange={(event) => setPolicy((prev) => ({ ...prev, unit: event.target.value }))}
                  disabled={loading || saving}
                >
                  <option value="hours">Hour(s)</option>
                  <option value="days">Day(s)</option>
                </select>
              </label>

              {policy.unit === 'days' ? (
                <label className="form-field">
                  <span>Cutoff time (WIB)</span>
                  <input
                    type="time"
                    value={policy.cutoff_time}
                    onChange={(event) => setPolicy((prev) => ({ ...prev, cutoff_time: event.target.value }))}
                    disabled={loading || saving}
                    required
                  />
                </label>
              ) : null}
            </div>

            <div className="admin-settings__preview">
              <i className="bi bi-info-circle" aria-hidden="true" />
              <span>
                Employees can cancel a pending booking until {getPolicyLabel(policy)}.
              </span>
            </div>

            {error ? <p className="error-text">{error}</p> : null}
            {success ? <p className="success-text">{success}</p> : null}

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={loading || saving}>
                <i className="bi bi-floppy" aria-hidden="true" />
                {saving ? 'Saving...' : loading ? 'Loading...' : 'Save settings'}
              </button>
            </div>
          </section>
        </form>
      </section>
    </MainLayout>
  )
}

export default AdminSettings
