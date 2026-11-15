# Design — Second Brain (Past Reads & Resurfaced Today)

## Architecture

### 1. Pure Matching & Resurfacing Module (`src/lib/secondBrain.ts`)
- **Data Types**:
  - `PastReadRecord`: `{ id, feedId, feedTitle, title, link, description, pubDate, score?, scoreDimensions?, readAt?, savedAt? }`
  - `SecondBrainMatchKind`: `'semantic' | 'topic-overlap'`
  - `SecondBrainMatch`: `{ item: PastReadRecord, score: number, matchKind: SecondBrainMatchKind, sharedTopics: string[] }`
  - `ResurfacedMatch`: `SecondBrainMatch & { matchedTopStory: { id: string; title: string }; daysAgo: number }`
- **Topic & Keyword Extraction**:
  - `extractItemTopics(item)`: extracts matching curated AWS/builder topics (`Kiro`, `Amazon Bedrock`, `AWS`, `AI Agents`, `MCP / A2A`, `LLM & Inference`, `Security & IAM`, `Serverless & Workers`, `Data & Analytics`, `Frontend & Web`, `Cost & Ops`, `Open Source`) plus normalized technical keywords (alphanumeric length >= 3, stopword-filtered, title terms weighted `2x` vs description terms `1x`).
  - `findSharedTopics(a, b, limit = 4)`: returns curated topics shared by both items first, followed by shared technical keywords not already covered by those topic labels.
- **Deterministic Topic-Overlap Scoring (`computeTopicOverlapScore(a, b)`)**:
  - Computes weighted term Dice/overlap across `(title * 2 + description)` tokens blended with curated topic Jaccard overlap (`0.45 * topicJaccard + 0.55 * weightedTokenDice` when either item has curated topics, else `weightedTokenDice`), clamped to `[0, 1]`.
  - Enforces `sharedTopics.length >= 1` and `score >= MIN_TOPIC_OVERLAP_SCORE` (`0.12`) so matches are always grounded in real shared concepts.
- **Related Past Reads (`rankRelatedPastReads`)**:
  - Excludes the target item itself (`record.id === target.id`) and exact normalized title duplicates.
  - When real semantic vectors exist (from `semanticSearch.ts` / `embed.worker.ts` or `/api/embed`) and `useSemantic` is enabled, uses `cosineSimilarity` with threshold `MIN_SEMANTIC_SIMILARITY` (`0.25`) and tags `matchKind: 'semantic'`.
  - Otherwise (including whenever no embedding provider key is configured and local vectors are unavailable, or semantic search is disabled), uses `computeTopicOverlapScore` and tags `matchKind: 'topic-overlap'`.
  - Returns top `3` matches sorted descending by `score`, then interaction recency.
- **30-Day Resurfacing (`findResurfacedReads`)**:
  - Filters `pastReads` to records whose latest interaction timestamp (`max(readAt, savedAt)`) is strictly older than `30` days (`30 * 86_400_000` ms) relative to `nowMs`.
  - Compares each aged read/saved item against today's top stories (`selectDailyBriefingItems`, up to 5), selecting its strongest match (semantic when permitted & available, otherwise deterministic `topic-overlap`).
  - Returns top matches (`limit = 3`) annotated with `matchedTopStory` and `daysAgo`.

### 2. Reusing Existing Semantic Pipeline (`src/lib/semanticSearch.ts`)
- Extend `createSemanticSearchClient()` with:
  - `getCachedItemVectors(itemIds)`: reads only from `memoryItemVectors` and IndexedDB `'rr-semantic'` without spawning `embed.worker.ts` or downloading weights.
  - `embedItems(items, signal)`: reuses the single `embed.worker.ts` (`skipQuery: true`), `memoryItemVectors`, and `saveSemanticVectors()` so Second Brain shares the exact same 384-dim `Xenova/all-MiniLM-L6-v2#q8` vector cache.
- **No-Key Honesty Policy in `App.tsx`**:
  - On initial load with no embedding provider key configured (`hasEmbeddingProvider === false`) and local worker not yet initialized (`!semanticProgress.modelReady`), Second Brain does NOT eagerly download 23 MB weights in the background; it immediately runs deterministic `topic-overlap` and displays `topic-overlap` labels.
  - When `hasEmbeddingProvider === true` (and `settings.semanticSearchEnabled`), Second Brain may use `/api/embed` (or local vectors if ready) and label real vector matches `semantic`, falling back cleanly to `topic-overlap` on missing vectors or offline/errors.
  - When `semanticProgress.modelReady === true` (user has already downloaded the local worker via search) and `settings.semanticSearchEnabled`, Second Brain reuses `semanticClient.embedItems(...)` / cached vectors and labels real vector cosine matches `semantic`.

### 3. Storage (`src/lib/storage.ts` & `src/lib/export.ts`)
- Store `PAST_READS_STORAGE_KEY = 'rr.pastReads.v1'` (bounded to `300` entries, prioritizing saved items and newest interactions) with sanitization on load.
- `upsertPastRead(records, item, 'read' | 'save', nowIso)`: preserves original `readAt` when re-reading an already-recorded item; sets `savedAt` when saving; clears `savedAt` via `unmarkSavedPastRead` when un-saving.
- Include `PAST_READS_STORAGE_KEY` in `clearReaderStorage()`, and optionally include `pastReads` in `FullDataExport`.

### 4. UI Components (`ReaderPane.tsx` & `FeedList.tsx`)
- **`ReaderPane.tsx`**: Renders `"From your past reads"` right below the lead summary paragraph in the same monochrome card style (`rounded-md border border-zinc-200 bg-zinc-50/70 p-4`), listing up to 3 native `<button type="button">` cards with title, source/recency, `topic-overlap 0.xx` (or `semantic 0.xx`) badge, and shared topic chips, or an honest empty state.
- **`FeedList.tsx`**: Renders `"Resurfaced today"` inside the sidebar `<ScrollArea>` below Subscriptions, showing aged (>30d) matches to today's top stories as native `<button type="button">` rows with days-ago, `topic-overlap`/`semantic` score chip, shared topics, and matched top story reference, or an honest empty state.

## Modern-Web Guidance Applied
- `docs/modern-web-guidance/guides/accessibility/accessibility.md`: Semantic `<section aria-labelledby>`, proper `<h2>` hierarchy, `<ul>`/`<li>` lists, and native `<button type="button">` triggers (no clickable `<div>` elements).
- `docs/modern-web-guidance/guides/ui-components/card.md`: Minimal card markup with clear source order and native button controls.
- `docs/modern-web-guidance/guides/privacy/privacy.md`: Past-read snapshots remain local in `localStorage` (`rr.pastReads.v1`) and are cleared by `clearReaderStorage()`.
