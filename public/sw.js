// Offline-friendly shell + push. API responses are never cached (private data).
const SHELL = "unsaid-shell-v2", FILES = ["/", "/manifest.webmanifest"];
self.addEventListener("install", e => e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES))));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== SHELL).map(x => caches.delete(x))))));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.pathname.startsWith("/api/")) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then(r => r || caches.match("/"))));
});
// Push payloads are deliberately generic so a lock screen never shows someone's words.
self.addEventListener("push", e => e.waitUntil(self.registration.showNotification("Unsaid", { body: "You have a gentle update.", icon: "/icon-192.png", tag: "unsaid" })));
self.addEventListener("notificationclick", e => { e.notification.close(); e.waitUntil(clients.openWindow("/")); });
