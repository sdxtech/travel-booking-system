import { useEffect, useState } from 'react'
import MainLayout from '../components/MainLayout'
import { API_BASE_URL } from '../config'

function formatTime(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' }) : '-'
}

function formatDetails(details) {
  const changes = Array.isArray(details?.changes) ? details.changes : []
  const changeLabels = changes.map((change) => {
    const field = String(change.field || '').replace(/_/g, ' ')
    const before = formatDetailValue(change.before)
    const after = formatDetailValue(change.after)
    return `${field}: ${before} → ${after}`
  })
  const entries = Object.entries(details || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
  const otherDetails = entries
    .filter(([key]) => key !== 'changes')
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${formatDetailValue(value)}`)
  return [...changeLabels, ...otherDetails].join(' • ') || '-'
}

function formatDetailValue(value) {
  if (value === undefined || value === null || value === '') return '(empty)'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function describeActivity(action, path) {
  if (action === 'Account invitation') return 'Distribute Account Invitation'
  const key = action || path || ''
  const activities = [
    [/POST \/auth\/login/, 'Login'],
    [/POST \/auth\/logout/, 'Logout'],
    [/POST \/auth\/forgot-password/, 'Request Password Reset'],
    [/POST \/auth\/reset-password/, 'Set / Reset Password'],
    [/PATCH \/auth\/change-password/, 'Change Password'],
    [/POST \/bookings\/assign/, 'Create & Approve Booking Driver'],
    [/POST \/bookings$/, 'Submit Booking Driver Request'],
    [/PATCH \/bookings\/[^/]+\/status/, 'Update Booking Driver Status'],
    [/PATCH \/bookings\/[^/]+\/cancel$/, 'Cancel Booking Driver Request'],
    [/PATCH \/bookings\/[^/]+\/cancellation-review/, 'Review Booking Cancellation'],
    [/PATCH \/bookings\/[^/]+\/start/, 'Start Booking Driver Trip'],
    [/PATCH \/bookings\/[^/]+\/complete/, 'Finish Booking Driver Trip'],
    [/PATCH \/bookings\/[^/]+\/validate-completion/, 'Validate Booking Driver Completion'],
    [/PATCH \/bookings\/[^/]+$/, 'Edit Booking Driver Request'],
    [/POST \/tickets\/accommodation/, 'Create Travel Request'],
    [/POST \/tickets$/, 'Submit Travel Request'],
    [/PATCH \/tickets\/[^/]+\/status/, 'Update Travel Request Status'],
    [/PATCH \/tickets\/[^/]+\/cancel$/, 'Cancel Travel Request'],
    [/PATCH \/tickets\/[^/]+$/, 'Edit Travel Request'],
    [/POST \/users\/distribute-account/, 'Distribute Account Batch'],
    [/POST \/users\/import/, 'Import Users'],
    [/POST \/users$/, 'Create User'],
    [/PATCH \/users\/[^/]+\/password/, 'Reset User Password'],
    [/PATCH \/users\/[^/]+\/deactivate/, 'Deactivate User'],
    [/PATCH \/users\/[^/]+$/, 'Update User'],
    [/DELETE \/users\//, 'Delete User'],
    [/PATCH \/settings\/booking-cancellation/, 'Update Cancellation Settings'],
    [/PATCH \/settings\/drivers\//, 'Update Driver Availability'],
    [/PUT \/pages\/permissions/, 'Update Page Permissions'],
    [/POST \/locations$/, 'Add Location Point'],
    [/PATCH \/locations\//, 'Update Location Point'],
    [/DELETE \/locations\//, 'Delete Location Point'],
    [/POST \/telegram\/connect/, 'Connect Telegram'],
    [/DELETE \/telegram\/connection/, 'Disconnect Telegram'],
    [/PATCH \/notifications\//, 'Update Notification'],
  ]
  const match = activities.find(([pattern]) => pattern.test(key))
  return match ? match[1] : action || 'Unknown activity'
}

function AdminAuditLog() {
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const pageSize = 25

  useEffect(() => {
    const controller = new AbortController()
    const loadLogs = async () => {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
        if (appliedSearch) params.set('search', appliedSearch)
        const response = await fetch(`${API_BASE_URL}/audit-logs?${params}`, { credentials: 'include', signal: controller.signal })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload?.detail || 'Failed to load audit logs.')
        setData({ items: Array.isArray(payload.items) ? payload.items : [], total: Number(payload.total) || 0 })
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message || 'Network error. Please try again.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    loadLogs()
    return () => controller.abort()
  }, [appliedSearch, page])

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize))
  const applySearch = (event) => {
    event.preventDefault()
    setPage(1)
    setAppliedSearch(search.trim())
  }

  return (
    <MainLayout title="Audit Log">
      <section className="office-content admin-settings audit-log-settings">
        <header className="office-header"><h1>Audit Log</h1></header>
        <form className="form-actions audit-log-toolbar" onSubmit={applySearch}>
          <label className="history-search">
            <i className="bi bi-search" aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search user, activity, email, or target..." aria-label="Search audit logs" />
          </label>
          <button type="submit" className="btn btn-primary">Search</button>
        </form>
        {error ? <p className="error-text">{error}</p> : null}
        <div className="office-table-wrapper">
          <table className="office-table audit-log-table">
            <thead><tr><th>Time</th><th>Actor</th><th>Role</th><th>Activity</th><th>Target</th><th>Status</th><th>Details</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="7" className="muted">Loading audit logs...</td></tr> : null}
              {!loading && !data.items.length ? <tr><td colSpan="7" className="muted">No audit activity found.</td></tr> : null}
              {!loading && data.items.map((item) => <tr key={item.id}>
                <td>{formatTime(item.created_at)}</td><td>{item.actor_email || 'System / unauthenticated'}</td><td>{item.actor_role || '-'}</td>
                <td>{describeActivity(item.action, item.path)}</td><td>{item.target || item.path || '-'}</td><td><span className={`audit-status audit-status--${item.status}`}>{item.status}</span></td><td>{formatDetails(item.details)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="pagination audit-log-pagination">
          <button type="button" className="btn btn-secondary" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Prev</button>
          <span>Page {page} of {totalPages} · {data.total} records</span>
          <button type="button" className="btn btn-secondary" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)}>Next</button>
        </div>
      </section>
    </MainLayout>
  )
}

export default AdminAuditLog
