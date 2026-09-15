import { useCallback, useEffect, useState } from 'react'
import { API_BASE_URL } from '../config'

export default function DriverTelegram() {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/telegram/me`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to check Telegram connection.')
      const data = await res.json()
      setStatus(data)
      if (data.connected) setLink('')
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to check Telegram connection.')
    }
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])

  useEffect(() => {
    if (!link) return undefined
    const interval = window.setInterval(refresh, 5000)
    const expiry = window.setTimeout(() => {
      setLink('')
      setError('Connection link expired. Please connect again.')
    }, 10 * 60 * 1000)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(expiry)
    }
  }, [link, refresh])

  const updateConnection = async (disconnect = false) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/telegram/${disconnect ? 'connection' : 'connect'}`, {
        credentials: 'include', method: disconnect ? 'DELETE' : 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Telegram connection failed.')
      if (disconnect) {
        setLink('')
        await refresh()
      } else {
        setLink(data.url)
      }
    } catch (err) {
      setError(err.message || 'Telegram connection failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="driver-telegram" aria-label="Telegram notifications">
      <div>
        <strong><i className="bi bi-telegram" aria-hidden="true" /> Telegram notifications</strong>
        <p>{!status ? 'Checking connection…' : !status.configured
          ? 'Telegram is awaiting administrator setup. Email notifications remain active.'
          : status.connected ? `Connected to @${status.bot_username}. Email notifications remain active.`
            : 'Connect your personal Telegram to receive Driver notifications. Email stays active.'}</p>
      </div>
      <div className="driver-telegram-actions">
        {link ? (
          <>
            <a className="btn btn-primary" href={link} target="_blank" rel="noopener noreferrer">Open Telegram</a>
            <span className="muted">Click Start in the bot, then return here. Link valid for 10 minutes.</span>
          </>
        ) : (
          <button className="btn btn-neutral" disabled={busy || !status || (!status.configured && !status.connected)}
            onClick={() => updateConnection(Boolean(status?.connected))}>
            {busy ? 'Please wait…' : status?.connected ? 'Disconnect Telegram' : 'Connect Telegram'}
          </button>
        )}
        <button className="btn btn-neutral" onClick={refresh} disabled={busy}>Check status</button>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  )
}
