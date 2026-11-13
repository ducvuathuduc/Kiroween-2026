# Resurrected Reader — System Description

> Google Reader died in 2013. Resurrected Reader brings it back as an **AI reading radar for AWS builders** — not an RSS clone. It reads, scores, and turns signal into action.
> Kiroween 2026 · Category: **Resurrection** · Team: solo (Huỳnh Diệu Thành, VTech Studio)

## 1. Problem & users

AWS builders drown in sources: AWS News Blog, AWS ML Blog, Hacker News, changelogs, Devpost. No signal, only noise. Good posts get buried; reading never turns into action.

**Primary user:** a solo AWS builder / founder who builds with Kiro and wants the 5 reads a day that actually matter — and a next step for each.

## 2. Implemented reading workflow

1. **Ingest** — public RSS/Atom through same-origin `/api/rss`, parsed in the browser, with rss2json then allorigins fallbacks. Feed failures are isolated. Real images come from feed media/HTML and server-side OpenGraph enrichment; a monogram replaces missing covers.
2. **Score** — deterministic 0–100 ranking across **Relevance 42% / Recency 24% / Authority 18% / Novelty 16%**. `explainScore()` exposes matched cues and weighted dimensions. No LLM, key, or provider charge is involved in scoring.
3. **Triage** — All / High ≥70 / Unread / Saved filters, score/date sorting, `j`/`k` navigation, `Cmd/Ctrl+K` commands, new-since-last-visit markers, feed health, and Recharts Signal Radar. Optional embedding search falls back to local keyword matching.
4. **Read & brief** — sanitized RSS excerpts and original links work without keys. Optional server-side AI generates structured `{ tldr, takeaways, whyMatters }` summaries. Daily Briefing selects the top five and attempts missing summaries with bounded concurrency.
5. **Act & migrate** — copy Markdown or download a three-file Kiro spec ZIP (`requirements.md`, `design.md`, `tasks.md`); import/export Google Reader OPML subscriptions, export browser state as JSON, or share an article using native platform APIs.

The default feed catalog is AWS News Blog, AWS Machine Learning Blog, and Hacker News (`src/lib/feeds.ts`). Six bundled offline sample items are labeled SAMPLE in the UI; the MCP endpoint never substitutes them for real data.

## 3. Runtime and module boundaries

The frontend remains React 19 + Vite 8 + TypeScript 7 (strict), Tailwind CSS v4, shadcn/ui, and self-hosted Geist. A **Hono Cloudflare Worker + Static Assets** serves the APIs and frontend; this is not a client-only site or a Cloudflare Pages application.

| Module | Responsibility |
| --- | --- |
| `server.ts` | `/api/health`, `/api/providers`, `/api/rss`, `/api/og-images`, `/api/summarize`, `/api/embed`, and `/mcp`; request validation and proxy caches |
| `server/ai.ts` | AI SDK v7 provider routing: Gemini → OpenAI → Anthropic → Bedrock, preserving direct `@google/genai`; configured providers only |
| `server/mcp.ts`, `server/items.ts` | Stateless Streamable HTTP, eight Zod-validated tools, real default-feed data and explicit upstream/provider errors |
| `src/lib/feeds.ts`, `scoring.ts`, `briefing.ts` | RSS/Atom parsing, deterministic ranking, briefing selectors and command search |
| `src/lib/kiroTask.ts`, `zip.ts`, `opml.ts`, `export.ts` | Kiro bundles, OPML migration and portable exports |
| `src/lib/storage.ts`, `src/App.tsx` | Browser-local state, preferences, orchestration, routing and keyboard commands |
| `src/components/` | Reader panes, briefing, radar, System/Health, and production/help pages; `/system` includes the rendered pipeline |
| `wrangler.jsonc`, `vite.config.ts` | Workers build/dev configuration, SPA fallback, Worker-first `/api/*` and `/mcp` routing |

### Scoring contract

Each dimension is normalized to 0–100. The final score is the rounded, clamped sum `0.42 × relevance + 0.24 × recency + 0.18 × authority + 0.16 × novelty`. Recency falls from 100 at ≤6 hours to 14 after 14 days. Official-AWS authority checks parsed HTTP(S) hostname boundaries; exact default AWS feed IDs are a fallback only when no article link exists. Topic and novelty matches are rules, not AI judgments.

### MCP contract

`agents@0.33.0` `createMcpHandler` and `@modelcontextprotocol/server@2.4.0` expose exactly `list_feeds`, `search_items`, `get_item`, `summarize_item`, `semantic_search`, `get_providers`, `daily_briefing`, and `export_kiro_task`. There is no McpAgent, Durable Object, or Workers stdio transport. MCP reads the public default catalog, not browser-local subscriptions or read/saved state. Its daily briefing does not automatically generate paid summaries.

### Data and cost boundaries

Feeds, read/saved state, preferences and cached summaries stay in browser `localStorage`; server feed/image/item caches are temporary and isolate-local, not a remote account database. Public feed URLs and normal network metadata reach the proxy/feed services. AI summary inputs and embedding queries/documents reach configured providers and may incur charges. Credentials remain server-side; no keys belong in `VITE_*` variables or exported browser data.

The URL guard rejects local names, private/reserved IPv4 literals, all IPv6 literals, credentials, and unsafe redirects, with bounded redirect hops. It does not resolve DNS or prevent rebinding; production network policy must supply that boundary. RSS response-body consumption is limited to 2 MiB with a byte-counted stream; exceeding the limit cancels consumption and returns HTTP 502 without caching truncated XML. This does not cap network transport buffers or third-party fallback responses. Public paid-provider endpoints also need an operator review of access controls, rate limits and budgets before exposure.

## 4. How it is built (agentic workflow)

- **Spec Kit** (`.specify/`): constitution → `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` → `/speckit-converge`. Commands wired for Gemini (`.gemini/commands/`).
- **Kiro** (`.kiro/`): steering (`product.md`, `tech.md`, `structure.md`), spec `resurrected-reader-v1` (requirements/design/tasks), hook `verify-on-save.json` (typecheck on every TS save), `settings/mcp.json`.
- **Modern Web Guidance** (`docs/modern-web-guidance/`, vendored from GoogleChrome, Apache-2.0): consult the relevant guide **before** writing UI/CSS/client JS — native platform patterns first (dialog, popover, view transitions, container queries), no legacy libraries.
- **Evidence boundary:** these files demonstrate repository configuration, not proof that a particular tool or command was used. A competition write-up must use actual Kiro sessions, artifacts, and recordings; do not invent an agent-usage history.

## 5. Quality gates (production-ready bar)

- Required commands: `npx tsc --noEmit`, `npx tsc -p tsconfig.node.json --noEmit`, `npx tsx --test tests/*.test.ts`, `npm run lint`, and `npm run build`.
- Run `npm run start`, then API/MCP HTTP smoke with `READER_TEST_URL` pointing at that local Wrangler origin: `npx tsx --test tests/api.test.ts tests/mcp.test.ts`.
- Tests use real public feeds and require network access; no AI secrets are needed. HTTP smoke refuses provider-enabled runtimes to avoid unexpected charges. A no-provider error or keyword fallback does **not** verify genuine AI success.
- Browser QA must cover boot, real feeds, errors, keyboard/actions and exports with no console errors; inspect rendered affected states after UI changes. Never claim this proves deployment or ongoing availability.

## 6. Deployment

`npm run build` creates `dist/worker/wrangler.json` and `dist/client/`. `npm run dev` uses Vite/workerd; `npm run start` runs the built Worker locally. Neither deploys. A static-only host cannot provide the implemented API/MCP functionality.

**Deployment and publishing require separate owner approval.** No live submission URL, configured production provider, demo recording, or hosting continuity is established by local verification. The owner-supplied deadline is **05:00 Vietnam on 5 December 2026** (22:00 UTC on 4 December). Verify that the final public app remains available through **29 January 2027**, the supplied judging-end date.

## 7. Risks & non-goals

- Public feed/proxy availability and rate limits remain external dependencies; per-feed errors and explicitly labeled browser samples are fallbacks, not evidence of live-feed success.
- AI credentials, provider budgets, and a real permitted-provider success smoke are operator responsibilities; missing keys never justify fabricated summaries or embeddings.
- Accounts, cross-device synchronization, shared reading rooms, configurable scoring weights, digest email, and native mobile applications are not implemented.

## 8. Repo map

Kiro requirements/design/tasks and steering live in `.kiro/`; Spec Kit governance and commands live in `.specify/` and `.gemini/commands/`. `docs/modern-web-guidance/` contains vendored Chrome guidance. `tests/` holds executable verification; `.agents/setup` and `.agents/resume` prepare Amp orbs. `README.md` is the runbook, and `AGENTS.md` links the shared repository guidance.
