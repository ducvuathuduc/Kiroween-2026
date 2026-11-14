# Tasks — Backlog #10 Newsletter-to-Feed Bridge

- [x] Install `postal-mime` (MIT) cleanly via `install_applet_package`.
- [x] Extend `FeedSource` in `src/lib/feeds.ts` with `kind?: 'rss' | 'newsletter'`, `inboundAddress?: string`, and `createdAt?: string`.
- [x] Implement pure newsletter data model, CSPRNG `generateFeedId()`/`generateMailboxId()`, MIME parser (`parseRawEmail()`), HTML→text cleaner, deduplication, and RSS/Atom/JSON Feed + ETag serializers in `src/lib/newsletter.ts`, plus `rr.newsletter.v1` local storage helpers in `src/lib/storage.ts`.
- [x] Create isolated sibling Worker `workers/newsletter/wrangler.toml` and `workers/newsletter/src/index.ts` (Hono HTTP + Cloudflare `email()` handler using `postal-mime`, without touching root `wrangler.jsonc` bindings).
- [x] Add local/preview `/rss/:feedId`, `/atom/:feedId`, `/json/:feedId`, and `/api/newsletter/*` routes in `server.ts` (zero bindings) + update `wrangler.jsonc` `run_worker_first` and `src/lib/pwa/cachePolicy.ts`.
- [x] Build monochrome shadcn `NewsletterModal` (`src/components/NewsletterModal.tsx`) for creating feeds (unguessable ID + copyable inbound address), listing/deleting feeds, and pasting raw email / uploading `.eml` files; wire into `FeedList.tsx`, `SettingsPage.tsx`, and `App.tsx` so entries flow into `explainScore()` and `/api/summarize`.
- [x] Write `tests/newsletter.test.ts` testing MIME header/body/HTML→text parsing, `feedId` unguessability/entropy, deduplication, and RSS/Atom/JSON Feed outputs with fixtures (zero live network calls).
- [x] Verify `tsc` (app + node), `lint`, `tests/*.test.ts`, `build`, `promptfoo`, and end-to-end browser verification on `npm run preview` (create newsletter feed → paste AWS email → appears, scores, summarizes → `/rss/:feedId` serves XML → delete removes feed and 404s `/rss/:feedId`).
