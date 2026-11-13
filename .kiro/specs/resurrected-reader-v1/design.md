# Spec: Resurrected Reader v1 — Design

## Architecture
React 19 + Vite 8 + TypeScript + Tailwind v4 app paired with a lightweight Express server (`server.ts`) for server-side Gemini TL;DR summarization (`/api/summarize`) and SSRF-guarded OpenGraph image enrichment (`/api/og-images`).

```
fetch RSS/Pulse → extract media + normalize → 4D deterministic score → Reader / Signal Radar / Kiro Task
```

- `src/lib/feeds.ts` — `fetchFeed(source)` via `https://api.rss2json.com/v1/api.json?rss_url=` (primary) with fallback to `api.allorigins.win` / direct CORS `DOMParser`; extracts `imageUrl` from `media:content`, `media:thumbnail`, `enclosure`, `og:image`, and HTML `<img>`.
- `src/lib/scoring.ts` — `scoreItem(...)` and `explainScore(...)`: deterministic 4-dimension (0–100 each) model combining `relevance` (42%), `recency` (24%), `authority` (18%), and `novelty` (16%).
- `src/lib/pulse.ts` — Hacker News Firebase API & GitHub Search API (`topic:aws`) builder pulse with GitHub OpenGraph/avatar thumbnails.
- `src/lib/sampleData.ts` — 6 realistic sample items (AWS/Kiro/AI-agents themed), used only when all feeds fail or return empty.
- `src/components/` — `TopBar` (with view switcher: `Feed` | `Signal Radar` | `System`), `FeedList`, `ItemList` (thumbnails + 1-line summary), `ReaderPane` (cover banner + animated score + Gemini TL;DR), `SignalRadarView` (Recharts histogram, feed activity, 4D radar chart + Mermaid pipeline), `KiroTaskModal` (3-file spec tabs + Mermaid pipeline tab + `.zip` download), `ItemThumbnail`, `AnimatedScore`, `MermaidDiagram`, `SafeHtml`, and `shadcn/ui` primitives in `src/components/ui/`.
- `src/App.tsx` — state (feeds, items, pulse, selection, filters, saved/read sets, cached summaries), `localStorage` persistence, keyboard shortcuts, and non-blocking `/api/og-images` cover enrichment.

## Data flow
1. On load: read feeds + cached pulse + summaries + state from `localStorage`; seed default feeds if none.
2. Fetch all feeds + Community Pulse in parallel; extract feed media; score each item across 4 dimensions; sort by score desc, date desc.
3. Enrich items missing RSS images with real article `og:image` metadata via `POST /api/og-images` (cached server-side).
4. Render 3-pane Reader (`Feed`), real-data Recharts analytics (`Signal Radar`), or Mermaid architecture diagram (`System`).
5. "→ Kiro task" opens `KiroTaskModal` with `tasks.md`, `requirements.md`, `design.md`, and `pipeline` Mermaid preview, plus clipboard copy and `.zip` bundle download.

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
