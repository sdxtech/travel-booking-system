import { useCallback, useEffect, useState } from 'react'
import { API_BASE_URL } from '../config'
import { useLatestRequest } from './useLatestRequest'
import { useRealtimeRefresh } from './useRealtimeRefresh'

function useBookingLocations() {
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const beginLoad = useLatestRequest()
  const loadLocations = useCallback(async (background = false) => {
      const signal = beginLoad()
      if (!background) setLoading(true)
      setError('')
      try {
        const response = await fetch(`${API_BASE_URL}/locations`, { credentials: 'include', signal })
        if (!response.ok) throw new Error('Failed to load locations')
        const data = await response.json()
        if (!signal.aborted) setLocations(Array.isArray(data) ? data : [])
      } catch (requestError) {
        if (!background && !signal.aborted && requestError?.name !== 'AbortError') {
          setLocations([])
          setError('Failed to load the location list. Please refresh the page.')
        }
      } finally {
        if (!signal.aborted) setLoading(false)
      }
  }, [beginLoad])
  useRealtimeRefresh(['locations'], () => loadLocations(true))
  useEffect(() => { loadLocations() }, [loadLocations])

  return { locations, locationsLoading: loading, locationsError: error }
}

export default useBookingLocations
