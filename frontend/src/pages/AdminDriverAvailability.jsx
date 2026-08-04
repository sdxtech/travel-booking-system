import { useEffect, useState } from 'react'
import MainLayout from '../components/MainLayout'
import { API_BASE_URL } from '../config'

// Super Admin control for allowing or pausing drivers from receiving new bookings.
function AdminDriverAvailability() {
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const loadDrivers = async () => {
      const token = localStorage.getItem('authToken')
      if (!token) {
        setError('Authentication token not found. Please login again.')
        setLoading(false)
        return
      }

      try {
        const response = await fetch(`${API_BASE_URL}/settings/drivers`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          setError(data?.detail || 'Failed to load drivers.')
          return
        }

        const data = await response.json()
        setDrivers(Array.isArray(data) ? data : [])
      } catch {
        setError('Network error. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    loadDrivers()
  }, [])

  const toggleDriver = async (driver) => {
    const token = localStorage.getItem('authToken')
    if (!token) {
      setError('Authentication token not found. Please login again.')
      return
    }

    const nextEnabled = !driver.booking_enabled
    setUpdatingId(driver.driver_id)
    setError('')
    setSuccess('')
    try {
      const response = await fetch(`${API_BASE_URL}/settings/drivers/${driver.driver_id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ booking_enabled: nextEnabled }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError(data?.detail || 'Failed to update driver availability.')
        return
      }

      const updated = await response.json()
      setDrivers((current) => current.map((item) => (item.driver_id === updated.driver_id ? updated : item)))
      setSuccess(`${updated.name || updated.email || 'Driver'} is now ${updated.booking_enabled ? 'On' : 'Off'} for new bookings.`)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setUpdatingId('')
    }
  }

  return (
    <MainLayout title="Driver Availability Settings">
      <section className="office-content admin-settings driver-availability-settings">
        <header className="office-header">
          <p className="eyebrow">Settings</p>
          <h1>Driver Availability</h1>
          <p className="muted">Turn a driver off temporarily so they cannot receive new bookings, then turn them on again when ready.</p>
        </header>

        <div className="admin-settings__preview">
          <i className="bi bi-info-circle" aria-hidden="true" />
          <span>Turning a driver off does not disable their login or remove existing tasks and calendar schedules.</span>
        </div>

        <div className="driver-availability-feedback" aria-live="polite">
          {error ? <p className="error-text">{error}</p> : null}
          {!error && success ? <p className="success-text">{success}</p> : null}
        </div>
        {loading ? <p className="muted">Loading drivers...</p> : null}

        {!loading && !error ? (
          <div className="table-wrapper">
            <table className="simple-table driver-availability-table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Email</th>
                  <th>Availability</th>
                </tr>
              </thead>
              <tbody>
                {drivers.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="muted">No drivers found.</td>
                  </tr>
                ) : (
                  drivers.map((driver) => {
                    const isUpdating = updatingId === driver.driver_id
                    const isAvailable = driver.booking_enabled
                    return (
                      <tr key={driver.driver_id}>
                        <td>{driver.name || '-'}</td>
                        <td>{driver.email || '-'}</td>
                        <td>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isAvailable}
                            className={`driver-availability-toggle ${isAvailable ? 'is-on' : 'is-off'}`}
                            onClick={() => toggleDriver(driver)}
                            disabled={Boolean(updatingId)}
                            title={
                              driver.account_disabled
                                ? `Super Admin override: turn booking availability ${isAvailable ? 'Off' : 'On'} while the account is disabled`
                                : isAvailable
                                  ? 'Turn driver Off'
                                  : 'Turn driver On'
                            }
                            aria-busy={isUpdating}
                          >
                            <i className={`bi ${isAvailable ? 'bi-toggle-on' : 'bi-toggle-off'}`} aria-hidden="true" />
                            <span>{isAvailable ? 'On' : 'Off'}</span>
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </MainLayout>
  )
}

export default AdminDriverAvailability
