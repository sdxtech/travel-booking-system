import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../config'
import { disablePush, enablePush, pushBinding, pushRegistration, pushRequest, pushSupport, restorePush } from '../lib/push'

export default function PushNotificationControl({ user }) {
  const driver = user.role === 'driver'
  const t = (en, id) => driver ? id : en
  const [state, setState] = useState({ loading: true, enabled: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    const support = pushSupport()
    async function load() {
      if (support !== 'supported') return { loading: false, support }
      const config = await pushRequest(API_BASE_URL, 'config')
      if (!config.enabled) {
        const registration = await navigator.serviceWorker.getRegistration('/')
        const binding = registration?.active ? await pushBinding(registration) : null
        return { loading: false, support, config, registration, enabled: binding?.userId === user.uid }
      }
      const registration = await pushRegistration(config)
      const enabled = await restorePush(API_BASE_URL, user.uid, config, registration)
      return { loading: false, support, config, registration, enabled }
    }
    load().then((next) => { if (!cancelled) setState(next) }).catch(() => {
      if (!cancelled) { setState({ loading: false, support, failed: true }); setError(true) }
    })
    return () => { cancelled = true }
  }, [user.uid])

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    setError(false)
    try {
      if (state.enabled) await disablePush(API_BASE_URL, state.registration)
      else await enablePush(API_BASE_URL, user.uid, state.config, state.registration)
      setState((previous) => ({ ...previous, enabled: !previous.enabled }))
    } catch {
      setError(true)
      if (state.enabled) setState((previous) => ({ ...previous, enabled: false }))
    } finally { setBusy(false) }
  }

  let hint = t('Receive notifications on this device, including when this tab is closed.', 'Terima notifikasi di perangkat ini, termasuk saat tab ditutup.')
  if (state.support === 'install') hint = t('On iPhone/iPad (iOS 16.4+), add Booking App to your Home Screen, then enable notifications there.', 'Di iPhone/iPad (iOS 16.4+), tambahkan Booking App ke Layar Utama, lalu aktifkan notifikasi dari sana.')
  else if (state.support === 'unsupported') hint = t('Push notifications are unavailable in this browser. Try an updated browser over HTTPS.', 'Browser ini belum mendukung notifikasi push. Gunakan browser terbaru melalui HTTPS.')
  else if (!state.loading && !state.failed && !state.config?.enabled) hint = t('Firebase notifications are not configured on the server yet.', 'Notifikasi Firebase belum diaktifkan di server.')
  else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') hint = t('Notifications are blocked. Allow them in your browser/site settings, then try again.', 'Notifikasi diblokir. Izinkan di pengaturan browser/situs, lalu coba lagi.')

  return (
    <div className="push-control">
      <div className="push-control__row">
        <span>{t('Device notifications', 'Notifikasi perangkat')}</span>
        <button type="button" className="notifications-refresh" onClick={toggle}
          disabled={busy || state.loading || (!state.enabled && !state.config?.enabled) || state.support !== 'supported'}>
          {busy || state.loading ? t('Please wait...', 'Tunggu...') : state.enabled ? t('Disable', 'Nonaktifkan') : t('Enable', 'Aktifkan')}
        </button>
      </div>
      <p>{hint}</p>
      {state.enabled && <p className="push-control__enabled">{t('Enabled on this device.', 'Aktif di perangkat ini.')}</p>}
      {error && <p className="error-text" role="alert">{t('Could not update push notifications. Check your connection and notification permission, then reopen this panel to retry.', 'Pengaturan notifikasi belum berhasil. Periksa koneksi dan izin notifikasi, lalu buka ulang panel ini.')}</p>}
    </div>
  )
}
