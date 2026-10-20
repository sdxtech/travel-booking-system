// Shared notification handling for Firebase background and foreground deliveries.
export function bindingStorage(value, write = false) {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('booking-push', 1)
    opening.onupgradeneeded = () => opening.result.createObjectStore('settings')
    opening.onerror = () => reject(new Error('Push storage unavailable'))
    opening.onsuccess = () => {
      const database = opening.result
      const transaction = database.transaction('settings', write ? 'readwrite' : 'readonly')
      const store = transaction.objectStore('settings')
      const request = write ? store.put(value, 'binding') : store.get('binding')
      transaction.oncomplete = () => { database.close(); resolve(write ? value : request.result) }
      transaction.onabort = transaction.onerror = () => { database.close(); reject(new Error('Push storage unavailable')) }
    }
  })
}

export function installPushHandlers(scope, windows, storage = bindingStorage) {
  const safePath = (value) => {
    try {
      const url = new URL(value, scope.location.origin)
      if (url.origin === scope.location.origin && /^\/(user|driver|office|admin)\//.test(url.pathname)) return url.href
    } catch { /* Invalid paths open the login screen. */ }
    return new URL('/login', scope.location.origin).href
  }
  const show = async (payload) => {
    const binding = await storage()
    if (!binding?.userId || binding.userId !== payload?.user_id || !payload.notification_id) return
    await scope.registration.showNotification('Booking App', {
      body: String(payload.body || '').slice(0, 500), icon: '/app-logo-blue.png', badge: '/app-logo-blue.png',
      tag: `booking-${payload.notification_id}`, renotify: false,
      data: { url: safePath(payload.url), userId: payload.user_id },
    })
  }
  scope.addEventListener('install', (event) => event.waitUntil(scope.skipWaiting()))
  scope.addEventListener('activate', (event) => event.waitUntil(windows.claim()))
  scope.addEventListener('message', (event) => {
    if (event.data?.type === 'PUSH_SHOW') {
      event.waitUntil(show(event.data.payload))
      return
    }
    if (!['PUSH_GET_BINDING', 'PUSH_SET_BINDING'].includes(event.data?.type)) return
    event.waitUntil((async () => {
      try {
        const write = event.data.type === 'PUSH_SET_BINDING'
        const binding = await storage(event.data.binding, write)
        if (write && !binding?.userId) {
          const notifications = await scope.registration.getNotifications()
          notifications.forEach((notification) => notification.close())
        }
        event.ports[0]?.postMessage({ binding })
      } catch { event.ports[0]?.postMessage({ error: true }) }
    })())
  })
  // Register before getMessaging(), which installs Firebase's default click handler.
  scope.addEventListener('notificationclick', (event) => {
    if (!event.notification.data?.userId) return
    event.stopImmediatePropagation?.()
    event.notification.close()
    event.waitUntil((async () => {
      const binding = await storage()
      if (!binding?.userId || binding.userId !== event.notification.data.userId) return
      const target = safePath(event.notification.data.url)
      const existing = (await windows.matchAll({ type: 'window', includeUncontrolled: true }))
        .find((client) => new URL(client.url).origin === scope.location.origin)
      if (existing) { await existing.navigate(target); await existing.focus() }
      else await windows.openWindow(target)
    })())
  })
  return show
}
