import { useCallback, useEffect, useState } from 'react'
import { API_BASE_URL } from '../config'
import { useLatestRequest } from './useLatestRequest'
import { useRealtimeRefresh } from './useRealtimeRefresh'
import { isBookingRequester } from '../components/employeeRequester'

export default function useBookingEmployees(enabled = true) {
  const [employees, setEmployees] = useState([])
  const [error, setError] = useState('')
  const beginLoad = useLatestRequest()
  const load = useCallback(async () => {
    if (!enabled) return
    const signal = beginLoad()
    try {
      const response = await fetch(`${API_BASE_URL}/users`, { credentials: 'include', signal })
      if (!response.ok) throw new Error('Failed to load requester suggestions. You can still enter requester details manually.')
      const users = await response.json()
      if (signal.aborted) return
      setEmployees(Array.isArray(users) ? users.filter(isBookingRequester) : [])
      setError('')
    } catch (requestError) {
      if (signal.aborted) return
      setError(requestError.message || 'Unable to load requester suggestions. You can enter requester details manually.')
    }
  }, [beginLoad, enabled])
  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['users'], load)
  return { employees, error }
}
