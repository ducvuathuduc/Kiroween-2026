# Design

Official references: https://vite-pwa-org.netlify.app/guide/auto-update and https://vite-pwa-org.netlify.app/guide/service-worker-strategies-and-behaviors . npm metadata reports vite-plugin-pwa 2.0.0, MIT, with Vite 8 support. Lock that version. generateSW avoids a handwritten worker. Explicit dist/client output/globDirectory matches Cloudflare's split client/worker build.

Use `registerType: 'autoUpdate'` and `injectRegister: false`. Application-owned native registration in src/lib/pwa/updates.ts observes installation/controller changes without an automatic reload. The new worker may activate/claim, but only the visible Reload button reloads the document. Check on focus and reconnect; no push/background sync. Workbox precache holds the shell; NetworkFirst navigation uses its precached index as error fallback. Reserved paths are excluded even if requested as navigations or asset-looking URLs.

The generated worker imports a tiny activation hook that drops only rr-pages-v1 navigation HTML. Without this, a cached previous-release page points at old hashed JS removed by Workbox's precache cleanup, producing a blank offline reload after an update. Latest precached index.html remains the fallback; RSS, real snapshots, covers and preferences are retained.

Only GET RSS is a Workbox API route. POST cover metadata is cached as a JSON Response under a synthetic GET Cache API key derived from the sorted URL batch. Read stale immediately, revalidate the original POST in the background, and apply successful fresh metadata. This does not intercept POSTs or change the server contract. External images themselves are not promised offline.

storage.ts owns a versioned Cache API snapshot: real items (bounded, retaining newest 20, briefing selection and selected item), feed health, timestamp, pulse, and selected data. Restore before first refresh; offline startup skips network refresh and never fabricates sample data. A failed online refresh retains genuine restored data. Existing localStorage summaries/preferences remain independent and unchanged; explicit Clear data clears PWA data caches too, not the shell cache.

Modern Web Guidance accessibility (live regions, native buttons, visible labels/focus) informs OFFLINE status, update feedback and native install disclosure. Keep Geist/shadcn zinc tokens, no new visual system.
