import { useEffect, useState } from 'react'
import MainLayout from '../components/MainLayout'
import { API_BASE_URL } from '../config'
import useOfficeSidebar from '../hooks/useOfficeSidebar'

const menuItems = [
  { label: 'Quick View', icon: 'bi-speedometer2' },
  { label: 'Travel Status & History', icon: 'bi-clock-history' },
  { label: 'Travel Assign', icon: 'bi-building' },
  { label: 'Booking Driver Status & History', icon: 'bi-card-list' },
  { label: 'Booking Driver Assign', icon: 'bi-person-check' },
  { label: 'Manage User', icon: 'bi-people' },
]

const initialPolicy = {
  auto_approve: true,
  deadline_enabled: true,
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
   const { collapsed: isSidebarCollapsed, toggle: toggleSidebar } = useOfficeSidebar()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const loadPolicy = async () => {


      try {
        const response = await fetch(`${API_BASE_URL}/settings/booking-cancellation`, {
          credentials:'include',
        })
        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          setError(data?.detail || 'Failed to load cancellation settings.')
          return
        }

        const data = await response.json()
        setPolicy({
          auto_approve: data.auto_approve !== false,
          deadline_enabled: data.deadline_enabled !== false,
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



    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const response = await fetch(`${API_BASE_URL}/settings/booking-cancellation`, {
        method: 'PATCH',
        headers: {

          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ value, unit: policy.unit, cutoff_time: policy.cutoff_time, auto_approve: policy.auto_approve, deadline_enabled: policy.deadline_enabled }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError(data?.detail || 'Failed to save cancellation settings.')
        return
      }

      const updated = await response.json()
      const nextPolicy = {
        auto_approve: updated.auto_approve !== false,
        deadline_enabled: updated.deadline_enabled !== false,
        value: String(updated.value),
        unit: updated.unit,
        cutoff_time: updated.cutoff_time || '17:00',
      }
      setPolicy(nextPolicy)
      setSuccess('Cancellation settings saved.')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <MainLayout title="Cancel Booking Driver Settings">
      <div className={`office-quick-view fixed-sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
         <aside className="office-sidebar visible">
          <div className="sidebar-header">
            <span className="sidebar-role"></span>
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
               
                aria-label={item.label}
                title={item.label}
              >
                <i className={`bi ${item.icon} sidebar-item__icon`} aria-hidden="true" />
                <span className="sidebar-item__label">{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

      <section className="office-content ">
        <header className="office-header">
        
          <h1>Cancel Booking Driver</h1>
          
        </header>

        <form className="ticket-form admin-settings__form" onSubmit={handleSubmit}>
          <section className="field-group cancellation-auto-approve">
            <h2>Auto-approve Employee cancellation</h2>
            <button
              type="button"
              role="switch"
              aria-label="Auto-approve Employee cancellation"
              aria-checked={policy.auto_approve}
              className={`driver-availability-toggle ${policy.auto_approve ? 'is-on' : 'is-off'}`}
              disabled={loading || saving}
              onClick={() => setPolicy((prev) => ({ ...prev, auto_approve: !prev.auto_approve }))}
            >
              <i className={`bi ${policy.auto_approve ? 'bi-toggle-on' : 'bi-toggle-off'}`} aria-hidden="true" />
              <span>{policy.auto_approve ? 'On' : 'Off'}</span>
            </button>
            <p className="muted">
              {policy.auto_approve
                ? 'Eligible cancellations are approved immediately.'
                : 'Requires Office Coordinator approval. Booking stays active until approved.'}
            </p>
          </section>
          <section className="field-group">
            <div className="field-heading">
              <div className='field-heading-2'>

              <div className="heading-icon" aria-hidden="true">
                <i className="bi bi-calendar-x" />
              </div>
              <div className="cancellation-deadline-heading">
                <h2>Cancellation deadline</h2>
                <p className="muted">{policy.deadline_enabled ? 'Use a rolling duration in hours, or a specific Jakarta cutoff time on a prior day.' : 'Eligible Employee cancellations are not restricted by a time cutoff.'}</p>
              </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="Cancellation deadline"
                aria-checked={policy.deadline_enabled}
                className={`driver-availability-toggle ${policy.deadline_enabled ? 'is-on' : 'is-off'}`}
                disabled={loading || saving}
                onClick={() => setPolicy((prev) => ({ ...prev, deadline_enabled: !prev.deadline_enabled }))}
              >
                <i className={`bi ${policy.deadline_enabled ? 'bi-toggle-on' : 'bi-toggle-off'}`} aria-hidden="true" />
                <span>{policy.deadline_enabled ? 'On' : 'Off'}</span>
              </button>
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
                  disabled={loading || saving || !policy.deadline_enabled}
                  required
                />
              </label>

              <label className="form-field">
                <span>Unit</span>
                <select
                  value={policy.unit}
                  onChange={(event) => setPolicy((prev) => ({ ...prev, unit: event.target.value }))}
                  disabled={loading || saving || !policy.deadline_enabled}
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
                    disabled={loading || saving || !policy.deadline_enabled}
                    required
                  />
                </label>
              ) : null}
            </div>

            <div className="admin-settings__preview">
              <i className="bi bi-info-circle" aria-hidden="true" />
              <span>{policy.deadline_enabled
                ? `Employees can cancel a pending or approved booking until ${getPolicyLabel(policy)}.`
                : 'Cancellation deadline is off. Employees can cancel eligible pending or approved bookings without a time cutoff.'}</span>
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
      </div>
    </MainLayout>
  )
}

export default AdminSettings
