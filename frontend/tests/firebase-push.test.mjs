import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { PUSH_PREFERENCE_CHANGED, disablePush, enablePush, pushSupport, restorePush } from '../src/lib/push.js'
import { installPushHandlers } from '../src/lib/pushWorker.js'

const config = { enabled: true, provider: 'fcm', user_id: 'u1', certificate_key: 'firebase-public-certificate',
  firebase_config: { apiKey: 'public-api-key', projectId: 'booking-test', messagingSenderId: '123', appId: 'app-id' } }
const fid = 'c' + 'A'.repeat(21)
let registration, binding, subscription, requests, permissionRequests, registrations, unregisters, serverFailure, sdk

function owner(userId = 'u1') {
  return { userId, fid, firebaseConfig: config.firebase_config, certificateKey: config.certificate_key, apiBase: '/api' }
}
function makeSubscription() {
  return { async unsubscribe() { subscription = null; return true } }
}

beforeEach(() => {
  globalThis.window = new EventTarget()
  binding = null
  subscription = null
  requests = []
  permissionRequests = registrations = unregisters = 0
  serverFailure = false
  registration = {
    active: { postMessage(message, ports) {
      if (message.type === 'PUSH_SET_BINDING') binding = message.binding
      ports[0].postMessage({ binding })
      ports[0].close()
    } },
    pushManager: { async getSubscription() { return subscription } },
  }
  sdk = {
    async register(receivedConfig, receivedRegistration) {
      registrations++
      assert.equal(receivedConfig.provider, 'fcm')
      assert.equal(receivedRegistration, registration)
      subscription = makeSubscription()
      return fid
    },
    async unregister() { unregisters++ },
  }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    serviceWorker: { async getRegistration() { return registration } },
  } })
  globalThis.Notification = {
    permission: 'granted', requestPermission() { permissionRequests++; return Promise.resolve(this.permission) },
  }
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null })
    return { ok: !serverFailure, async json() { return url.endsWith('/config') ? config : { enabled: true, user_id: 'u1' } } }
  }
})

test('support detection covers desktop/Android and iPhone/iPad Home Screen', () => {
  const browser = { isSecureContext: true, navigator: { userAgent: 'Chrome Android', serviceWorker: {} },
    PushManager: {}, Notification: {}, matchMedia: () => ({ matches: false }) }
  assert.equal(pushSupport(browser), 'supported')
  browser.isSecureContext = false
  assert.equal(pushSupport(browser), 'unsupported')
  browser.isSecureContext = true
  browser.navigator.userAgent = 'iPhone'
  assert.equal(pushSupport(browser), 'install')
  browser.navigator.standalone = true
  assert.equal(pushSupport(browser), 'supported')
  browser.navigator = { userAgent: 'Safari', platform: 'MacIntel', maxTouchPoints: 5, serviceWorker: {} }
  assert.equal(pushSupport(browser), 'install')
  browser.matchMedia = () => ({ matches: true })
  assert.equal(pushSupport(browser), 'supported')
})

test('opening the app never prompts permission or silently registers a new device', async () => {
  assert.equal(await restorePush('/api', 'u1', config, registration, sdk), false)
  assert.equal(permissionRequests, 0)
  assert.equal(registrations, 0)
  assert.equal(requests.length, 0)
})

test('Enable requests permission during click and saves the Firebase installation for this device', async () => {
  const action = enablePush('/api', 'u1', config, registration, sdk)
  assert.equal(permissionRequests, 1)
  await action
  assert.equal(registrations, 1)
  assert.deepEqual(binding, owner())
  const saved = requests.find((request) => request.url.endsWith('/subscribe'))
  assert.deepEqual(saved.body, { fid, project_id: 'booking-test' })
  assert.equal(saved.options.credentials, 'include')
  assert.equal('user_id' in saved.body, false)
})

test('permission denial never calls Firebase or registers a server target', async () => {
  Notification.permission = 'denied'
  await assert.rejects(enablePush('/api', 'u1', config, registration, sdk), /permission-denied/)
  assert.equal(registrations, 0)
  assert.equal(requests.length, 0)
})

test('successful opt-in wakes foreground delivery immediately; failed opt-in does not', async () => {
  let changes = 0
  window.addEventListener(PUSH_PREFERENCE_CHANGED, () => {
    changes++
    assert.equal(binding.userId, 'u1')
    assert.ok(requests.some((request) => request.url.endsWith('/subscribe')))
  })
  Notification.permission = 'denied'
  await assert.rejects(enablePush('/api', 'u1', config, registration, sdk))
  assert.equal(changes, 0)
  Notification.permission = 'granted'
  await enablePush('/api', 'u1', config, registration, sdk)
  assert.equal(changes, 1)
})

test('same-account opted-in devices reconcile Firebase registration without prompting again', async () => {
  subscription = makeSubscription()
  binding = owner()
  assert.equal(await restorePush('/api', 'u1', config, registration, sdk), true)
  assert.equal(registrations, 1)
  assert.equal(permissionRequests, 0)
})

test('another account disconnects the old Firebase installation without opting in', async () => {
  subscription = makeSubscription()
  binding = owner('previous-account')
  assert.equal(await restorePush('/api', 'u1', config, registration, sdk), false)
  assert.equal(binding, null)
  assert.equal(subscription, null)
  assert.equal(unregisters, 1)
  assert.equal(registrations, 0)
})

test('stale tabs cannot change a different account registration', async () => {
  subscription = makeSubscription()
  binding = owner('u2')
  assert.equal(await restorePush('/api', 'u1', { ...config, user_id: 'u2' }, registration, sdk), false)
  globalThis.fetch = async () => ({ ok: true, async json() { return { ...config, user_id: 'u2' } } })
  await assert.rejects(enablePush('/api', 'u1', config, registration, sdk), /account-changed/)
  assert.equal(binding.userId, 'u2')
  assert.ok(subscription)
  assert.equal(unregisters, 0)
})

test('certificate changes disconnect the old subscription before a new opt-in', async () => {
  subscription = makeSubscription()
  binding = owner()
  assert.equal(await restorePush('/api', 'u1', { ...config, certificate_key: 'new-key' }, registration, sdk), false)
  assert.equal(binding, null)
  assert.equal(unregisters, 1)
})

test('Disable/logout suppress in-flight notifications and detach Firebase even when API fails', async () => {
  subscription = makeSubscription()
  binding = owner()
  serverFailure = true
  await assert.rejects(disablePush('/api', registration, sdk), /disable-failed/)
  assert.equal(binding.userId, null)
  assert.equal(subscription, null)
  assert.equal(unregisters, 1)
  serverFailure = false
  await disablePush('/api', registration, sdk)
  assert.equal(binding, null)
})

test('failed backend registration rolls back the Firebase installation', async () => {
  const normalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => url.endsWith('/subscribe') ? { ok: false } : normalFetch(url, options)
  await assert.rejects(enablePush('/api', 'u1', config, registration, sdk))
  assert.equal(binding, null)
  assert.equal(subscription, null)
  assert.equal(unregisters, 1)
})

test('temporary server pause preserves an opted-in device preference', async () => {
  subscription = makeSubscription()
  binding = owner()
  assert.equal(await restorePush('/api', 'u1', { ...config, enabled: false }, registration, sdk), true)
  assert.equal(binding.userId, 'u1')
  assert.equal(registrations, 0)
})

test('FID refresh saves the replacement before removing the old server registration', async () => {
  subscription = makeSubscription()
  binding = { ...owner(), fid: 'd' + 'B'.repeat(21) }
  const previous = binding.fid
  assert.equal(await restorePush('/api', 'u1', config, registration, sdk), true)
  assert.deepEqual(requests.map((request) => request.url), ['/api/notifications/push/subscribe', '/api/notifications/push/unsubscribe'])
  assert.equal(requests[1].body.fid, previous)
  assert.equal(binding.fid, fid)
})

function workerHarness() {
  const handlers = {}, displayed = [], opened = [], closed = []
  let savedBinding = owner()
  const scope = { location: { origin: 'https://driver.pesan.biz' },
    addEventListener(type, handler) { handlers[type] = handler }, async skipWaiting() {},
    registration: {
      async showNotification(title, options) { displayed.push({ title, ...options }) },
      async getNotifications() { return [{ close: () => closed.push(true) }] },
    },
  }
  const windows = { async claim() {}, async matchAll() { return [] }, async openWindow(url) { opened.push(url) } }
  const show = installPushHandlers(scope, windows, async (value, write) => {
    if (write) savedBinding = value
    return savedBinding
  })
  return { displayed, opened, closed, windows, show,
    setBinding(value) { savedBinding = value },
    async dispatch(type, event = {}) {
      const tasks = []
      handlers[type]({ ...event, waitUntil: (promise) => tasks.push(promise) })
      await Promise.all(tasks)
    },
  }
}

test('Firebase background callback renders the existing message, logo, and idempotent tag', async () => {
  const worker = workerHarness()
  await worker.show({ user_id: 'u1', notification_id: 'n1', body: 'Tugas baru.', url: '/driver/home' })
  assert.equal(worker.displayed.length, 1)
  assert.equal(worker.displayed[0].body, 'Tugas baru.')
  assert.equal(worker.displayed[0].tag, 'booking-n1')
  assert.equal(worker.displayed[0].icon, '/app-logo-blue.png')
})

test('foreground Firebase messages use the same worker recipient checks', async () => {
  const worker = workerHarness()
  await worker.dispatch('message', { data: { type: 'PUSH_SHOW', payload: { user_id: 'u1', notification_id: 'n1', body: 'Approved', url: '/user/booking-history' } } })
  await worker.dispatch('message', { data: { type: 'PUSH_SHOW', payload: { user_id: 'u2', notification_id: 'n2', body: 'Private' } } })
  assert.equal(worker.displayed.length, 1)
})

test('worker ignores another account and in-flight Firebase messages after logout', async () => {
  const worker = workerHarness()
  await worker.show(null)
  await worker.show({ user_id: 'u2', notification_id: 'n1', body: 'Private' })
  await worker.dispatch('message', { data: { type: 'PUSH_SET_BINDING', binding: null }, ports: [{ postMessage() {} }] })
  await worker.show({ user_id: 'u1', notification_id: 'n1', body: 'Private' })
  assert.equal(worker.displayed.length, 0)
  assert.equal(worker.closed.length, 1)
})

test('notification clicks navigate to the role page and reject external redirects', async () => {
  for (const [input, expected] of [['/office/driver-history', '/office/driver-history'], ['https://evil.example/steal', '/login'],
    ['javascript:alert(1)', '/login'], ['//evil.example/driver/home', '/login']]) {
    const worker = workerHarness()
    await worker.dispatch('notificationclick', { notification: { close() {}, data: { userId: 'u1', url: input } } })
    assert.equal(worker.opened[0], `https://driver.pesan.biz${expected}`)
  }
})

test('stale notification clicks cannot reopen a previous account page', async () => {
  const worker = workerHarness()
  worker.setBinding(owner('u2'))
  await worker.dispatch('notificationclick', { notification: { close() {}, data: { userId: 'u1', url: '/user/booking-history' } } })
  assert.equal(worker.opened.length, 0)
})

test('notification click focuses an existing app window and takes precedence over Firebase default clicks', async () => {
  const worker = workerHarness(), actions = []
  worker.windows.matchAll = async () => [{ url: 'https://driver.pesan.biz/user/home',
    async navigate(url) { actions.push(url) }, async focus() { actions.push('focus') } }]
  await worker.dispatch('notificationclick', { stopImmediatePropagation() { actions.push('stop-firebase-default') },
    notification: { close() {}, data: { userId: 'u1', url: '/user/booking-history' } } })
  assert.deepEqual(actions, ['stop-firebase-default', 'https://driver.pesan.biz/user/booking-history', 'focus'])
  assert.equal(worker.opened.length, 0)
})
