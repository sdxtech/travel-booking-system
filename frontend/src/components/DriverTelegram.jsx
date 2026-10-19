import { useCallback, useEffect, useState } from 'react'
import { indonesianError } from '../utils/indonesian'
import { API_BASE_URL } from '../config'

export default function DriverTelegram() {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/telegram/me`, { credentials: 'include' })
      if (!res.ok) throw new Error('Koneksi Telegram gagal diperiksa. Silakan coba lagi.')
      const data = await res.json()
      setStatus(data)
      if (data.connected) setLink('')
      setError('')
    } catch {
      setError('Koneksi Telegram gagal diperiksa. Silakan coba lagi.')
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
      setError('Tautan sudah kedaluwarsa. Silakan hubungkan kembali.')
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
      if (!res.ok) {
        setError(indonesianError(data.detail, 'Telegram gagal dihubungkan. Silakan coba lagi.'))
        return
      }
      if (disconnect) {
        setLink('')
        await refresh()
      } else {
        setLink(data.url)
      }
    } catch {
      setError('Koneksi bermasalah. Silakan coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="driver-telegram" aria-label="Notifikasi Telegram">
      <div>
        <strong><i className="bi bi-telegram" aria-hidden="true" /> Notifikasi Telegram</strong>
        <p>{!status ? 'Memeriksa koneksi...' : !status.configured
          ? 'Telegram belum diatur oleh administrator. Notifikasi email tetap aktif.'
          : status.connected ? `Terhubung ke @${status.bot_username}. Notifikasi email tetap aktif.`
            : 'Hubungkan Telegram pribadi Anda untuk menerima pemberitahuan tugas. Notifikasi email tetap aktif.'}</p>
      </div>
      <div className="driver-telegram-actions">
        {link ? (
          <>
            <a className="btn btn-primary" href={link} target="_blank" rel="noopener noreferrer">Buka Telegram</a>
            <span className="muted">Tekan tombol Mulai (Start) di bot Telegram, lalu kembali ke halaman ini. Tautan berlaku selama 10 menit.</span>
          </>
        ) : (
          <button className="btn btn-neutral" disabled={busy || !status || (!status.configured && !status.connected)}
            onClick={() => updateConnection(Boolean(status?.connected))}>
            {busy ? 'Mohon tunggu...' : status?.connected ? 'Putuskan Telegram' : 'Hubungkan Telegram'}
          </button>
        )}
        <button className="btn btn-neutral" onClick={refresh} disabled={busy}>Periksa Status</button>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  )
}
