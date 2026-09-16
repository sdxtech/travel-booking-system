import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../config'

function useBookingLocations() {
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const loadLocations = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`${API_BASE_URL}/locations`, { credentials: 'include', signal: controller.signal })
        if (!response.ok) throw new Error('Failed to load locations')
        const data = await response.json()
        if (!controller.signal.aborted) setLocations(Array.isArray(data) ? data : [])
      } catch (requestError) {
        if (!controller.signal.aborted && requestError?.name !== 'AbortError') {
          setLocations([])
          setError('Failed to load the location list. Please refresh the page.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    loadLocations()
    return () => controller.abort()
  }, [])

  return { locations, locationsLoading: loading, locationsError: error }
}

export default useBookingLocations
