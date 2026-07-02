// FCM token registration + in-app notification subscription.
//
// Browser push notifications require a service worker. We request permission
// on first sign-in, register the SW, get the FCM token, and write it onto
// the user's Firestore doc. A Cloud Function (functions/index.js) reads that
// token + watches new roasts/likes/follows to send the actual pushes.
//
// In-app notifications are stored at /users/{uid}/notifications/{notifId} so
// we can show them in the bell dropdown without needing the server.

import { getToken, onMessage } from 'firebase/messaging'
import {
  doc, setDoc, updateDoc, arrayUnion, collection, query,
  orderBy, onSnapshot, writeBatch, serverTimestamp, getDocs
} from 'firebase/firestore'
import { db, getMessagingSafe, firebaseConfig } from './firebase'

// Vite exposes any var starting with VITE_ to the client.
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY

/**
 * Request permission, register the service worker, get an FCM token, and
 * persist it on the user's doc. Safe to call repeatedly — does nothing if
 * permission was already granted or if the browser doesn't support FCM.
 *
 * Returns the token (string) or null if unavailable.
 */
export async function enablePushForUser(userId) {
  if (!userId) return null
  if (typeof window === 'undefined' || !('Notification' in window)) return null
  if (!('serviceWorker' in navigator)) return null

  // If the user already denied, don't keep asking.
  if (Notification.permission === 'denied') return null

  try {
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return null
    }

    // Register the FCM service worker (served from /public).
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js')

    // Hand the Firebase public config to the SW so it can initialize the SDK.
    // (The SW lives in a different global context and can't read import.meta.env.)
    try {
      await navigator.serviceWorker.ready
      reg.active?.postMessage({ type: 'FIREBASE_CONFIG', config: firebaseConfig })
    } catch {}

    const messaging = await getMessagingSafe()
    if (!messaging) return null

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: reg
    })
    if (!token) return null

    // Persist the token on the user doc. We keep a list of tokens so the same
    // user can be signed in on multiple devices.
    await updateDoc(doc(db, 'users', userId), {
      fcmTokens: arrayUnion(token),
      fcmUpdatedAt: serverTimestamp()
    })
    return token
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[RoastBoard] Push setup failed (continuing without it):', e?.message)
    return null
  }
}

/**
 * Foreground message handler — shows the title/body in a browser notification
 * while the app tab is open. The SW handles background pushes.
 */
export function listenForForegroundMessages(callback) {
  let unsub = () => {}
  ;(async () => {
    const messaging = await getMessagingSafe()
    if (!messaging) return
    unsub = onMessage(messaging, payload => {
      callback({
        title: payload?.notification?.title || 'RoastBoard',
        body:  payload?.notification?.body  || '',
        data:  payload?.data || {}
      })
      // Also surface as a real browser notification when the tab is in front.
      if (Notification?.permission === 'granted') {
        try {
          new Notification(payload?.notification?.title || 'RoastBoard', {
            body: payload?.notification?.body || '',
            icon: '/icon.png'
          })
        } catch {}
      }
    })
  })()
  return unsub
}

// ---- In-app notifications (bell dropdown) ----

/**
 * Subscribe to the current user's notification feed.
 * Returns an unsubscribe function.
 */
export function subscribeNotifications(userId, callback) {
  if (!userId) return () => {}
  const q = query(
    collection(db, 'users', userId, 'notifications'),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

export async function markAllNotificationsRead(userId) {
  if (!userId) return
  const q = query(collection(db, 'users', userId, 'notifications'))
  const snap = await getDocs(q)
  const batch = writeBatch(db)
  snap.forEach(d => {
    if (!d.data().read) batch.update(d.ref, { read: true })
  })
  await batch.commit()
}

export async function markNotificationRead(userId, notifId) {
  if (!userId || !notifId) return
  await setDoc(
    doc(db, 'users', userId, 'notifications', notifId),
    { read: true },
    { merge: true }
  )
}

export async function clearAllNotifications(userId) {
  if (!userId) return
  const q = query(collection(db, 'users', userId, 'notifications'))
  const snap = await getDocs(q)
  const batch = writeBatch(db)
  snap.forEach(d => batch.delete(d.ref))
  await batch.commit()
}
