import { useCallback, useEffect, useState } from 'react'
import { API_BASE_URL } from '../config'
import { useAuth } from './useAuth'
import { useLatestRequest } from './useLatestRequest'
import { useRealtimeRefresh } from './useRealtimeRefresh'

export default function useRequestEditPermissions() {
  const { user } = useAuth()
  const [state, setState] = useState({ permissions: null, error: '' })
  const begin = useLatestRequest()
  const reload = useCallback(async () => {
    const signal = begin()
    try {
      const response = await fetch(`${API_BASE_URL}/settings/request-edit-permissions`, { credentials: 'include', signal })
      if (!response.ok) throw new Error('Unable to load edit permissions.')
      const data = await response.json()
      if (!['user', 'office_coordinator', 'superadmin'].every((role) => typeof data[role] === 'boolean')) {
        throw new Error('Unable to load edit permissions.')
      }
      if (!signal.aborted) setState({ permissions: data, error: '' })
    } catch (error) {
      if (!signal.aborted) setState({ permissions: null, error: error.message || 'Unable to load edit permissions.' })
    }
  }, [begin])
  useEffect(() => { reload() }, [reload, user?.uid])
  useRealtimeRefresh(['settings'], reload)
  return { ...state, canEdit: state.permissions?.[user?.role] === true, reload }
}
