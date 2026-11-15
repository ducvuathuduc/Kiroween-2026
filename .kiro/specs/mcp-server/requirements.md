# Read-Only MCP Server (Spec 2026-07-28) — Requirements

## Overview

Resurrected Reader exposes a stateless, strictly read-only Model Context Protocol (MCP) server on the existing Hono Cloudflare Worker (`/mcp`) using the TypeScript SDK v2 `createMcpHandler` (`@modelcontextprotocol/server@2.4.0`), targeting MCP protocol revision `2026-07-28` with stateless 2025-era compatibility.

It reuses existing server handlers, feed loaders, deterministic Signal Radar modules, Second Brain resurface logic, newsletter bridge types/store, and Zod v4 validation without duplicating business logic. Because this ships without full OAuth 2.1, every tool description and `README.md` clearly disclose the **authless read-only demo scope**.

## Requirements (EARS)

1. **Stateless SDK v2 Transport on Single `/mcp` Endpoint**:
   WHEN an MCP client sends HTTP `POST` (modern `2026-07-28` envelope including `server/discover` or stateless `2025-11-25` JSON-RPC) requests to `/mcp`, THE SYSTEM SHALL serve them via `createMcpHandler` from `@modelcontextprotocol/server` without creating `McpAgent`, Durable Objects, or stateful session IDs (`mcp-session-id` remains absent).
   WHEN a client sends `OPTIONS /mcp` preflight requests, THE SYSTEM SHALL respond with CORS headers allowing MCP tooling/Inspector inspection of the single `/mcp` endpoint.

2. **Strictly Read-Only Tool Surface (`5` Exact Tools)**:
   WHEN `tools/list` is requested, THE SYSTEM SHALL expose ONLY the five read-only tools:
   - `get_daily_briefing`
   - `get_feed_items`
   - `get_signal_scores`
   - `resurface_past_read`
   - `list_newsletters`
   THE SYSTEM SHALL set `annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }` on every tool and SHALL NOT expose any write, delete, mutation, or paid-LLM-generation tools over MCP.

3. **Reuse Existing Handlers, Libraries & Zod Schemas**:
   WHEN `get_daily_briefing` is invoked, THE SYSTEM SHALL reuse `dailyBriefing()` (`server/readTools.ts` + `selectDailyBriefingItems` from `src/lib/briefing.ts`) to return the real Top 5 deduplicated live items and any upstream feed errors without inventing sample items.
   WHEN `get_feed_items` is invoked, THE SYSTEM SHALL reuse `searchItems()` (`server/readTools.ts` + `loadItems()` + `DEFAULT_FEEDS`) to filter live public feed items by optional `query`, `feedId`, `minScore`, and `limit` (1–50).
   WHEN `get_signal_scores` is invoked, THE SYSTEM SHALL reuse `loadItems()`, `explainScore()` (`src/lib/scoring.ts`), and `computeRadarSummary`, `buildScoreHistogram`, `buildFeedActivity`, and `buildItemRadarData` (`src/lib/radar.ts`) to return deterministic 4D scores (`Relevance 42% / Recency 24% / Authority 18% / Novelty 16%`) without calling any AI model.
   WHEN `resurface_past_read` is invoked, THE SYSTEM SHALL reuse `resurfaceSecondBrain()` (`server/liveAi.ts`) and `loadItems()` / `getItem()` / `selectDailyBriefingItems()` (`src/lib/briefing.ts`) to match optional caller-supplied read/saved `pastReads` (and Vectorize when bound) honestly, labeling `workers-ai-vectorize` vs deterministic `topic-overlap` and never fabricating browser-local reads.
   WHEN `list_newsletters` is invoked, THE SYSTEM SHALL read directly from the Worker's shared `NewsletterStore` (`newsletterStore.listFeeds()` / `getFeed()` + `newsletterFeedToFeedSource` from `src/lib/newsletter.ts`) without exposing creation, import, sync, or delete actions.

4. **Strict Zod Input Validation & Honest Error Reporting**:
   WHEN invalid tool arguments are supplied (out-of-range numbers, blank strings, unknown fields, missing/unknown item or feed IDs), THE SYSTEM SHALL reject them cleanly via Zod v4 schema validation or return an explicit MCP `isError: true` message without falling back to sample articles.

5. **Authless Read-Only Demo Scope Disclosure**:
   WHEN `tools/list` is inspected or `README.md` / in-app docs are read, THE SYSTEM SHALL clearly label the endpoint as an **authless read-only demo scope** (no OAuth 2.1, public default feeds + shared Worker read-only state only) in every tool description and in `README.md`.

6. **Preservation & Verification**:
   THE SYSTEM SHALL NOT alter deployment workflows (`.github/workflows/deploy.yml`), secrets, or `workers/newsletter/`, and SHALL preserve A2A (`/a2a/tasks`, `/.well-known/agent-card.json`) and REST API contracts. Typechecks (`tsconfig.app.json` and `tsconfig.node.json`), full unit tests (`npx tsx --test tests/*.test.ts`), `npm run lint`, `npm run build`, and a live MCP client verification against built `/mcp` (`get_daily_briefing`) SHALL pass.
