import { useEffect, useRef } from 'react'
import { subscribeRealtime } from '../lib/realtime'

// Keep filters, forms, date selection, and scroll position while refreshing only data.
export function useRealtimeRefresh(topics, onRefresh) {
  const refreshRef = useRef(onRefresh)
  const topicKey = topics.join(',')
  useEffect(() => { refreshRef.current = onRefresh }, [onRefresh])
  useEffect(() => {
    let timer = null
    let running = false
    let pending = false
    let disposed = false
    const refresh = async () => {
      timer = null
      if (disposed) return
      if (running) { pending = true; return }
      running = true
      try { await refreshRef.current() } catch { /* Existing loaders handle errors. */ }
      finally {
        running = false
        if (pending && !disposed) { pending = false; schedule() }
      }
    }
    const schedule = () => {
      if (timer || disposed) return
      timer = window.setTimeout(refresh, 100)
    }
    const unsubscribe = subscribeRealtime(topicKey.split(','), schedule)
    return () => { disposed = true; unsubscribe(); window.clearTimeout(timer) }
  }, [topicKey])
}
