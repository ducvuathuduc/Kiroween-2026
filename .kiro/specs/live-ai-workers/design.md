# Live AI + Vectorize Second Brain — Design

## 1. Architecture Overview

The implementation builds cleanly on top of the existing Second Brain (`src/lib/secondBrain.ts`, `src/lib/semanticSearch.ts`, `ReaderPane.tsx`, `FeedList.tsx`) and existing multi-provider AI server (`server/ai.ts`, `server.ts`) without duplicating panels or breaking legacy endpoints.

```
Browser (App.tsx)
  ├─ TL;DR ──────────────────────► POST /api/ai/summarize
  │                                   └─ env.AI (@cf/meta/llama-3.2-1b-instruct)
  │                                   └─ optional summarizeWithFallback()
  │                                   └─ deterministic extractive fallback (always valid JSON)
  │
  ├─ Async Ingest & 1024d Vecs ──► POST /api/ai/embed
  │                                   ├─ env.AI (@cf/baai/bge-m3, 1024-dim)
  │                                   └─ ctx.waitUntil(VECTORIZE.upsert) or EMBED_QUEUE.send
  │
  ├─ Second Brain Resurface ─────► POST /api/ai/resurface
  │                                   └─ bge-m3 query → VECTORIZE.query(topK: 10)
  │                                   └─ @cf/baai/bge-reranker-base → top 5
  │                                   └─ hybrid keyword/topic fallback + dedupe
  │                                   └─ recency decay + Signal Radar boost + why reasons
  │
  └─ Feed Ranking (when vecs) ───► src/lib/tasteVector.ts
                                      └─ decay-weighted mean of read/saved 1024d vectors
                                      └─ 0.5 * cosine(taste) + 0.5 * (Signal Radar / 100)
                                      └─ + 1 explore slot (unread out-of-bubble pick)
```

## 2. Workers Bindings & Configuration (`wrangler.jsonc`, `server/liveAi.ts`, `server.ts`)

- **Structural Bindings Types** (`server/liveAi.ts`):
  Define lightweight structural TypeScript interfaces compatible with `tsconfig.node.json` (`"types": ["node"]`, `"erasableSyntaxOnly": true`):
  - `WorkersAiBinding`: `{ run(model: string, input: Record<string, unknown>): Promise<unknown> }`
  - `VectorizeIndexBinding`: `{ query(vector: number[], options: { topK: number; returnMetadata?: 'all' | 'indexed' | 'none'; returnValues?: boolean }): Promise<{ matches: VectorizeMatch[] }>; upsert(vectors: VectorizeVector[]): Promise<unknown> }`
  - `QueueBinding`: `{ send(body: unknown): Promise<void> }`
  - `ExecutionCtxLike`: `{ waitUntil(promise: Promise<unknown>): void }`
- **Surviving Models Constants**:
  - `WORKERS_AI_SUMMARY_MODEL = '@cf/meta/llama-3.2-1b-instruct'`
  - `WORKERS_AI_EMBED_MODEL = '@cf/baai/bge-m3'` (`BGE_M3_DIMENSIONS = 1024`)
  - `WORKERS_AI_RERANK_MODEL = '@cf/baai/bge-reranker-base'`
- **`wrangler.jsonc`**:
  Add `ai: { "binding": "AI" }` and `vectorize: [{ "binding": "VECTORIZE", "index_name": "resurrected-reader-second-brain" }]` if supported cleanly by `@cloudflare/vite-plugin` during `vite build` & `vite preview`; verify immediately with `npm run build`.
- **Worker Entrypoint (`server.ts`)**:
  Preserve `export default app` compatibility for tests or export an object/Hono app cleanly (`queue` and `scheduled` handlers exported alongside `app.fetch` or testable helpers in `server/liveAi.ts` — noting `tests/api.test.ts` imports `app` and calls `app.request(...)`! Keep `export default app` as the Hono instance or attach `queue`/`scheduled` / export named Worker handlers so `app.request(...)` in `tests/*.test.ts` continues working without modification!).
  *Critical detail*: `tests/api.test.ts` line 3 does `import app from '../server.ts'` and line 9 calls `app.request(path, init)`. Therefore `default` export in `server.ts` MUST remain the Hono `app` (or have `.request`), while named exports `queue` and `scheduled` (or a Worker wrapper) expose async queue/cron ingestion! Let's check: in Cloudflare Workers Hono apps, exporting `export const queue = ...` and `export const scheduled = ...` alongside `export default app` keeps `app.request` 100% intact and provides async handlers.

## 3. Endpoints & Algorithms (`server/liveAi.ts`)

### 3.1 `POST /api/ai/summarize`
1. Validate `title` and `content`; return `400` if empty.
2. If `env.AI` is present, call `env.AI.run('@cf/meta/llama-3.2-1b-instruct', { messages: [{ role: 'system', content: SUMMARY_JSON_SYSTEM_PROMPT }, { role: 'user', content: buildSummaryPrompt(...) }], max_tokens: 320 })`, parse JSON `{ tldr, takeaways, whyMatters }`.
3. If `env.AI` is absent or returns invalid/empty output, try `summarizeWithFallback()` only if an external provider key is configured; otherwise run `buildExtractiveSummary({ title, feedTitle, content })`.
4. `buildExtractiveSummary(...)` deterministically extracts up to 2 lead sentences for `tldr`, up to 3 distinct bullet sentences for `takeaways`, and a topic-grounded `whyMatters` line noting which curated AWS/builder topics matched (`extractItemTopics`), returning:
   ```json
   {
     "tldr": "...",
     "takeaways": ["..."],
     "whyMatters": "...",
     "model": "extractive",
     "mode": "extractive",
     "fallbackReason": "Workers AI binding unavailable; showing extractive summary."
   }
   ```
5. `POST /api/summarize` continues calling `summarizeWithFallback` and returning `503` when unconfigured (`tests/api.test.ts`).

### 3.2 `POST /api/ai/embed` (1024-dim `@cf/baai/bge-m3` + Async-Only Vectorize Ingest)
1. Accept `{ texts?: string[], items?: EmbedIngestItem[], ingest?: boolean }`.
2. If `!env.AI`, return `{ available: false, model: '@cf/baai/bge-m3', dimensions: 1024, embeddings: {}, queuedIngest: false, reason: 'Workers AI binding unavailable.' }` (HTTP `200`, never fabricating vectors).
3. Call `env.AI.run('@cf/baai/bge-m3', { text: batch })`, validate each returned vector is length `1024` and finite, L2-normalize.
4. **Async-Only Ingest**:
   - If `ingest === true` and `items.length > 0`:
     - If `env.EMBED_QUEUE` exists, schedule `env.EMBED_QUEUE.send({ items })` via `scheduleBackground(ctx, ...)` (returning immediately).
     - Else if `env.VECTORIZE` exists, construct Vectorize upsert batch (`id`, `values` 1024-dim, `metadata: { id, title, feedTitle, pubDate, interactedAt, score }`) and pass the promise to `ctx.waitUntil(upsertPromise)` (never `await`ing it on the HTTP response path).
     - Return `queuedIngest: true` immediately once the background work is scheduled.

### 3.3 `POST /api/ai/resurface` (Vectorize topK 10 → Rerank top 5 → Hybrid Fallback → Dedupe + Decay + Signal Radar + Why)
1. Accept `{ query, topStory?, candidates, minAgeDays?, limit?, nowMs? }`.
2. When `env.AI` and `env.VECTORIZE` are available:
   - **Step 1**: Embed `query` via `@cf/baai/bge-m3` (1024-dim).
   - **Step 2**: Query `env.VECTORIZE.query(queryVec, { topK: 10, returnMetadata: 'all' })`.
   - **Step 3**: Build rerank contexts from Vectorize matches (cross-referenced with `candidates` when provided, filtered for age `> minAgeDays` if `minAgeDays > 0`, deduplicated by `id` and normalized `title`, excluding `topStory`). Run `env.AI.run('@cf/baai/bge-reranker-base', { query, contexts })` to score the `topK: 10` matches and take the **top 5**.
   - **Step 4**: Run deterministic hybrid keyword / topic-overlap fallback (`computeTopicOverlapScore`) across `candidates`, merging any strong keyword/topic hits not already in the top 5 and deduplicating by ID + normalized title.
   - **Step 5**: Compute final resurface score combining semantic/rerank score, recency decay (`exp(-daysSinceInteraction / 60)` weighted gently so older >30d evergreen reads remain discoverable while ancient stale items decay), and Signal Radar boost (`0.15 * (score / 100)`), clamped `[0, 1]`, keeping `matchKind: 'semantic'` for Vectorize/reranker hits and `'topic-overlap'` for keyword-only hits.
   - **Step 6**: Always attach explicit `why` / `sharedTopics` / `matchedTopStory` / `rerankScore` so the UI explains *why* every item resurfaced.
3. When `env.AI` or `env.VECTORIZE` is unavailable:
   - Run the deterministic `topic-overlap` + recency decay + Signal Radar boost pipeline over `candidates`, returning `mode: 'topic-overlap'` with explicit `sharedTopics` and `why` text — never labeling fallback scores as semantic or AI.

## 4. Decay-Weighted Taste Vector & Feed Ranking (`src/lib/tasteVector.ts`)

- `BGE_M3_DIMENSIONS = 1024`
- `computeDecayWeightedTasteVector(entries, nowMs = Date.now(), halfLifeDays = 14)`:
  - Takes `{ id, vector, interactedAt, saved?: boolean }[]`.
  - Filters to finite 1024-dim vectors with valid timestamps.
  - Weight per entry: `(entry.saved ? 1.5 : 1.0) * Math.exp((-ageDays * Math.LN2) / halfLifeDays)`.
  - Accumulates weighted sum across 1024 dimensions and L2-normalizes the resulting vector (returns `null` if total weight <= 0).
- `rankFeedWithTasteVector(items, itemVectors, tasteVector, options)`:
  - For each item:
    - `signalNorm = clamp01((item.score ?? 0) / 100)`
    - `cosineRaw = itemVector ? cosineSimilarity(itemVector, tasteVector) : null`
    - `cosineNorm = cosineRaw !== null ? clamp01((cosineRaw + 1) / 2) : null` (or `[0, 1]` direct clamp for normalized positive BGE-M3 similarities; mapping `Math.max(0, Math.min(1, cosineRaw))` preserves direct cosine `[0, 1]` semantics cleanly). Let's use `Math.max(0, Math.min(1, cosineRaw))` when `cosineRaw !== null` so `0.5 * cosine(taste) + 0.5 * Signal Radar` directly matches the formula!
    - If `cosineNorm !== null`: `combined = 0.5 * cosineNorm + 0.5 * signalNorm`.
    - Else: `combined = 0.5 * signalNorm` (or neutral `0.5 * 0 + 0.5 * signalNorm`, ensuring embedded taste-matched items outrank unembedded ones cleanly while keeping Signal Radar order among unembedded items).
  - **1 Explore Slot (`exploreSlotIndex = 3`, clamped to list bounds when `ranked.length >= 4`)**:
    - Picks an unread candidate not already in the top `exploreSlotIndex` slots that has `Signal Radar >= 40` and lowest cosine similarity to the taste vector (an out-of-bubble high-signal discovery), moves it into `exploreSlotIndex`, and marks `isExploreSlot: true` with `exploreReason: 'Explore slot: outside your usual reading cluster'`.
  - Never modifies `item.score` or `item.scoreDimensions`.

## 5. Client Integration (`src/lib/summarize.ts`, `src/App.tsx`, `ReaderPane.tsx`, `DailyBriefingView.tsx`, `ItemList.tsx`)

- **`handleSummarize` in `src/App.tsx`**: Calls `POST /api/ai/summarize` first; `parseSummarizeResponse` accepts optional `model`, `mode` (`'workers-ai' | 'provider' | 'extractive'`), and `fallbackReason`. `ReaderPane` and `DailyBriefingView` display the mode badge honestly (e.g., `Workers AI · llama-3.2-1b-instruct` or `extractive fallback`).
- **Async Background Ingest & 1024-dim Vectors in `src/App.tsx`**:
  - After live feeds refresh or when reading/saving an item, dispatches non-blocking background calls to `POST /api/ai/embed` (batches of uncached item IDs + `ingest: true`). If `available: true`, caches 1024-dim vectors in `localStorage`/memory/IndexedDB (`'bge-m3-1024'` namespace, separate from 384-dim `all-MiniLM-L6-v2` cache in `'rr-semantic'`) and computes the decay-weighted taste vector to rank `visibleItems` when `sortBy === 'score'` and `settings.personalBoostEnabled`.
- **Second Brain Resurface in `src/App.tsx`**:
  - Calls `POST /api/ai/resurface` when online and `pastReads.length > 0` with `topStoriesForResurface` and `selectedItem`; merges server reranked matches seamlessly when `mode === 'workers-ai-vectorize'`, and falls back immediately to `rankRelatedPastReads` / `findResurfacedReads` (`topic-overlap` or local `semanticSearch`) without duplicating UI sections.

## 6. Modern-Web Guidance Applied
- `docs/modern-web-guidance/guides/accessibility/accessibility.md`: Preserve single `<h1>` hierarchy, native `<button>` cards, and `aria-label` clarity on explore/mode badges without cluttering live regions.
- `docs/modern-web-guidance/guides/ui-components/card.md`: Keep minimal card structure in `ReaderPane.tsx` and `FeedList.tsx` while displaying honest match/why metadata.
