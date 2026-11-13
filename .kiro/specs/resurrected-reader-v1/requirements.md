# Spec: Resurrected Reader v1 — Requirements

## User stories

1. As a builder, I add an RSS feed URL and see its items appear in the radar, so I can track sources I care about.
2. As a builder, I see every item with a 0–100 Signal score, sorted highest first, so the important reads surface without scrolling.
3. As a builder, I filter by All / High signal (≥70) / Unread / Saved and search by title, so I can triage fast.
4. As a builder, I open an item in the reader pane with a short summary and an "Open original" link, so I can decide in seconds whether to read the full post.
5. As a builder, I turn a high-signal item into a Kiro task (Markdown spec with Goal + Acceptance criteria) copied to my clipboard, so reading becomes action.
6. As a builder, my feeds, read and saved state persist across visits, so the radar remembers me.

## Acceptance criteria

- [x] Add feed validates http(s) URL, fetches it, shows items; invalid URL shows an inline error, no crash.
- [x] A feed that fails to fetch shows a per-feed error; other feeds keep working.
- [x] Signal score 0–100, deterministic across 4 normalized dimensions (relevance 42%, recency 24%, authority 18%, novelty 16%), calibrated so high-signal real AWS/AI items land ≥70.
- [x] List sorted by score desc, then date desc. High-signal filter shows only ≥70.
- [x] Real feed image extraction (`media:content`, `media:thumbnail`, `enclosure`, `og:image`, RSS HTML `<img>`, and cached server-side `og:image` enrichment) rendered as thumbnails in the list and cover image in the reader pane, with a monogram tile fallback (never broken images).
- [x] Compact visual list rows showing thumbnail, title, score badge, and one-line summary (prioritizing Gemini TL;DR first line when available).
- [x] Clicking an item opens it in the reader pane with animated score count-up and marks it read.
- [x] Save/Unsave, Mark unread, Refresh all work. Refresh re-fetches all feeds and updates the timestamp.
- [x] Signal Radar view (Recharts): score distribution histogram, per-feed activity chart, and 4-dimension radar/spider chart per item built from live data.
- [x] System architecture view & modal pipeline tab: Mermaid diagram (`feed → score → action pipeline`) rendered cleanly in monochrome.
- [x] "→ Kiro task" shows a 3-file spec preview (`tasks.md`, `requirements.md`, `design.md`) plus item pipeline Mermaid tab, copies Markdown to clipboard, and downloads a `<slug>-kiro-spec.zip` bundle; AWS Docs MCP registered in `.kiro/settings/mcp.json`.
- [x] "Summarize" generates a structured Gemini TL;DR via server-side `POST /api/summarize` without exposing `GEMINI_API_KEY`.
- [x] Community Pulse displays live Hacker News top stories and GitHub `topic:aws` repositories with `localStorage` + session caching.
- [x] OPML import/export (Google Reader `.opml`), Web Share (`navigator.share` + clipboard fallback), and high-signal notifications (`≥85`) work natively.
- [x] Keyboard: j/k move selection, Enter opens/focuses item in reader, s save/unsave, r refresh, / search, Cmd/Ctrl+K opens fuzzy command palette.
- [x] "Why this score" click/keyboard breakdown popover on every item showing all 4 dimensions (relevance 42%, recency 24%, authority 18%, novelty 16%), weighted points, and matched explainScore() cues.
- [x] Dedicated "Daily Briefing" view highlighting top 5 high-signal items built from Gemini TL;DRs with one-click generation and reader/Kiro task handoff.
- [x] "New since last visit" markers backed by localStorage (`rr.lastVisit.v1`) and per-feed health metadata (last fetched timestamp + item count).
- [x] History API multi-page routes (`/docs`, `/shortcuts`, `/settings`, `/about`, `/changelog`, `/privacy`, plus `404` Not Found) sharing the Vercel Geist + shadcn/ui design system, with zero lorem ipsum.
- [x] Full developer workflow: `j`/`k`/`Enter`/`/`/`⌘K`/`o`/`s`/`e`/`b`/`r`/`?` keyboard shortcuts + `?` quick modal, Copy item as Markdown, Export all data as JSON, Settings (`density`, `defaultFilter`, alerts, `reducedMotion`), and Feed Health Dashboard inside `/system`.
- [x] "Summarize" routes through Vercel AI SDK v7 (`generateObject` + `generateText`) across configured providers (`Gemini → OpenAI → Anthropic → Amazon Bedrock`, preserving `@google/genai` direct Gemini path), skipping unconfigured providers silently without exposing server keys.
- [x] `GET /api/providers` reports live server-configured providers to Settings; unconfigured providers remain unselectable on the client.
- [x] Search box performs AI SDK `embed` + `cosineSimilarity` semantic ranking (`POST /api/embed`) when an embedding provider is available, falling back cleanly to local keyword search otherwise.
- [x] 6 sample items bundled so first open looks alive offline; labeled as sample.
- [x] `npm run build` passes; no console errors on load; no dead buttons; no lorem ipsum.

## Remote MCP access

- [x] Stateless Streamable HTTP at `/mcp` uses `createMcpHandler` from `agents@0.33.0` and `@modelcontextprotocol/server@2.4.0`, with no McpAgent, Durable Object, or stdio transport.
- [x] Exactly eight Zod-validated tools expose the default live feed catalog: `list_feeds`, `search_items`, `get_item`, `summarize_item`, `semantic_search`, `get_providers`, `daily_briefing`, and `export_kiro_task`. Browser-local subscriptions and read/saved state are not shared with MCP.
- [x] MCP reuses feed parsing, deterministic scoring, provider fallback, briefing selection, and Kiro spec generation. Failed feeds and missing AI credentials are reported honestly; MCP never substitutes sample items or invented summaries.
- [x] Tool registration, invalid inputs, and one real-data smoke call per tool are verified before shipping. Provider-backed success requires runtime credentials; the no-provider error/fallback remains testable without secrets.

## Workers runtime

- [x] Hono `4.13.18` replaces Express without changing the frontend or existing `/api/health`, `/api/providers`, `/api/rss`, `/api/og-images`, `/api/summarize`, and `/api/embed` JSON contracts, status codes, caches, or RSS URL guard.
- [x] Workers + Static Assets (not Pages) uses `@cloudflare/vite-plugin@1.69.1` and `wrangler@4.161.0`; SPA routes load through the asset binding, and `/api/*` plus `/mcp` always reach the Worker first.
- [x] Local Wrangler smoke tests cover `/mcp` and every API route, including validation errors, missing credentials, real RSS XML, and private-address rejection. No deployment or secret publication occurs during verification.

## Judging-readiness hardening

- [x] RSS and OpenGraph proxies reject localhost names, private/reserved IPv4 literals, credentials, and IPv6 literals (including mapped loopback). Validate every redirect before fetching, limit redirect hops, and keep public-domain feeds and images working. This hostname/literal guard does not claim DNS-rebinding protection.
