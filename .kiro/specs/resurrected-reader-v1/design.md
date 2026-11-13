# Spec: Resurrected Reader v1 — Design

## Architecture
React 19 + Vite 8 + TypeScript + Tailwind v4 app paired with a lightweight Express server (`server.ts` + `server/ai.ts`) for server-side RSS proxying (`/api/rss`), Vercel AI SDK v7 multi-provider summarization (`/api/summarize` with `generateObject`/`generateText` over `Gemini → OpenAI → Anthropic → Bedrock` + `@google/genai` direct path), provider discovery (`/api/providers`), semantic search embeddings (`/api/embed`), and SSRF-guarded OpenGraph image enrichment (`/api/og-images`).

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
