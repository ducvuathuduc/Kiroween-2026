# Tasks — Backlog #4 In-Browser Semantic Search

- [x] Read `AGENTS.md`, `.specify/memory/constitution.md`, `vite.config.ts`, `src/lib/storage.ts`, `src/lib/briefing.ts`, `src/lib/providers.ts`, `src/components/ItemList.tsx`, `src/components/CommandPalette.tsx`, `src/App.tsx`, and modern-web guidance (`conditional-async-dependencies.md`, `progress.md`, `toolbar.md`, `accessibility.md`, `privacy.md`).
- [x] Create `.kiro/specs/backlog-semantic/{requirements.md, design.md, tasks.md}` before writing code.
- [x] Install `@huggingface/transformers@4.3.2` and verify Vite 8 worker/WASM config in `vite.config.ts` (never imported in `server.ts` or `server/*`).
- [x] Extend `src/lib/storage.ts` with `semanticSearchEnabled` in `ReaderSettings` and IndexedDB `'rr-semantic'` vector store (`loadSemanticVectors`, `saveSemanticVectors`, `clearSemanticVectors`).
- [x] Create lazy Web Worker `src/workers/embed.worker.ts` using `Xenova/all-MiniLM-L6-v2` (`dtype: 'q8'`, mean pooling, normalized, `env.useBrowserCache = true`).
- [x] Create `src/lib/semanticSearch.ts` with pure cosine similarity, `0.6 * semantic + 0.4 * keyword` hybrid re-rank (`rankItemsHybrid`), and lazy worker client (`createSemanticSearchClient`).
- [x] Wire semantic search, Semantic toggle, `"model downloading…"` `<progress>` + status, `"semantic match 0.xx"` chip, and `/api/embed` fallback into `src/App.tsx`, `src/components/ItemList.tsx`, and `src/components/CommandPalette.tsx`.
- [x] Add stubbed-vector unit tests in `tests/semanticSearch.test.ts`.
- [x] Verify `npx tsc --noEmit`, `npx tsc -p tsconfig.node.json --noEmit`, `npm run lint`, `npx tsx --test tests/*.test.ts`, `npm run build`, `dist/worker/` size/isolation, and real Chromium browser behavior via Playwright CLI.
