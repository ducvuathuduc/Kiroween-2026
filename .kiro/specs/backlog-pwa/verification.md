# PWA verification — 2026-11-13

## Quality gates

After rebasing onto origin/main 096e233, `npm run build`, `npx tsc --noEmit`, `npx tsc -p tsconfig.node.json --noEmit`, `npm run lint`, and `npx tsx --test tests/*.test.ts` passed. All 68 tests passed, including five PWA regressions. Lint reports the three existing Fast Refresh warnings in ui/button, ui/badge and ui/tabs. Build retains existing large-chunk/dynamic-import warnings.

vite-plugin-pwa 2.0.0 (MIT, Vite 8 compatible) generates `dist/client/sw.js` and its Workbox runtime, precaching 107 client entries (6657.87 KiB), not the Worker output. Public manifest and both PNG dimensions were fetched from the built preview. Icons were rendered with ImageMagick directly from public/favicon.svg.

`npx lighthouse <preview-url> --only-categories=pwa` was run with the installed Chromium via CHROME_PATH. Lighthouse 13.6.0 rejects the removed category: `unrecognized category in 'onlyCategories': pwa`. There is no PWA score to report.

## Real built-browser acceptance

Supervised `npm run preview -- --port 3101`, Chromium, 1280×800 and 390×844 at DPR 2. No mocked feeds or injected app data. The three actual default feeds returned 20 items each. Cache API snapshot contained **60 real items, zero SAMPLE items**, plus 18 HN and 15 GitHub pulse entries. Example: **Build a model improvement flywheel with Amazon SageMaker HyperPod Data Capture**. The final verified snapshot timestamp was **2026-11-13T18:21:02Z** (rounded here).

Set genuine browser network Offline; additionally stopped the preview service to rule out a still-online service-worker network path. Reloaded both `/briefing` and `/`: shell rendered, OFFLINE badge appeared, all **60 option rows** were present, and the same five real briefing titles survived. Selected the Fine-grained access control article; its selected ID and reader heading survived another offline reload. Existing localStorage preferences/summaries were not reset. Resumed the service and returned Online: OFFLINE badge disappeared and `/api/health` returned 200.

Cache inspection found the client precache, reader snapshot, synthetic GET cover-metadata entries, RSS-only API responses, and navigation HTML. Offline fetches to `/api/providers`, `/api/health`, `/mcp`, `/a2a`, and `/.well-known/agent-card.json` failed rather than returning cached responses. Route-policy tests also exclude summarize, embed, POST cover requests, future APIs and protocol navigations. No push or Background Sync is registered.

Verified real successive builds: new worker installs/activates, Update available appears without changing performance.timeOrigin, Later dismisses with focus returned to options and leaves a permanent reload menu action, and Reload explicitly navigates to the new build. Found and fixed stale navigation HTML referring to deleted old hashed chunks: the generateSW activation hook now deletes only navigation HTML, with a regression test. Repeated offline reload after that update with the server stopped passed. Browser page-error log was empty on final online/offline checks; network failures while offline are expected.

## Visual evidence and limitations

Reviewed desktop/narrow offline briefing, offline reader, and update screenshots in the worktree `.amp/in/artifacts/`. Inspected the 8.9-second real-pointer interaction recording frame-by-frame via a 5-fps contact sheet: update dismissal, options/install hint, offline transition, and offline refresh. Narrow captures are Chromium viewport checks, not real iOS-device tests. iOS installation is manual guidance only and was not installed on a physical device.

No configured AI provider was available; no paid provider-backed success or generated summary is claimed. Briefing uses genuine extractive text (0/5 synthesized); existing summary persistence remains intact. External article image bytes are not promised offline; the cover metadata POST contract is preserved using app-level StaleWhileRevalidate under synthetic GET keys. Browser quota/eviction/private-mode restrictions can prevent durable storage; the application continues in memory. No deployment, publication, push, or deployment workflow was triggered by this lane.
