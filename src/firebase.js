// Firebase public client config — these values are safe to ship to the browser.
// SECURITY: Never put your Cloudinary API secret here. Use only the unsigned
// upload preset + cloud name on the client. Signed/server operations must run
// in a Cloud Function (or another server) that holds the secret in env vars.

import { initializeApp, getApps, getApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth'
import { getMessaging, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
}
export { firebaseConfig }

// ---- Sanity check the config ----
// Bails out with a clear console message instead of cryptic Firebase errors
// if .env was never filled in.
function validateConfig(cfg) {
  const missing = []
  if (!cfg.apiKey)              missing.push('VITE_FIREBASE_API_KEY')
  if (!cfg.authDomain)          missing.push('VITE_FIREBASE_AUTH_DOMAIN')
  if (!cfg.projectId)           missing.push('VITE_FIREBASE_PROJECT_ID')
  if (!cfg.messagingSenderId)   missing.push('VITE_FIREBASE_MESSAGING_SENDER_ID')
  if (!cfg.appId)               missing.push('VITE_FIREBASE_APP_ID')
  return missing
}

const missing = validateConfig(firebaseConfig)
if (missing.length) {
  // eslint-disable-next-line no-console
  console.error(
    `[RoastBoard] Firebase config is incomplete. Missing: ${missing.join(', ')}\n` +
    `→ Copy .env.example to .env and fill in the values from the Firebase Console.`
  )
}

// ---- Initialize app exactly once ----
// React StrictMode mounts effects twice in dev, so guard against duplicate init.
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()

// Optional: point at the local Firebase Auth emulator in dev.
// Set VITE_USE_AUTH_EMULATOR=true in .env to enable.
if (import.meta.env.VITE_USE_AUTH_EMULATOR === 'true') {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
  } catch (e) {
    // Already connected — ignore.
  }
}

// ---- FCM (only on browsers that support it) ----
let _messaging = null
export async function getMessagingSafe() {
  if (_messaging) return _messaging
  const ok = await isSupported()
  if (!ok) return null
  _messaging = getMessaging(app)
  return _messaging
}

// ---- Dev-time reminder: enable auth providers ----
// Shows up in the browser console so a developer who hasn't set up Auth
// in the Firebase Console gets a clear pointer, not a raw error.
if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.info(
    '%c[RoastBoard] Firebase Auth setup reminder:%c\n' +
    '1. Open the Firebase Console → Authentication → Sign-in method.\n' +
    '2. Enable Email/Password and Google providers.\n' +
    '3. Add "localhost" (and your production domain) under Authorized Domains.\n' +
    'Otherwise sign-in will fail with auth/configuration-not-found.',
    'color:#ff4d00;font-weight:bold',
    'color:inherit'
  )
}
