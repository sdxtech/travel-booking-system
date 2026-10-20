import { useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { API_BASE_URL } from '../config'
import { PUSH_PREFERENCE_CHANGED, pushRequest, pushSupport, restorePush } from '../lib/push'
import { firebaseMessaging } from '../lib/firebaseMessaging'

// Runs outside the notification panel, including immediately after switching accounts.
export default function PushSession() {
  const { user } = useAuth()
  useEffect(() => {
    if (!user?.uid || pushSupport() !== 'supported') return
    let stopped = false
    let refreshing = false
    let refreshRequested = false
    let stopMessages = null
    const reconcile = async () => {
      if (stopped || document.visibilityState === 'hidden') return
      if (refreshing) { refreshRequested = true; return }
      refreshing = true
      try {
        const registration = await navigator.serviceWorker.getRegistration('/')
        if (!registration?.active || stopped) return
        const config = await pushRequest(API_BASE_URL, 'config')
        if (!stopped) await restorePush(API_BASE_URL, user.uid, config, registration)
        if (!stopped && config.enabled && config.user_id === user.uid && !stopMessages) {
          const stop = await firebaseMessaging.listen(config, (payload) => {
            if (payload.data?.user_id === user.uid) registration.active?.postMessage({ type: 'PUSH_SHOW', payload: payload.data })
          })
          if (stopped) stop()
          else stopMessages = stop
        }
      } catch { /* Existing in-app notifications remain available during network failures. */ }
      finally {
        refreshing = false
        if (refreshRequested) { refreshRequested = false; void reconcile() }
      }
    }
    reconcile()
    window.addEventListener('focus', reconcile)
    window.addEventListener('online', reconcile)
    window.addEventListener(PUSH_PREFERENCE_CHANGED, reconcile)
    return () => {
      stopped = true
      stopMessages?.()
      window.removeEventListener('focus', reconcile)
      window.removeEventListener('online', reconcile)
      window.removeEventListener(PUSH_PREFERENCE_CHANGED, reconcile)
    }
  }, [user?.uid])
  return null
}
