import { useEffect, useState } from 'react'
import MainLayout from '../components/MainLayout'
import { API_BASE_URL } from '../config'

function formatTime(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '-'
}

function formatDetails(details) {
  const entries = Object.entries(details || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
  return entries.length ? entries.map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`).join(' • ') : '-'
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
                <td>{item.action}</td><td>{item.target || item.path || '-'}</td><td><span className={`audit-status audit-status--${item.status}`}>{item.status}</span></td><td>{formatDetails(item.details)}</td>
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
