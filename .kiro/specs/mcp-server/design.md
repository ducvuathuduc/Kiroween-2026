# Read-Only MCP Server (Spec 2026-07-28) — Design

## 1. Architecture Overview

`server/mcp.ts` uses `createMcpHandler` and `McpServer` directly from `@modelcontextprotocol/server` (`2.4.0`), mounted at the single `/mcp` route in `server.ts`. No `McpAgent` or Durable Objects are used.

```
MCP Client (2026-07-28 envelope or 2025-11-25 stateless)
  └─ POST/OPTIONS /mcp (server.ts)
       └─ createReaderMcpHandler({ newsletterStore, getEnv })
            └─ @modelcontextprotocol/server createMcpHandler(..., { responseMode: 'json' })
                 ├─ get_daily_briefing   ──► dailyBriefing() (server/readTools.ts → selectDailyBriefingItems)
                 ├─ get_feed_items       ──► searchItems()   (server/readTools.ts → loadItems + DEFAULT_FEEDS)
                 ├─ get_signal_scores    ──► getSignalScores() (server/readTools.ts → radar.ts + scoring.ts)
                 ├─ resurface_past_read  ──► resurfacePastRead() (server/readTools.ts → liveAi.ts + briefing.ts)
                 └─ list_newsletters     ──► listNewsletters() (server/readTools.ts → NewsletterStore + newsletter.ts)
```

## 2. Protocol & Security Posture

- **Protocol revision**: `@modelcontextprotocol/server` `createMcpHandler` natively serves **MCP `2026-07-28`** (`server/discover`, `_meta["io.modelcontextprotocol/protocolVersion"] = "2026-07-28"`, `MCP-Protocol-Version: 2026-07-28`) and automatically preserves stateless 2025-era compatibility (`legacy: 'stateless'` default).
- **Stateless guarantee**: Every HTTP request constructs a fresh `McpServer` instance via factory `(ctx) => McpServer`, closing it immediately upon response completion. Zero `mcp-session-id` state is issued or stored.
- **Authless Read-Only Demo Scope**: No OAuth 2.1 challenge or bearer validation is configured; therefore:
  - All 5 tools are strictly read-only (`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`).
  - No write, delete, sync, or paid-LLM-generation tools are registered.
  - Every tool description starts with `[Authless read-only demo scope — no OAuth 2.1, read-only]`.
  - `README.md` documents the authless read-only demo scope and how to connect with the MCP Inspector / TypeScript SDK v2 client.
- **CORS on `/mcp`**: `server.ts` handles `OPTIONS /mcp` (204) and attaches permissive read-only CORS headers (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Accept, MCP-Protocol-Version, MCP-Method, MCP-Name, Mcp-Session-Id`) so browser or CLI MCP Inspectors connect cleanly.

## 3. Reusable Handlers & Zod v4 Schemas (`server/readTools.ts` + `server/mcp.ts`)

1. **`get_daily_briefing`**
   - Input (`z.object({ limit: z.number().int().min(1).max(5).default(5) }).strict()`): defaults to Top 5 (`limit = 5`).
   - Reuses `dailyBriefing(limit)` → `loadItems()` + `selectDailyBriefingItems(items, limit)`.
   - Returns `{ items, errors }` matching UI & A2A `get_briefing` 1:1.

2. **`get_feed_items`**
   - Input (`z.object({ query: z.string().trim().min(1).max(500).optional(), feedId: z.enum(['aws-news', 'aws-ml', 'hn']).optional(), minScore: z.number().min(0).max(100).default(0), limit: z.number().int().min(1).max(50).default(20) }).strict()`).
   - Reuses `searchItems({ query, feedId, minScore, limit })` → filters `loadItems()` by optional `feedId`, `minScore`, and case-insensitive substring match over title + description, preserving deterministic score order.
   - Returns `{ items, errors }`.

3. **`get_signal_scores`**
   - Input (`z.object({ itemId: z.string().trim().min(1).max(4096).optional(), feedId: z.enum(['aws-news', 'aws-ml', 'hn']).optional(), limit: z.number().int().min(1).max(50).default(10) }).strict()`).
   - Reuses `loadItems()`, `explainScore()`, `computeRadarSummary()`, `buildScoreHistogram()`, `buildFeedActivity()`, `buildItemRadarData()`, `getItemDimensions()`.
   - Returns deterministic 4D weights (`Relevance 42% / Recency 24% / Authority 18% / Novelty 16%`, explicitly `scoringMethod: 'deterministic-4d'`), summary, histogram, feed activity, and either single-item cue breakdown (when `itemId` is supplied) or top `limit` scored items.

4. **`resurface_past_read`**
   - Input:
     - `query`: optional non-empty string (`max(500)`)
     - `itemId`: optional live feed item ID (`max(4096)`)
     - `pastReads`: optional array (`max(100)`) of candidate read/saved records `{ id, feedId?, feedTitle, title, link?, description, pubDate?, score?, readAt?, savedAt? }`
     - `minAgeDays`: `z.number().int().min(0).max(3650).default(0)`
     - `limit`: `z.number().int().min(1).max(10).default(5)`
     - `.strict()`
   - Behavior:
     - If `itemId` is given, loads `getItem(itemId)` as `topStory` and defaults `query` to `${topStory.title} ${topStory.description}`.
     - Else if `query` is omitted, loads live items via `loadItems()` and uses `selectDailyBriefingItems(items, 1)[0]` as `topStory` and query seed.
     - Invokes `resurfaceSecondBrain({ query, topStory, candidates: pastReads ?? [], minAgeDays, limit }, env)`.
     - Never fabricates past reads; when `pastReads` is empty and `env.VECTORIZE` is absent, returns `matches: []` with an honest `note` explaining MCP is stateless without browser `localStorage`.

5. **`list_newsletters`**
   - Input (`z.object({ feedId: z.string().trim().min(1).max(64).optional(), includeEntries: z.boolean().default(false), entryLimit: z.number().int().min(1).max(20).default(5) }).strict()`).
   - Reuses `newsletterStore` (`listFeeds()`, `getFeed(feedId)`) and `newsletterFeedToFeedSource(feed)` from `src/lib/newsletter.ts`.
   - When `feedId` is specified, validates via `isValidFeedId` and throws an explicit `'Newsletter feed not found.'` error if absent.
   - Returns `{ newsletters, count, note? }` with safe metadata and optional bounded entry previews (`{ id, subject, from, receivedAt, link, preview }`) when `includeEntries: true`.

## 4. Shared Store Wiring (`server.ts` & `server/a2a.ts`)

- `server.ts` holds `newsletterStore = createMemoryNewsletterStore()` and constructs `mcpHandler = createReaderMcpHandler({ newsletterStore, getEnv: () => runtimeEnv })` (passing request `c.env` safely per request without breaking standalone `server/mcp.ts` worker export).
- `server/a2a.ts` keeps its exact A2A 0.3.0 routes/schemas and updates only its skill description text so references match the renamed read-only MCP tools (`get_feed_items`, `get_daily_briefing`).
- `src/components/DocsPage.tsx` (section 9 & 10) and `docs/resurrected-reader-system.md` are updated per `docs/modern-web-guidance/guides/html/html.md` (including accessible scrollable `<pre role="region" aria-label="..." tabIndex={0}>` blocks) so documentation stays truthful.
