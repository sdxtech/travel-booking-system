import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { API_BASE_URL } from '../config'

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

async function responseError(response, fallback) {
  const data = await response.json().catch(() => null)
  if (Array.isArray(data?.detail)) return data.detail.map((item) => item.msg || 'Invalid field').join('; ')
  return typeof data?.detail === 'string' ? data.detail : fallback
}

// Each button mounts a fresh dialog for one operation; there is no mode toggle.
function UserBulkUploadModal({ mode, isSuperadmin = false, onClose, onComplete }) {
  const isUpdate = mode === 'update'
  const endpoint = isUpdate ? '/users/mass-update' : '/users/import'
  const title = isUpdate ? 'Mass Update Users' : 'Import Users'
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const requestInFlight = useRef(false)
  const busy = uploading || downloading
  const titleId = isUpdate ? 'user-mass-update-title' : 'user-import-title'

  const submit = async (event) => {
    event.preventDefault()
    if (requestInFlight.current) return
    if (!file) {
      setError('Please choose an Excel (.xlsx) or CSV (.csv) file.')
      return
    }
    requestInFlight.current = true
    setUploading(true)
    setError('')
    setResult(null)
    try {
      const fileBase64 = await readFileAsBase64(file)
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, file_base64: fileBase64 }),
      })
      if (!response.ok) {
        setError(await responseError(response, isUpdate ? 'Failed to update users.' : 'Failed to import users.'))
        return
      }
      setResult(await response.json())
      await onComplete()
    } catch {
      setError('Network or file error. Please try again.')
    } finally {
      requestInFlight.current = false
      setUploading(false)
    }
  }

  const downloadTemplate = async () => {
    if (requestInFlight.current) return
    requestInFlight.current = true
    setDownloading(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}/template`, { credentials: 'include' })
      if (!response.ok) {
        setError(await responseError(response, 'Failed to download template.'))
        return
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = isUpdate ? 'user_mass_update_template.xlsx' : 'user_import_template.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError('Failed to download template. Please try again.')
    } finally {
      requestInFlight.current = false
      setDownloading(false)
    }
  }

  return createPortal(
    <div
      className="modal-overlay user-bulk-upload-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) {
          event.preventDefault()
          onClose()
        }
      }}
    >
      <form className="modal" onSubmit={submit}>
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose} disabled={busy}>
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>
        <details className="user-bulk-upload-help" open={!isUpdate}>
          <summary>File format &amp; instructions</summary>
          {isUpdate ? (
            <>
              <p className="muted">Upload an Excel (.xlsx) or CSV (.csv) file to update existing accounts. Match each account by email and include only the profile columns you want to change.</p>
              <p className="muted">Required: <code>email</code>. Optional: <code>name</code>, <code>department</code>, <code>job_position</code>, <code>role</code>, <code>nik</code>, <code>phone</code>, <code>plate_number</code>.</p>
              <p className="muted">Blank profile cells keep saved values. Passwords stay unchanged. An email that does not match an existing account is reported as failed.</p>
              <p className="muted">To change Telegram, add a <code>telegram_id</code> column. A blank Telegram ID disconnects it; omit the column to keep the current connection.</p>
            </>
          ) : (
            <>
              <p className="muted">Upload an Excel (.xlsx) or CSV (.csv) file to create new accounts. Existing email addresses are reported as failed.</p>
              <p className="muted">Required: <code>name</code>, <code>department</code>, <code>phone</code>, <code>email</code>, <code>password</code>. Optional: <code>nik</code>, <code>job_position</code>, <code>role</code>, <code>telegram_id</code>. <code>plate_number</code> is required for Driver.</p>
            </>
          )}
          <p className="muted">Allowed roles: <code>user</code>, <code>driver</code>{isSuperadmin ? <>, <code>office_coordinator</code>, <code>superadmin</code></> : null}.{!isUpdate ? <> If omitted, the role defaults to <code>user</code>.</> : null}</p>
        </details>
        <label className="inline-label">
          <span>File</span>
          <input
            type="file"
            accept=".xlsx,.csv"
            required
            disabled={busy}
            onChange={(event) => {
              setFile(event.target.files?.[0] || null)
              setError('')
              setResult(null)
            }}
          />
        </label>
        {error ? <p className="error-text" role="alert">{error}</p> : null}
        {result ? (
          <div aria-live="polite">
            <p className="success-text">
              {isUpdate ? `Updated: ${result.updated ?? 0}` : `Created: ${result.created ?? 0}`} | Failed: {result.failed ?? 0}
            </p>
            {Array.isArray(result.errors) && result.errors.length ? (
              <div className="user-bulk-upload-errors">
                {result.errors.map((item, index) => (
                  <p key={`${item.row}-${index}`} className="muted">Row {item.row}{item.email ? ` (${item.email})` : ''}: {item.message}</p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="modal-actions">
          <button type="submit" className="btn btn-primary" disabled={busy || !file}>
            {uploading ? (isUpdate ? 'Updating...' : 'Importing...') : (isUpdate ? 'Update Users' : 'Import Users')}
          </button>
          <button type="button" className="btn btn-neutral" onClick={downloadTemplate} disabled={busy}>
            {downloading ? 'Downloading...' : 'Download Template Excel'}
          </button>
          <button type="button" className="btn btn-outline-danger" onClick={onClose} disabled={busy}>Close</button>
        </div>
      </form>
    </div>,
    document.body
  )
}

export default UserBulkUploadModal
