const CACHE = 'commit-static-v1';
self.addEventListener('install', (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.add('/offline.html'))); self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))); self.clients.claim(); });
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
});
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* ignore malformed payload */ }
  if (data.type !== 'commit-reminder' || typeof data.path !== 'string' || !/^\/subscriptions\/[a-zA-Z0-9_-]+$/.test(data.path)) return;
  event.waitUntil(self.registration.showNotification(typeof data.title === 'string' ? data.title.slice(0, 100) : 'A commitment needs your attention', {
    body: 'Open Commit to review your next action.', tag: data.tag || 'commit-action', data: { path: data.path }, icon: '/favicon.ico'
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.path || '/upcoming';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    const current = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (current) { await current.navigate(path); return current.focus(); }
    return self.clients.openWindow(path);
  }));
});
