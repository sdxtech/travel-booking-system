// Browser-native WebSocket; no Socket.IO or additional npm dependency.
export const REALTIME_TOPICS = ['bookings', 'tickets', 'calendars', 'availability', 'notifications', 'users', 'settings', 'locations', 'permissions', 'profile']
const subscribers = new Set()

export function emitRealtime(topics = REALTIME_TOPICS) {
  const changed = new Set(topics)
  for (const subscription of subscribers) {
    if (subscription.topics.some((topic) => changed.has(topic))) subscription.refresh()
  }
}

export function subscribeRealtime(topics, refresh) {
  const subscription = { topics, refresh }
  subscribers.add(subscription)
  return () => subscribers.delete(subscription)
}

export function websocketUrl(apiBase, pageUrl) {
  const url = new URL(`${apiBase.replace(/\/$/, '')}/realtime`, pageUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function createRealtimeClient({ apiBase, browser = window, page = document, emit = emitRealtime, sessionExpired = () => {} }) {
  let socket = null
  let stopped = true
  let retryTimer = null
  let attempts = 0
  let lastMessage = 0
  let connected = false
  let reconcileTimer = null
  const reconnect = () => {
    if (stopped || retryTimer || browser.navigator?.onLine === false) return
    const delay = Math.min(30000, 1000 * (2 ** Math.min(attempts++, 5))) + Math.random() * 500
    retryTimer = browser.setTimeout(() => { retryTimer = null; connect() }, delay)
  }
  const connect = () => {
    if (stopped || socket || browser.navigator?.onLine === false) return
    try {
      const current = new browser.WebSocket(websocketUrl(apiBase, browser.location.href))
      socket = current
      lastMessage = Date.now()
      current.onmessage = (event) => {
        if (stopped || socket !== current) return
        lastMessage = Date.now()
        let message
        try { message = JSON.parse(event.data) } catch { return }
        if (!message || typeof message !== 'object') return
        if (message.type === 'ready') {
          attempts = 0
          connected = true
          emit() // Always recover changes missed while disconnected.
        } else if (message.type === 'resync') {
          emit()
        } else if (message.type === 'changed' && Array.isArray(message.topics)) {
          emit(message.topics.filter((topic) => REALTIME_TOPICS.includes(topic)))
        }
      }
      current.onclose = (event) => {
        if (socket !== current) return
        socket = null
        connected = false
        if (event.code === 4401) sessionExpired()
        reconnect()
      }
      current.onerror = () => current.close()
    } catch {
      connected = false
      reconnect()
    }
  }
  const resume = () => {
    if (page.visibilityState === 'hidden') return
    emit()
    if (socket && Date.now() - lastMessage > 60000) socket.close()
    if (!socket) {
      browser.clearTimeout(retryTimer)
      retryTimer = null
      connect()
    }
  }
  return {
    start() {
      if (!stopped) return
      stopped = false
      lastMessage = Date.now()
      connect()
      browser.addEventListener('online', resume)
      browser.addEventListener('focus', resume)
      page.addEventListener('visibilitychange', resume)
      let ticks = 0
      reconcileTimer = browser.setInterval(() => {
        if (page.visibilityState === 'hidden') return
        ticks++
        if (socket && Date.now() - lastMessage > 60000) socket.close()
        // Fallback polling when disconnected; reconcile once per minute even when connected.
        if (!connected || ticks % 2 === 0) emit()
        if (!socket) reconnect()
      }, 30000)
    },
    stop() {
      stopped = true
      browser.clearTimeout(retryTimer)
      browser.clearInterval(reconcileTimer)
      browser.removeEventListener('online', resume)
      browser.removeEventListener('focus', resume)
      page.removeEventListener('visibilitychange', resume)
      const current = socket
      socket = null
      if (current) current.close()
    },
  }
}
