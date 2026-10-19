import { useCallback, useEffect, useRef } from 'react'

// Cancel superseded loads so an older response cannot undo a newer live update/filter.
export function useLatestRequest() {
  const current = useRef(null)
  useEffect(() => () => current.current?.abort(), [])
  return useCallback(() => {
    current.current?.abort()
    current.current = new AbortController()
    return current.current.signal
  }, [])
}
