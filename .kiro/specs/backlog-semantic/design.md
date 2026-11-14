# Design — In-Browser Semantic Search (`@huggingface/transformers` + Web Worker + IndexedDB)

## Architecture

- **Worker (`src/workers/embed.worker.ts`)**: Runs as a dedicated ES module Web Worker (`?worker` in Vite 8 with `worker.format: 'es'` and `optimizeDeps.exclude: ['@huggingface/transformers']`). Sets `env.useBrowserCache = true` (persisting model files in Cache Storage `'transformers-cache'`) and loads `pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8', progress_callback })` once on first `embed` request. Computes normalized 384-dim embeddings (`{ pooling: 'mean', normalize: true }`) for queries and uncached feed items, streaming `download-progress` events back to the main thread.
- **Vector Cache (`src/lib/storage.ts`)**: Adds IndexedDB database `'rr-semantic'` (object store `'vectors'`, keyPath `'itemId'`) with `{ itemId, vec, model, updatedAt }`, plus `loadSemanticVectors()`, `saveSemanticVectors()`, and `clearSemanticVectors()` (invoked by `clearReaderStorage()` along with deleting `'transformers-cache'` in `clearOfflineStorage()`). Adds `semanticSearchEnabled: boolean` (default `true`) to `ReaderSettings` and `sanitizeSettings()`.
- **Pure Ranking & Client Orchestration (`src/lib/semanticSearch.ts`)**:
  - `cosineSimilarity(a, b)`: Pure numeric cosine similarity with dimension mismatch, zero-norm, and non-finite guards.
  - `normalizeKeywordScore(query, item)`: Maps deterministic `fuzzyMatchScore` / token overlap into `[0, 1]`.
  - `rankItemsHybrid(items, similarityById, query, options)`: Computes `combined = 0.6 * semantic + 0.4 * keyword`, retains items with `similarity >= minSimilarity` (`0.25`) or positive keyword match, sorts descending by `combined`, and returns `{ item, similarity, keywordScore, combinedScore, isSemanticMatch }` without altering `item.score` or `item.scoreDimensions`.
  - `createSemanticSearchClient()`: Coordinates IndexedDB cache lookup, lazy Web Worker spawning (`typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined'`), progress callbacks (`'idle' | 'downloading' | 'embedding' | 'ready' | 'unavailable' | 'error'`), and bounded item embedding (`maxDocs = 80`).
- **UI & Fallback (`src/App.tsx`, `src/components/ItemList.tsx`, `src/components/CommandPalette.tsx`)**:
  - When `settings.semanticSearchEnabled` is `true` and query length `>= 2`:
    - Starts/uses local worker when WASM & Worker are available.
    - While local model is downloading or unavailable, falls back seamlessly to `POST /api/embed` if `hasEmbeddingProvider` and `navigator.onLine`. Once local embeddings resolve, local scores take precedence and work offline on repeat searches.
  - `ItemList.tsx` renders an accessible Semantic toggle button (`aria-pressed`), a native `<progress>` bar + polite `role="status"` `"model downloading…"` banner during first-load download, status indicator (`In-browser semantic` vs `Semantic fallback` vs `Keyword only`), and a `"semantic match 0.xx"` chip on semantic matches.
  - `CommandPalette.tsx` (`⌘K`) adds a Semantic mode toggle and re-ranks article targets via `rankItemsHybrid` with `"semantic match 0.xx"` badges and download progress feedback.

## Out of Scope / Explicitly Excluded
- No Voy or Pagefind.
- No server-side `@huggingface/transformers` usage.
- No modification to `scoreItem()` / `explainScore()` 4D scoring weights or labels.

## Modern-Web Guidance Applied
- `docs/modern-web-guidance/guides/performance/conditional-async-dependencies.md`: Defer heavy ML runtime and model weights behind lazy worker instantiation triggered only on user search.
- `docs/modern-web-guidance/guides/ui-components/progress.md`: Use native `<progress>` with `max="100"` and a separate `role="status"`/`aria-live="polite"` announcement for `"model downloading…"`, avoiding `aria-busy` on unlabeled divs.
- `docs/modern-web-guidance/guides/accessibility/accessibility.md` & `ui-components/toolbar.md`: Use native `<button type="button">` with `aria-pressed` for Semantic ON/OFF toggles so visual and accessible state remain synced.
- `docs/modern-web-guidance/guides/privacy/privacy.md`: Embeddings computed on-device in Web Worker / IndexedDB; model weights cached locally in browser Cache Storage.

## Verified Reference APIs
- `@huggingface/transformers@4.3.2`: `pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8', progress_callback })`, `extractor(texts, { pooling: 'mean', normalize: true })`, `env.useBrowserCache = true` (`'transformers-cache'`).
- Vite 8: `optimizeDeps: { exclude: ['@huggingface/transformers'] }`, `worker: { format: 'es' }`.
