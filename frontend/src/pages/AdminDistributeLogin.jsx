import { useState } from 'react'
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

function parseEmails(value) {
  return value.split(/[\n,;]+/).map((email) => email.trim()).filter(Boolean)
}

function AdminDistributeLogin() {
  const [emailText, setEmailText] = useState('')
  const { collapsed: isSidebarCollapsed, toggle: toggleSidebar } = useOfficeSidebar()
  const [role, setRole] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const emails = parseEmails(emailText)

  const submit = async (event) => {
    event.preventDefault()
    if (!role) {
      setError('Select a role before entering email addresses.')
      return
    }
    if (!emails.length) {
      setError('Enter at least one email address.')
      return
    }
    if (emails.length > 100) {
      setError('A maximum of 100 email addresses can be sent at once.')
      return
    }

    setSending(true)
    setError('')
    setResult(null)
    try {
      const response = await fetch(`${API_BASE_URL}/users/distribute-account`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails, role }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.detail || 'Failed to distribute account invitations.')
      setResult(data)
      if (data.failed === 0) setEmailText('')
    } catch (requestError) {
      setError(requestError.message || 'Network error. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <MainLayout title="Distribute Account">
      <div className={`office-quick-view fixed-sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
         <aside className="office-sidebar visible">
          <div className="sidebar-header">
            <span className="sidebar-role">Super Admin</span>
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
            {menuItems.map((menuItem) => (
              <button
                key={menuItem.label}
                type="button"
                className={`sidebar-item ${menuItem.label === 'Manage User' ? 'active' : ''}`}
                
                aria-label={menuItem.label}
                title={menuItem.label}
              >
                <i className={`bi ${menuItem.icon} sidebar-item__icon`} aria-hidden="true" />
                <span className="sidebar-item__label">{menuItem.label}</span>
              </button>
            ))}
          </nav>
        </aside>

      <section className="office-content  distribute-login-settings">
        <header className="office-header"><h1>Distribute Account</h1></header>
        <form className="ticket-form distribute-login-form" onSubmit={submit}>
          <section className="field-group">
            <div className="field-heading">
              <span className="heading-icon" aria-hidden="true"><i className="bi bi-envelope-plus" /></span>
              <div>
                <h2>Account invitation</h2>
                <p className="muted">Choose the role first, then create accounts and send each recipient a one-time link to set their password. Department and job position can be completed later in Manage User. Each link expires in 1 hour.</p>
              </div>
            </div>
            <label className="form-field">
              <span>Role</span>
              <select value={role} onChange={(event) => setRole(event.target.value)} disabled={sending} required>
                <option value="" disabled>Select role</option>
                <option value="user">Employee</option>
                <option value="driver">Driver</option>
                <option value="office_coordinator">Office Coordinator</option>
                <option value="superadmin">Super Admin</option>
              </select>
            </label>
            <label className="form-field">
              <span>Email addresses</span>
              <textarea value={emailText} onChange={(event) => setEmailText(event.target.value)} placeholder={'employee.one@example.com\nemployee.two@example.com'} rows="8" disabled={sending} required />
              <small className="muted">One email per line. You can also separate email addresses with commas. The selected role will be assigned to every account.</small>
            </label>
            <div className="admin-settings__preview">
              <i className="bi bi-info-circle" aria-hidden="true" />
              <span>{emails.length} email{emails.length === 1 ? '' : 's'} ready to send (maximum 100).</span>
            </div>
            {error ? <p className="error-text">{error}</p> : null}
            {result ? (
              <div className="distribute-login-result" aria-live="polite">
                <p className="success-text">{result.created} invitation{result.created === 1 ? '' : 's'} sent.</p>
                {result.failed ? <p className="error-text">{result.failed} email{result.failed === 1 ? '' : 's'} could not be sent.</p> : null}
                {Array.isArray(result.results) && result.results.some((item) => item.status === 'failed') ? (
                  <ul>
                    {result.results.filter((item) => item.status === 'failed').map((item) => <li key={`${item.email}-${item.message}`}>{item.email}: {item.message}</li>)}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={sending || !emails.length}>
                <i className="bi bi-send" aria-hidden="true" />
                {sending ? 'Sending invitations...' : 'Create Accounts & Send Invitations'}
              </button>
            </div>
          </section>
        </form>
      </section>
      </div>
    </MainLayout>
  )
}

export default AdminDistributeLogin
