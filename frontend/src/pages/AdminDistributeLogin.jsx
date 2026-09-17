import { useState } from 'react'
import MainLayout from '../components/MainLayout'
import { API_BASE_URL } from '../config'

function parseEmails(value) {
  return value.split(/[\n,;]+/).map((email) => email.trim()).filter(Boolean)
}

function AdminDistributeLogin() {
  const [emailText, setEmailText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const emails = parseEmails(emailText)

  const submit = async (event) => {
    event.preventDefault()
    if (!emails.length) {
      setError('Enter at least one Employee email address.')
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
      const response = await fetch(`${API_BASE_URL}/users/distribute-login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.detail || 'Failed to distribute login invitations.')
      setResult(data)
      if (data.failed === 0) setEmailText('')
    } catch (requestError) {
      setError(requestError.message || 'Network error. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <MainLayout title="Distribute Login">
      <section className="office-content admin-settings distribute-login-settings">
        <header className="office-header"><h1>Distribute Login</h1></header>
        <form className="ticket-form distribute-login-form" onSubmit={submit}>
          <section className="field-group">
            <div className="field-heading">
              <span className="heading-icon" aria-hidden="true"><i className="bi bi-envelope-plus" /></span>
              <div>
                <h2>Employee login invitation</h2>
                <p className="muted">Create Employee accounts and send each recipient a one-time link to set their password. Department and job position can be completed later in Manage User. Each link expires in 1 hour.</p>
              </div>
            </div>
            <label className="form-field">
              <span>Employee email addresses</span>
              <textarea value={emailText} onChange={(event) => setEmailText(event.target.value)} placeholder={'employee.one@example.com\nemployee.two@example.com'} rows="8" disabled={sending} required />
              <small className="muted">One email per line. You can also separate email addresses with commas. Role: Employee.</small>
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
    </MainLayout>
  )
}

export default AdminDistributeLogin
