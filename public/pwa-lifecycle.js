// NetworkFirst HTML from an older release points to obsolete hashed chunks.
// Drop only navigation responses on activation; generateSW's new precached
// index.html is the offline fallback. Reader data/preferences stay intact.
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.delete('rr-pages-v1'))
})
