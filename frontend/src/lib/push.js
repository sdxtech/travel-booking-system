import { firebaseMessaging } from './firebaseMessaging.js'

export const PUSH_PREFERENCE_CHANGED = 'booking-push-preference-changed'

// Firebase Cloud Messaging. Permission is requested only from an Enable click.
export function pushSupport(browser = window) {
  const ios = /iPad|iPhone|iPod/.test(browser.navigator.userAgent) ||
    (browser.navigator.platform === 'MacIntel' && browser.navigator.maxTouchPoints > 1)
  if (ios && !(browser.matchMedia('(display-mode: standalone)').matches || browser.navigator.standalone)) return 'install'
  return browser.isSecureContext && 'serviceWorker' in browser.navigator &&
    'PushManager' in browser && 'Notification' in browser ? 'supported' : 'unsupported'
}

export async function pushRequest(apiBase, path, body) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`${apiBase}/notifications/push/${path}`, {
      credentials: 'include', signal: controller.signal, ...(body ? {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      } : {}),
    })
    if (!response.ok) throw new Error('push-request-failed')
    return await response.json()
  } finally { clearTimeout(timeout) }
}

export async function pushRegistration(config) {
  const script = import.meta.env?.DEV ? '/src/push-worker.js' : '/push-worker.js'
  const query = encodeURIComponent(JSON.stringify(config.firebase_config))
  const registration = await navigator.serviceWorker.register(`${script}?firebase=${query}`, {
    type: 'module', scope: '/', updateViaCache: 'none',
  })
  const worker = registration.installing || registration.waiting
  if (!worker && registration.active) return registration
  if (!worker) throw new Error('push-worker-unavailable')
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(new Error('push-worker-timeout')) }, 10000)
    const change = () => {
      if (worker.state === 'activated') { cleanup(); resolve() }
      else if (worker.state === 'redundant') { cleanup(); reject(new Error('push-worker-unavailable')) }
    }
    const cleanup = () => { clearTimeout(timeout); worker.removeEventListener('statechange', change) }
    worker.addEventListener('statechange', change)
    change()
  })
  return registration
}

export function pushBinding(registration, binding) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()
    const timeout = setTimeout(() => { channel.port1.close(); reject(new Error('push-storage-timeout')) }, 5000)
    channel.port1.onmessage = ({ data }) => {
      clearTimeout(timeout)
      channel.port1.close()
      if (data.error) reject(new Error('push-storage-unavailable'))
      else resolve(data.binding)
    }
    registration.active.postMessage({ type: binding === undefined ? 'PUSH_GET_BINDING' : 'PUSH_SET_BINDING', binding }, [channel.port2])
  })
}

// Serialize changes across tabs, the settings panel, startup reconciliation, and logout.
let pending = Promise.resolve()
function withPushLock(action) {
  const run = () => navigator.locks ? navigator.locks.request('booking-push', action) : action()
  const result = pending.then(run, run)
  pending = result.catch(() => {})
  return result
}

async function disablePushUnlocked(apiBase, registration, sdk) {
  const current = registration || await navigator.serviceWorker?.getRegistration('/')
  if (!current?.active) return
  // Clear the worker's owner first, so even in-flight pushes cannot show another account's content.
  const binding = await pushBinding(current)
  // Keep cleanup metadata without an owner if offline; a retry can finish disconnecting FCM.
  await pushBinding(current, binding ? { ...binding, userId: null } : null)
  let failed = false
  if (binding?.fid) {
    try { await pushRequest(apiBase, 'unsubscribe', { fid: binding.fid, project_id: binding.firebaseConfig.projectId }) }
    catch { failed = true }
  }
  if (binding?.firebaseConfig) {
    try { await sdk.unregister({ firebase_config: binding.firebaseConfig }) }
    catch { failed = true }
  }
  const subscription = await current.pushManager.getSubscription()
  if (subscription && !await subscription.unsubscribe()) failed = true
  if (failed) throw new Error('push-disable-failed')
  await pushBinding(current, null)
}

export function disablePush(apiBase, registration, sdk = firebaseMessaging) {
  return withPushLock(() => disablePushUnlocked(apiBase, registration, sdk))
}

async function saveSubscription(apiBase, userId, fid, config) {
  const result = await pushRequest(apiBase, 'subscribe', { fid, project_id: config.firebase_config.projectId })
  if (result.user_id !== userId) throw new Error('push-account-changed')
}

async function restorePushUnlocked(apiBase, userId, config, registration, sdk) {
  if (config.user_id !== userId) return false // An old tab must not change the current account's binding.
  const binding = await pushBinding(registration)
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription || !binding?.fid) {
    if (subscription || binding) await disablePushUnlocked(apiBase, registration, sdk)
    await pushBinding(registration, null)
    return false
  }
  if (binding?.userId !== userId || Notification.permission !== 'granted' ||
      (config.enabled && (binding.certificateKey !== config.certificate_key ||
        JSON.stringify(binding.firebaseConfig) !== JSON.stringify(config.firebase_config)))) {
    await disablePushUnlocked(apiBase, registration, sdk)
    return false
  }
  if (!config.enabled) return true // Keep the device preference during a temporary server outage.
  const fid = await sdk.register(config, registration)
  await saveSubscription(apiBase, userId, fid, config)
  await pushBinding(registration, { ...binding, fid })
  if (fid !== binding.fid) await pushRequest(apiBase, 'unsubscribe', { fid: binding.fid, project_id: binding.firebaseConfig.projectId })
  return true
}

export function restorePush(apiBase, userId, config, registration, sdk = firebaseMessaging) {
  return withPushLock(() => restorePushUnlocked(apiBase, userId, config, registration, sdk))
}

export async function enablePush(apiBase, userId, config, registration, sdk = firebaseMessaging) {
  // Call before the first await, while the user gesture is still active (required by Safari).
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('push-permission-denied')
  return withPushLock(() => enablePushUnlocked(apiBase, userId, config, registration, sdk))
}

async function enablePushUnlocked(apiBase, userId, config, registration, sdk) {
  // Cookies can change in another tab while this panel is open.
  const fresh = await pushRequest(apiBase, 'config')
  if (fresh.user_id !== userId || !fresh.enabled) throw new Error('push-account-changed')
  if (JSON.stringify(fresh.firebase_config) !== JSON.stringify(config.firebase_config)) throw new Error('push-config-changed')
  config = fresh
  const binding = await pushBinding(registration)
  if (binding && (binding.userId !== userId || binding.certificateKey !== config.certificate_key ||
      JSON.stringify(binding.firebaseConfig) !== JSON.stringify(config.firebase_config))) {
    await disablePushUnlocked(apiBase, registration, sdk)
  }
  try {
    const fid = await sdk.register(config, registration)
    await pushBinding(registration, { userId, fid, firebaseConfig: config.firebase_config,
      certificateKey: config.certificate_key, apiBase })
    await saveSubscription(apiBase, userId, fid, config)
    window.dispatchEvent(new Event(PUSH_PREFERENCE_CHANGED))
  } catch (error) {
    await disablePushUnlocked(apiBase, registration, sdk).catch(() => {})
    throw error
  }
}
