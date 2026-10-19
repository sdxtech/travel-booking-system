import { useEffect } from 'react'
import { API_BASE_URL } from '../config'
import { useAuth } from '../hooks/useAuth'
import { createRealtimeClient } from '../lib/realtime'

export default function RealtimeConnection() {
  const { user } = useAuth()
  const uid = user?.uid
  const role = user?.role
  useEffect(() => {
    if (!uid) return undefined
    const connection = createRealtimeClient({
      apiBase: API_BASE_URL,
      sessionExpired: () => window.dispatchEvent(new Event('auth:refresh')),
    })
    connection.start()
    return () => connection.stop()
  }, [uid, role])
  return null
}
