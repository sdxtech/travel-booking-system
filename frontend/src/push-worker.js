/* global clients */
import { initializeApp } from '@firebase/app'
import { getMessaging, onBackgroundMessage } from '@firebase/messaging/sw'
import { installPushHandlers } from './lib/pushWorker'

// Firebase's public web config is attached to the worker URL; no server credential is included.
const show = installPushHandlers(self, clients)
const config = JSON.parse(new URL(self.location.href).searchParams.get('firebase') || 'null')
if (config?.projectId && config?.appId && config?.apiKey && config?.messagingSenderId) {
  const messaging = getMessaging(initializeApp(config, `booking-push-${config.projectId}`))
  onBackgroundMessage(messaging, (payload) => show(payload.data))
}
// No fetch handler and no offline caching of pages, API responses, or login sessions.
