# Backlog — Second Brain (Past Reads & Resurfaced Today)

## Overview

Second Brain connects the user's currently open article and today's top stories back to items they have previously read or saved, stored locally on the device. It reuses the existing semantic search pipeline (`src/lib/semanticSearch.ts`, `src/workers/embed.worker.ts`, and `/api/embed`) when embeddings are available and falls back honestly to deterministic keyword/topic overlap when no embedding provider key is configured or vectors are unavailable.

## Requirements (EARS)

1. **Past Reads Snapshot Persistence**: When the user reads or saves a non-sample feed item, the system SHALL record a bounded local snapshot (`id`, `feedId`, `feedTitle`, `title`, `link`, `description`, `pubDate`, `score`, `scoreDimensions`, `readAt`, `savedAt`) in `localStorage` (`rr.pastReads.v1`) without overwriting existing historical `readAt` timestamps on re-open, and SHALL remove `rr.pastReads.v1` when `clearReaderStorage()` runs. Sample items (`item.sample === true`) SHALL NOT be persisted into past-read history.
2. **Reader "From your past reads" Panel**: When an item is open in `ReaderPane`, the system SHALL render a `"From your past reads"` panel displaying up to 3 read or saved items most related to the open item (excluding the open item itself and exact title duplicates), showing for each match:
   - the matched article title, source feed, and interaction recency;
   - a match score formatted to two decimal places with an honest method label (`semantic` or `topic-overlap`);
   - the shared topics explaining why the item matched.
   When no past reads match (or no past reads exist yet), the panel SHALL display an honest empty state without fabricating matches or scores.
3. **Clickable Past Read Navigation**: When the user clicks a matched item inside `"From your past reads"` or `"Resurfaced today"`, the system SHALL open that item in `ReaderPane` even if it has rotated out of the active RSS feed window.
4. **Feed "Resurfaced today" Section**: In `FeedList`, the system SHALL render a `"Resurfaced today"` section that surfaces items read or saved **more than 30 days ago** (`> 30` days before the current date based on `readAt` / `savedAt`) that relate to today's top stories (`selectDailyBriefingItems`), showing the match score + honest method label (`semantic` or `topic-overlap`), shared topics, and the related top story title. When no read/saved items are older than 30 days or none relate to today's top stories, the section SHALL render an honest empty state.
5. **Single Embedding Pipeline Reuse**: When computing semantic similarity for Second Brain, the system SHALL reuse the existing `createSemanticSearchClient()` (`src/lib/semanticSearch.ts`), `src/workers/embed.worker.ts` (`skipQuery: true`), `'rr-semantic'` IndexedDB vector cache, `cosineSimilarity()`, and `/api/embed` fallback. The system SHALL NOT add a second Web Worker, second ML model, or duplicate vector store.
6. **Honest No-Key Fallback (`topic-overlap`)**: When no embedding provider key is configured on the server (`hasEmbeddingProvider === false`) and local semantic embeddings are not ready/available (or when semantic search is disabled), Second Brain SHALL fall back to deterministic keyword and curated topic overlap (`computeTopicOverlapScore`), SHALL label every fallback score honestly as `topic-overlap`, SHALL require at least one genuine shared topic for a match to appear, and SHALL NEVER label deterministic overlap as `"semantic"` or `"AI"`.
7. **Deterministic Scoring Preservation**: Second Brain SHALL NOT modify `scoreItem()` / `explainScore()` 4D signal weights, labels, or scores, and SHALL preserve existing AI summarization and extractive summary fallbacks.
8. **Verification**: `npx tsc --noEmit`, `npx tsc -p tsconfig.node.json --noEmit`, unit tests covering matching/ranking/30-day filtering/shared topics/honest fallback labeling, `npm run build`, and headless Chromium preview verification SHALL pass.
