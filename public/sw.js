// Cleanup: unregister any stale service worker left from previous deployments.
// skipWaiting() activates immediately without waiting for old tabs to close.
// unregister() removes this SW entirely so subsequent fetches go direct to network.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', () => {
  self.registration.unregister()
    .then(() => self.clients.matchAll({ type: 'window' }))
    .then(clients => clients.forEach(client => client.navigate(client.url)))
})
