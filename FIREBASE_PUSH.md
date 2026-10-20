# Firebase Cloud Messaging for Booking App

All roles receive push for the same events and recipients as the existing in-app
notifications. Driver text remains Indonesian; other roles remain English. Email,
Telegram, and WebSocket updates continue separately.

The frontend uses the official Firebase App, Messaging, and Installations modules.
The backend sends through FCM HTTP v1 with Google's Auth library. It uses the current
`register` / `onRegistered` APIs and Firebase Installation IDs (FIDs), including the
HTTP v1 `fid` target. It does not use the legacy FCM server-key API or deprecated
registration-token APIs. Firebase Auth, Firestore, and Analytics are not initialized.

## Firebase configuration

Use the existing Firebase project. Push stays disabled until all required public
settings, the Web Push certificate public key, and the server credential are present.

From Firebase Console > Project settings > General > Your apps, copy the Web App's
`firebaseConfig` object. These are public browser settings:

| Firebase setting | Backend environment variable | Required |
| --- | --- | --- |
| `apiKey` | `FIREBASE_API_KEY` | Yes |
| `projectId` | `FIREBASE_PROJECT_ID` | Yes |
| `messagingSenderId` | `FIREBASE_MESSAGING_SENDER_ID` | Yes |
| `appId` | `FIREBASE_APP_ID` | Yes |
| `authDomain` | `FIREBASE_AUTH_DOMAIN` | Optional |
| `storageBucket` | `FIREBASE_STORAGE_BUCKET` | Optional |
| Web Push certificate public key | `FIREBASE_WEB_PUSH_CERTIFICATE_KEY` | Yes |

FCM for **websites still uses VAPID internally**. Generate the key pair in Firebase
Console > Project settings > Cloud Messaging > Web configuration > Web Push
certificates. Only copy the public key into the app configuration; Firebase manages
the private Web Push certificate key. The standalone private-key generator and
`WEB_PUSH_PRIVATE_KEY` settings from the earlier implementation have been removed.

Verify that the Firebase Cloud Messaging HTTP v1 API and FCM Registration API are
enabled in the same Google project. The service account must be permitted to send
FCM messages in that project; use a dedicated sender account with the Firebase Cloud
Messaging API Admin role or an equivalent restricted role, rather than unrelated
project administration permissions.

## Server credential: never paste it into chat or Git

If key creation is blocked by an organization policy, check the effective
`iam.disableServiceAccountKeyCreation` and `iam.managed.disableServiceAccountKeyCreation`
policies for this project with the Google Cloud
organization administrator. A project Owner role alone does not grant organization
policy administration. Any approved exception should be scoped to the application
project/service account. Do not turn off the restriction across the whole organization.
If the restriction must remain, Workload Identity Federation is an alternative, but
requires an appropriate external workload identity and a backend authentication change;
the current implementation loads a service account JSON key.

[Google's policy troubleshooting guide](https://docs.cloud.google.com/iam/docs/troubleshoot-org-policies)
and [federation setup](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-other-providers).

Generate/download the service account JSON from Firebase Console > Project settings >
Service accounts, then transfer it directly to the VPS with SCP/SFTP. The JSON includes
a private key. Keep it outside the repository and outside both Docker build contexts.

On the VPS, prepare a private directory:

```bash
sudo install -d -m 700 -o trbookadmin -g trbookadmin /opt/booking-app-secrets
```

Save the credential as `/opt/booking-app-secrets/firebase-service-account.json`, then:

```bash
chmod 600 /opt/booking-app-secrets/firebase-service-account.json
```

In the existing `/opt/booking-app/.env.production`, add the public settings above and:

```dotenv
FCM_ENABLED=true
FIREBASE_CREDENTIALS_DIR=/opt/booking-app-secrets
```

Compose mounts this directory **read only** at `/run/firebase`. The backend reads
`/run/firebase/firebase-service-account.json` through `GOOGLE_APPLICATION_CREDENTIALS`.
Without a custom directory, Compose uses the ignored `.firebase-credentials` directory;
an empty directory leaves push disabled and the rest of the app working.

For manual Windows backend development, use a separate development service account
outside the repository, and set `GOOGLE_APPLICATION_CREDENTIALS` to its full local
file path in `.env.development`. For local Docker, use `FIREBASE_CREDENTIALS_DIR`
instead; Compose supplies the container path. Do not copy production credentials
into development. Keep environment settings in the existing `.env.development` and
`.env.production` files; no extra environment file is needed.

## Deploy and verify

After committing/pushing the code and pulling it on the VPS, from `/opt/booking-app`:

```bash
sudo docker compose --env-file .env.production -f compose.production.yml up -d --build backend frontend
```

No database reset, volume removal, additional public ports, or new TLS certificate is
needed. Keep `APP_PUBLIC_URL` and `CORS_ORIGINS` set to `https://driver.pesan.biz`.
The VPS needs outbound HTTPS to Google OAuth and FCM; browsers need connectivity to
Firebase and their platform's push service.

1. Check the authenticated `/api/notifications/push/config` response reports
   `provider: "fcm"` and `enabled: true`. It contains only the public Firebase settings,
   certificate public key, and current user ID; no service account data is returned.
2. Sign in, open the navbar bell, and click **Enable** under **Device notifications**
   (**Aktifkan** under **Notifikasi perangkat** for Driver). Accept browser permission.
3. Trigger a normal booking/travel notification and check the proper recipient gets
   push in the foreground and with the app tab closed. Check click navigation.
4. Verify each role, a second device, logout, account switching on the same browser,
   denied permission, and the existing email/Telegram delivery.

Actual FCM delivery cannot be verified until a real Firebase configuration, server
credential, and opted-in browser/device are available. Automated tests use mocked
Firebase/Google transports and verify the HTTP v1 payload, authentication boundaries,
recipient selection, queue recovery, and foreground/background display logic.

## Device behaviour

Each device/browser opts in separately. **Disable** affects only that device. Signing
out clears its notification owner, unregisters it from FCM, and rotates the local
Firebase installation identity so a shared browser can safely use another account.
When offline, cleanup metadata is retained without an owner and retried later;
messages cannot be displayed for that former owner in the meantime.

Use HTTPS in production; localhost is allowed for development. Support is detected
before enabling Firebase Messaging. On iPhone/iPad, use iOS/iPadOS 16.4 or later,
add Booking App to the Home Screen, then open the installed app and enable notifications.
An ordinary iPhone browser tab cannot enable Web Push. Browser support, OS settings,
Focus mode, private browsing, battery restrictions, offline devices, and force-stopped
browsers can prevent or delay delivery. FCM does not remove those platform restrictions.

## Delivery and privacy

- Mongo `push_subscriptions` stores each project's FID under the authenticated account.
  Other accounts cannot claim or delete it. Up to ten FCM devices per account/project
  are retained. Device identifiers are redacted from audit input.
- `push_jobs` is a durable per-event/per-device outbox. The worker checks account and
  subscription ownership again before sending, retries transient failures up to three
  times, and removes devices only for FCM's explicit `UNREGISTERED` result. Project or
  authentication errors do not delete device registrations. Jobs expire after seven
  days; the provider TTL is one hour. Accepting a message does not prove OS display.
- The backend sends **data-only** messages. Both Firebase's background callback and
  foreground callback use the same recipient guard before showing a device notification.
  Stable notification tags collapse retries; clicking opens the role's task/history page.
- OAuth tokens, private keys, credential file contents, and provider exception strings
  are never placed in responses/audit logs. No private VAPID key is stored in app env.
  Google OAuth tokens are short lived and refreshed with a bounded HTTP timeout.
- The module service worker is bundled locally by Vite; it does not load runtime SDK
  scripts from a CDN or cache pages, API responses, or login sessions. Its URL includes
  only the public Firebase Web App configuration, which browsers also need for FCM.
- `FCM_ENABLED=false` pauses sending without deleting configuration or opted-in devices.

Dependencies were checked against npm audit, PyPI metadata, and OSV on 2026-10-19.
Only the official Firebase modules required for messaging are installed; the existing
Node 22 Docker build remains supported. Existing unrelated npm audit findings remain
separate from this integration and were not mass-upgraded.

References: [Firebase web setup](https://firebase.google.com/docs/cloud-messaging/js/client),
[foreground/background handling](https://firebase.google.com/docs/cloud-messaging/js/receive),
[FCM HTTP v1 authorization](https://firebase.google.com/docs/cloud-messaging/auth-server),
[HTTP v1 message/FID target](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages),
[Firebase SDK source](https://github.com/firebase/firebase-js-sdk),
[iPhone/iPad requirements](https://webkit.org/blog/13878/).
