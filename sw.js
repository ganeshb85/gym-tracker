const CACHE = 'gymlog-v1';
// Paths work for both GitHub Pages (/repo/gym-log/) and root deploys
const BASE = self.location.pathname.replace(/sw\.js$/, '');
const ASSETS = [BASE + 'gymlog.html', BASE + 'manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('supabase.co') || e.request.url.includes('googleapis.com')) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'GymLog', {
      body: data.body || "This week's sessions are ready to export to Obsidian",
      icon: './icon-192.png',
      tag: 'gymlog-weekly',
      data: { url: './gymlog.html?action=export' },
      actions: [
        { action: 'export', title: 'Export now' },
        { action: 'later',  title: 'Later' }
      ]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'later') return;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const win = list.find(c => c.url.includes('gymlog'));
      return win ? win.focus() : clients.openWindow('./gymlog.html?action=export');
    })
  );
});
