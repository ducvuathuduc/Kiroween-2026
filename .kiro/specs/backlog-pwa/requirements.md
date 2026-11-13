# Backlog #1 — Offline reader PWA

- Install a free MIT vite-plugin-pwa compatible with Vite 8, using generateSW and autoUpdate with an application-owned, visible reload lifecycle (never silently reload).
- Ship public manifest and 192/512 PNGs rendered from the existing favicon. Keep the monochrome reader UI. iOS installation is a manual Share → Add to Home Screen hint, not an install-event assumption.
- Built client shell and self-hosted fonts/scripts/styles work offline after one successful online visit. Development does not register a worker.
- NetworkFirst (5 seconds) handles ordinary navigations and GET /api/rss only. Cover metadata uses application-level StaleWhileRevalidate because /api/og-images is POST; preserve that contract. No other API, MCP, A2A, agent-card, provider, AI, push, or Background Sync interception.
- Persist genuine fetched items, briefing inputs, selection and fetch timestamp through storage.ts using Cache API. Offline reload restores at least the last 20 real items and the last briefing without sample substitution or preference resets. Existing summary storage is retained.
- TopBar announces OFFLINE. A visible Update available toast offers explicit reload, with loading/error feedback. Manual install help is accessible on narrow screens.
- Verify built preview online → genuine browser Offline → reload, cache contents, excluded routes, returning online, and update/reload. Run build, both TypeScript checks, lint, tests and the requested Lighthouse PWA command (report removal of the category honestly). Inspect desktop/narrow states and a real-pointer recording. Never deploy.
