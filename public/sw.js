const CACHE = "expressai-v1";
const OFFLINE = ["/","/index.html","/manifest.json","/logo-192.png","/logo-512.png"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(OFFLINE))));
self.addEventListener("fetch", e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
