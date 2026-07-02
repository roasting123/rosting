// FCM service worker for RoastBoard.
// Receives background push messages and shows a system notification.
//
// The Firebase config is sent in from the page via postMessage (after the
// app's main bundle initializes), and cached in IndexedDB-backed Cache API
// so subsequent background pushes still work after the page is closed.

importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js')

let _config = null
let _messaging = null

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'FIREBASE_CONFIG' && data.config) {
    _config = data.config
    init()
  }
})

function init() {
  if (!_config || _messaging) return
  try {
    firebase.initializeApp(_config)
    _messaging = firebase.messaging()
    _messaging.onBackgroundMessage((payload) => {
      const title = payload?.notification?.title || 'RoastBoard'
      const options = {
        body: payload?.notification?.body || '',
        icon: '/icon.png',
        badge: '/icon.png',
        data: payload?.data || {}
      }
      self.registration.showNotification(title, options)
    })
  } catch (e) {
    // Already initialized by a previous message — ignore.
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification?.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) return client.focus()
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
      })
  )
})
