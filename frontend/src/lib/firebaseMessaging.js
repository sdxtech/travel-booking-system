// Only the official Firebase App + Messaging modules are loaded; no Auth/Analytics/Firestore.
async function client(config) {
  const [{ initializeApp, getApps }, messagingSdk] = await Promise.all([
    import('@firebase/app'), import('@firebase/messaging'),
  ])
  if (!await messagingSdk.isSupported()) throw new Error('firebase-not-supported')
  const name = `booking-push-${config.firebase_config.projectId}`
  const app = getApps().find((item) => item.name === name) || initializeApp(config.firebase_config, name)
  return { sdk: messagingSdk, app, messaging: messagingSdk.getMessaging(app) }
}

export const firebaseMessaging = {
  async register(config, registration) {
    const { sdk, messaging } = await client(config)
    let stop = () => {}, timer
    const identity = new Promise((resolve, reject) => {
      stop = sdk.onRegistered(messaging, resolve)
      timer = setTimeout(() => reject(new Error('firebase-registration-timeout')), 20000)
    })
    try {
      const [fid] = await Promise.all([identity, sdk.register(messaging, {
        vapidKey: config.certificate_key, serviceWorkerRegistration: registration,
      })])
      return fid
    } finally { clearTimeout(timer); stop() }
  },

  async unregister(config) {
    const { sdk, messaging, app } = await client(config)
    try { await sdk.unregister(messaging) }
    finally {
      // A shared browser must get a new installation identity when another account opts in.
      const { deleteInstallations, getInstallations } = await import('@firebase/installations')
      await deleteInstallations(getInstallations(app))
    }
  },

  async listen(config, callback) {
    const { sdk, messaging } = await client(config)
    return sdk.onMessage(messaging, callback)
  },
}
