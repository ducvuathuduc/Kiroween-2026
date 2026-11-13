# Spec: Resurrected Reader v1 — Design

## Architecture
React 19 + Vite 8 + TypeScript + Tailwind v4 app paired with a Hono Cloudflare Worker (`server.ts` + `server/ai.ts`) for server-side RSS proxying (`/api/rss`), Vercel AI SDK v7 multi-provider summarization (`/api/summarize` with `generateObject`/`generateText` over `Gemini → OpenAI → Anthropic → Bedrock` + `@google/genai` direct path), provider discovery (`/api/providers`), semantic search embeddings (`/api/embed`), and SSRF-guarded OpenGraph image enrichment (`/api/og-images`).

```
fetch RSS/Pulse → extract media + normalize → 4D deterministic score → Reader / Briefing / Signal Radar / Kiro Task
```

- `server/ai.ts` — multi-provider Vercel AI SDK v7 router (`generateObject`, `generateText`, `embed`, `embedMany`, `cosineSimilarity`) sitting above the `@google/genai` direct Gemini path (`gemini-4-hydrogen`); silently skips unconfigured keys.
- `src/lib/providers.ts` — pure provider metadata, fallback chain order (`resolveSummarizeOrder`, `resolveEmbeddingOrder`), and cosine search ranking helper (`rankItemsByCosine`).
- `src/lib/feeds.ts` — `fetchFeed(source)` via same-origin `/api/rss?url=` (primary) with fallback to `api.rss2json.com` and `api.allorigins.win` `DOMParser`; extracts `imageUrl` from `media:content`, `media:thumbnail`, `enclosure`, `og:image`, and HTML `<img>`.
- `src/lib/scoring.ts` — `scoreItem(...)`, `explainScore(...)`, and `SIGNAL_DIMENSION_META`: deterministic 4-dimension (0–100 each) model combining `relevance` (42%), `recency` (24%), `authority` (18%), and `novelty` (16%).
- `src/lib/briefing.ts` — pure selectors & search: `selectDailyBriefingItems`, `isNewSince`, `countNewSince`, `fuzzyMatchScore`, and `searchCommandTargets` (indexing views, feeds, items, and production pages).
- `src/lib/routes.ts` — History API route parser and URL builder for `/`, `/briefing`, `/radar`, `/system`, `/docs`, `/shortcuts`, `/about`, `/changelog`, `/privacy`, `/settings`, and `*` (`not-found`).
- `src/lib/shortcuts.ts` — single source of truth `KEYBOARD_SHORTCUTS` registry used by both the `ShortcutsPage` and the `?` `KeyboardShortcutsModal`.
- `src/lib/export.ts` — pure `formatItemAsMarkdown`, `buildFullDataExport`, `downloadJsonExport`, safe `openExternalUrl`, and `copyPlainText` utilities.
- `src/lib/storage.ts` — resilient `localStorage` helpers, `rr.lastVisit.v1` checkpoint management, `ReaderSettings` sanitization/persistence (`rr.settings.v1`, including `aiProvider`), and `clearReaderStorage`.
- `src/lib/pulse.ts` — Hacker News Firebase API & GitHub Search API (`topic:aws`) builder pulse with GitHub avatar thumbnails.
- `src/lib/sampleData.ts` — 6 realistic sample items (AWS/Kiro/AI-agents themed), used only when all feeds fail or return empty.
- `src/components/` — `TopBar` (shared `layoutId` view switcher: `Feed` | `Briefing` | `Signal Radar` | `System`, `Cmd+K` trigger, `?` shortcuts button, and directory menu), `FeedList`, `ItemList`, `ReaderPane` (including `Copy Markdown` and density support), `DailyBriefingView`, `SignalRadarView` (with live **Feed Health Dashboard** table), `PageShell`, `DocsPage`, `ShortcutsPage`, `AboutPage`, `ChangelogPage`, `PrivacyPolicyPage`, `SettingsPage`, `NotFoundPage`, `KeyboardShortcutsModal`, `CommandPalette`, `ScoreBreakdownPopover`, `KiroTaskModal`, `ItemThumbnail`, `AnimatedScore`, `MermaidDiagram`, `SafeHtml`, and `shadcn/ui` primitives (`switch`, `button`, `dialog`, `dropdown-menu`, etc.) in `src/components/ui/`.
- `src/App.tsx` — History API routing (`pushState`, `popstate`, `document.title`), state orchestration (feeds, feed health, items, pulse, selection, filters, saved/read sets, cached summaries, settings, `MotionConfig`), `localStorage` persistence, and global keyboard shortcuts (`Cmd+K`, `?`, `j`, `k`, `Enter`, `o`, `s`, `e`, `b`, `r`, `/`).

## Data flow
1. On load: read feeds, cached pulse, summaries, reader settings (`density`, `defaultFilter`, `highSignalThreshold`, `reducedMotion`), and previous visit timestamp from `localStorage`; seed default feeds if none; parse `window.location.pathname` to set initial route.
2. Fetch all feeds + Community Pulse in parallel; record per-feed health (`lastFetchedAt`, `itemCount`, `error`); extract feed media; score each item across 4 dimensions; sort by score desc, date desc.
3. Enrich items missing RSS images with real article `og:image` metadata via `POST /api/og-images` (cached server-side).
4. Render 3-pane Reader (`/`), Top 5 Gemini digest (`/briefing`), Recharts analytics (`/radar`), System & Feed Health Dashboard (`/system`), or any editorial/utility page (`/docs`, `/shortcuts`, `/about`, `/changelog`, `/privacy`, `/settings`, or `404`).
5. "→ Kiro task" (`e`) opens `KiroTaskModal` with `tasks.md`, `requirements.md`, `design.md`, and `pipeline` Mermaid preview, plus clipboard copy and `.zip` bundle download.

## Scoring formula (4 deterministic dimensions, 0–100 each)
```
score = clamp(0, 100, round(
  0.42 * relevance +   // kiro, aws/bedrock/s3/lambda, agent/agentic/mcp/a2a, llm/ai coding, security/iam, startup/cost
  0.24 * recency +     // decay curve: <=6h (100), <=24h (88), <=48h (74), <=72h (62), <=7d (46), <=14d (28), older (14)
  0.18 * authority +   // official AWS engineering domain/feed + technical depth/API cues + summary depth
  0.16 * novelty       // launch/GA/v2 signals + actionable how-to verbs + emerging stack terms
))
```

## Visual design
Google Reader 3-pane layout reborn in the Vercel Geist light aesthetic (`#FFFFFF` background, `#171717` ink, `border-zinc-200` hairlines, self-hosted `Geist Variable` / `Geist Mono Variable` typography, `13px` base density, translucent `backdrop-blur-xl` glass TopBar and Dialog modal, real `shadcn/ui` controls, `@ui-sdk/react` `Listbox` keyboard navigation, `Recharts` + `Mermaid` data visualizations, and crisp 150–250ms `motion/react` transitions). Monochrome and editorial, no decorative gradients or rainbow palettes.

## Stateless MCP

`server/mcp.ts` creates a fresh SDK v2 `McpServer` per request through `agents/mcp/server` at `/mcp`, using stateless Streamable HTTP (JSON for modern requests, SSE for legacy-compatible requests). Its Worker-compatible fetch export is also mounted by the local server. All eight tools validate inputs with Zod and return text-encoded JSON; tool failures set `isError` rather than masquerading as successful data.

`server/items.ts` loads the existing `DEFAULT_FEEDS` through rss2json, reuses `parseRss2Json` (no browser DOM dependency), and applies `explainScore`. A five-minute, isolate-local cache reduces upstream traffic without implying durable storage. Partial upstream failures are included in results; total failure raises an error. Item IDs come from the existing parser. The default catalog is public and separate from browser-local state. `daily_briefing` selects the existing top five without automatically generating paid summaries; `semantic_search` uses existing embeddings with an explicit keyword fallback. Summaries require a configured provider and never fabricate an offline AI result.

## Workers hosting

`server.ts` exports a Hono app with Web Request/Response handlers, a 192 KiB JSON body limit, and the existing API status/payload contracts. The Cloudflare Vite plugin runs this entry in local workerd and builds separate Worker and client outputs. `wrangler.jsonc` enables `nodejs_compat` for the existing AI SDK adapters and request-local MCP context. Runtime secrets populate server-side `process.env`; no secret is embedded in Vite's client configuration.

Static Assets serves the unchanged React application with SPA navigation fallback. Worker-first routing covers `/api/*` and `/mcp`, so an unknown or non-GET protocol request cannot be swallowed by the SPA. `npm run dev` runs Vite/workerd; `npm run start` runs the built Worker locally through Wrangler. Neither command deploys.

## Public proxy boundaries

Both RSS and OpenGraph use the same canonical URL check and manual redirect loop (at most five redirects under the existing total request timeout). Reject localhost aliases, local/internal names, credentials, private/reserved IPv4 literals, and all IPv6 literals; domain-based public IPv6 services still work through their hostnames. Revalidate each redirect target before making another request and cancel discarded response bodies. Invalid initial RSS URLs remain HTTP 400; blocked redirects fail as HTTP 502, while OpenGraph keeps its null-image failure contract. DNS resolution/rebinding protection is not provided by this literal/hostname check and must also be enforced by the deployment network.

## Source authority boundaries

`explainScore` parses an article link with the native URL API and checks its HTTP(S) hostname, allowing `aws.amazon.com` and dot-delimited subdomains (case-insensitive, with an optional DNS trailing dot). If no link exists, `aws-news` and `aws-ml` remain recognized catalog sources. A supplied link takes precedence over that fallback, and arbitrary `aws*` IDs or URL substrings confer no authority bonus. Relevance, recency, novelty, weights, and the 70-point high-signal threshold are unchanged.

## Documentation consistency

Update the existing repository documentation and help-page copy in place, retaining CSS, layout, navigation, and interactions. Distinguish deterministic scoring from optional AI, browser-local state from server caches/MCP's public catalog, and local builds from a live deployment. The Docs MCP section explains the reader's HTTP endpoint separately from the AWS Documentation MCP configuration. Privacy copy identifies feed/proxy/provider recipients without promising that third parties receive no network metadata. Existing historical changelog entries remain historical rather than being rewritten as current architecture.

## Continuous verification

`.github/workflows/ci.yml` runs on main pushes and pull requests, on Ubuntu with owner-approved Node 22.x (>=22.12, required by locked Wrangler; no dependency downgrades). Install with `npm ci` and npm download caching, then run both TypeScript checks, lint, `tests/*.test.ts`, and the full build. Pin checkout/setup-node v4 actions to verified upstream commit IDs and limit the job token to contents-read. CI has no deployment command, deployment credential, AI secret, package publication, or manual-dispatch trigger. Real-feed tests need public network access and must fail honestly when their contract is not met. Separate `deploy.yml` repeats all gates before manual-only deployment of `dist/worker/wrangler.json`; `evals.yml` gates deterministic scoring and schedules opt-in advisory judging, honestly reporting absent feature #8 prerequisites. See `.kiro/specs/backlog-ci/` for scope and verification limitations.

## RSS response byte limit

Pipe the upstream body through a native TransformStream that counts chunk byte lengths before forwarding them to Response's UTF-8 decoder. Crossing 2 MiB errors the stream and cancels its source; no partial result enters the five-minute cache. Keep the existing HTTP 502 upstream-error contract, timeout, URL guard, and normal XML response. Verify both sides of the exact boundary with Cloudflare's real public byte-download endpoint, alongside the existing live AWS XML/cache test. This limits consumed response-body bytes, not transport buffers or unrelated fallback services.

## Diagram label legibility

Mermaid's default SVG edge-label rectangles have opacity 0.5, allowing connector strokes to show through text. Set their opacity to 1 through Mermaid's diagram-scoped themeCSS option in the shared renderer. Retain the existing fill, dimensions, layout, SVG sanitization, and all non-label styling. Verify computed opacity and rendered System diagrams at desktop/narrow widths, plus the Kiro task pipeline that shares this renderer.

## Honest spec handoff

The Kiro modal generates a preview and downloadable spec, not an executed build or AWS Documentation MCP result. Replace its static "aws-docs MCP Verified Build" node with "AWS Docs MCP in Kiro", matching the existing System diagram and configured `.kiro/settings/mcp.json` integration. Preserve all preview/export behavior and styles. Inspect the real-article modal and its displayed pipeline source; actual Kiro execution remains separate evidence.
