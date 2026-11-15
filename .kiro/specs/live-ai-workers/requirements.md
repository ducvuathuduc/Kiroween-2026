# Live AI + Vectorize Second Brain — Requirements

## Overview

Resurrected Reader integrates Cloudflare Workers AI (`@cf/meta/llama-3.2-1b-instruct`, `@cf/baai/bge-m3`, `@cf/baai/bge-reranker-base`) and Cloudflare Vectorize on top of the existing Second Brain (`src/lib/secondBrain.ts`, `ReaderPane.tsx`, `FeedList.tsx`), while keeping all existing API contracts (`POST /api/summarize`, `POST /api/embed`), deterministic 4D Signal Radar scoring (`scoreItem()`, `explainScore()`), and honest no-binding fallbacks intact.

Only models surviving the Workers AI 20 Nov 2026 retirement are permitted:
- Text generation / TL;DR: `@cf/meta/llama-3.2-1b-instruct`
- Embeddings (1024 dimensions): `@cf/baai/bge-m3`
- Reranking: `@cf/baai/bge-reranker-base`

Retired models (including `llama-3.1-8b-fp8`, Kimi, GLM, and DeepSeek V4) SHALL NOT be referenced or invoked anywhere in the codebase.

## Requirements (EARS)

1. **Workers AI Summarization (`POST /api/ai/summarize`)**:
   WHEN the client requests a TL;DR summary via `POST /api/ai/summarize` with non-empty `title` and `content`, THE SYSTEM SHALL invoke Workers AI `@cf/meta/llama-3.2-1b-instruct` (when `env.AI` is available) and return structured JSON `{ tldr, takeaways, whyMatters, model, mode }`.
   WHEN `title` or `content` is missing or blank, THE SYSTEM SHALL return HTTP `400` JSON `{ error }`.

2. **Honest Extractive Summary Fallback**:
   WHEN `env.AI` is unavailable or Workers AI generation fails (and optional configured providers fail or are unconfigured), THE SYSTEM SHALL fall back cleanly to a deterministic extractive summary (`mode: 'extractive'`) returning valid JSON `{ tldr, takeaways, whyMatters, model: 'extractive', mode: 'extractive', fallbackReason }`, and SHALL label the rendered TL;DR honestly as an extractive fallback rather than claiming AI synthesis.
   WHEN an external provider (`POST /api/summarize`) or embedding endpoint (`POST /api/embed`) is called directly, THE SYSTEM SHALL preserve all existing status codes (`400`/`503`/`200`) and response schemas.

3. **Workers AI 1024-dim Embeddings (`POST /api/ai/embed`) & Async-Only Vectorize Ingest**:
   WHEN the client posts texts or items to `POST /api/ai/embed`, THE SYSTEM SHALL compute 1024-dimensional L2-normalized embeddings via `@cf/baai/bge-m3` when `env.AI` is bound, and SHALL return `{ available: false, model: '@cf/baai/bge-m3', dimensions: 1024, embeddings: {}, queuedIngest: false, reason }` honestly when `env.AI` is unavailable without fabricating vectors.
   WHEN `ingest: true` and items are provided for Vectorize storage, THE SYSTEM SHALL schedule `VECTORIZE.upsert(...)` strictly asynchronously using `ctx.waitUntil(...)` or a Cloudflare Queue producer (`EMBED_QUEUE.send(...)` + `queue` / `scheduled` worker handlers), NEVER blocking the HTTP request path on Vectorize indexing.

4. **Vectorize + Reranker Second Brain Resurface Pipeline (`POST /api/ai/resurface`)**:
   WHEN Second Brain computes resurfaced reads or related past reads via `POST /api/ai/resurface`, THE SYSTEM SHALL execute:
   - embed the query via `@cf/baai/bge-m3` (1024-dim),
   - query the Vectorize index with `topK: 10`,
   - rerank candidate contexts using `@cf/baai/bge-reranker-base` and retain the top `5`,
   - merge with a deterministic hybrid keyword / topic-overlap fallback (`computeTopicOverlapScore`),
   - deduplicate by item ID and normalized title (excluding the active target/top story), apply recency decay and a Signal Radar (`score / 100`) boost,
   - and attach explicit reasons explaining why each item resurfaced (`matchedTopStory`, `sharedTopics`, `matchKind`, `why`).
   WHEN `env.AI` or `env.VECTORIZE` is unavailable, THE SYSTEM SHALL fall back honestly to deterministic keyword/topic overlap + recency decay + Signal Radar boost labeled `topic-overlap`, without duplicating the existing Second Brain UI panels in `ReaderPane.tsx` or `FeedList.tsx`.

5. **Decay-Weighted Taste Vector & Feed Ranking**:
   WHEN 1024-dimensional embeddings exist for read or saved items, THE SYSTEM SHALL compute a decay-weighted mean taste vector (exponential half-life decay over interaction age, weighting saved items higher than read-only items, L2-normalized) and rank feed items using `0.5 * cosine(taste, item) + 0.5 * Signal Radar` with `1` deterministic explore slot placing an out-of-bubble unread item into the feed without mutating deterministic `item.score` or `item.scoreDimensions`.
   WHEN 1024-dimensional embeddings are unavailable, THE SYSTEM SHALL preserve the existing deterministic Signal Radar + optional local personal-boost ordering cleanly.

6. **Preservation & Verification**:
   THE SYSTEM SHALL NOT modify `workers/newsletter/`, `.github/workflows/deploy.yml`, or secret handling. TypeScript checks (`npx tsc --noEmit`, `npx tsc -p tsconfig.node.json --noEmit`), full unit tests (`npx tsx --test tests/*.test.ts`), linter (`npm run lint`), production build (`npm run build`), and headless Chromium preview verification SHALL pass.
