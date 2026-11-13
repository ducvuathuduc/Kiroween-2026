# Resurrected Reader 👻

**Google Reader, back from the dead — as an AI reading radar for AWS builders.**

Kiroween 2026 · Category: Resurrection · Solo entry by Huỳnh Diệu Thành (VTech Studio)

Reading is not the job. The radar reads everything, scores every item 0–100 for signal, and turns the reads that matter into **Kiro tasks** — so reading becomes shipping.

## Quickstart

```sh
npm install
npm run dev      # local dev server
npm run build    # typecheck + Worker/client build → dist/worker + dist/client
npm run preview  # serve the production build
npx tsc --noEmit # typecheck only
npm run lint     # oxlint
```

### Amp orbs

`.agents/setup` uses the orb's preinstalled Node.js (>=22.12) and npm to install
dependencies from `package-lock.json`, including development tools. It preserves
restored `node_modules` and uses npm's cache instead of reinstalling everything on
a warm setup. No database, API key, or environment file is required for the default
development server; AI features use optional server-side credentials supplied at
runtime, never stored by setup.

Amp snapshots successful setup for fresh orbs; exact snapshot matches skip setup.
`.agents/resume` only checks that the tools are available, without reinstalling
dependencies on wake. To repair missing dependencies, run `.agents/setup`.
The lifecycle scripts must reach the project's default branch before future orbs
can use them.

Start the development server with the orb supervisor, not from a lifecycle script:
`amp orb service start reader --command 'npm run dev' --portal`.
Run tests with `node --import tsx --test tests/*.test.ts`.

### MCP access

The server exposes `/mcp` using stateless Streamable HTTP (`agents@0.33.0` and
`@modelcontextprotocol/server@2.4.0`). Its eight tools are `list_feeds`,
`search_items`, `get_item`, `summarize_item`, `semantic_search`, `get_providers`,
`daily_briefing`, and `export_kiro_task`. Search returns current item IDs for
retrieval, summarization, and Markdown spec export.

MCP reads the three default public feeds, not a browser's local subscriptions or
saved state. Feed errors are reported; sample articles are never returned.
AI calls require server credentials and may incur provider charges. Without
credentials, summaries return an explicit error and semantic search uses keyword
matching. The test suite smoke-tests all tools with real public RSS data and
disables AI credentials in its own process to avoid charges, so it needs network
access but no secrets. No deployment is performed by these commands.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React 19 + Vite 8 + TypeScript 7 (strict) | Exactly what Google AI Studio Build generates |
| Server Runtime | Hono `4.13.18` on Cloudflare Workers + Static Assets | Existing API routes and stateless `/mcp`; AI SDK multi-provider fallback, server-only secrets |
| Styling & UI | Tailwind CSS v4 + `shadcn/ui` + `lucide-react` | Monochrome Vercel Geist theme tokens in `src/index.css`, Radix primitives in `src/components/ui/` |
| Typography | `@fontsource-variable/geist` + `@fontsource-variable/geist-mono` | Self-hosted Geist Sans and Geist Mono variable fonts |
| Navigation & Motion | `@ui-sdk/react` (`Listbox`) + `motion` | Roving focus + arrow-key list navigation (`definePrimitive`), 160ms pane/modal transitions |
| Data & Pulse | RSS/Atom CORS bridge + HN Firebase API + GitHub Search API | Live AWS/HN feeds + live builder pulse, zero external auth keys |
| Export & Interop | Pure PKZIP `.zip` (`src/lib/zip.ts`), OPML 2.0, Web Share, Notifications | Native platform APIs for Reader-era OPML migration & Kiro spec export |
| Security | Native `Sanitizer` API + `dompurify` fallback | Sanitizes untrusted RSS HTML before rendering excerpts |
| Dates | `date-fns` | Clean relative timestamps and refresh clock formatting |
| State | React + localStorage | Feeds, read/saved, pulse cache, and summaries persist per browser |
| Specs & MCP | Spec Kit + Kiro + `awslabs.aws-documentation-mcp-server` | `.specify/` and `.kiro/` (including `.kiro/settings/mcp.json`) at the repo root |

## Live feeds (verified)

- AWS News Blog — `aws.amazon.com/blogs/aws/feed/`
- AWS Machine Learning Blog — `aws.amazon.com/blogs/machine-learning/feed/`
- Hacker News — `hnrss.org/frontpage`
- Community Pulse — Hacker News Firebase API (`topstories.json`) & GitHub Search API (`topic:aws`)

## How it works

1. **Ingest & Pulse** — feeds fetched client-side via `api.rss2json.com` (CORS JSON, primary) with fallback to `api.allorigins.win` / direct CORS + `DOMParser`, plus live **Community Pulse** (HN Top Stories + GitHub `topic:aws` repos) and Google Reader **OPML import/export**.
2. **Score** — deterministic 0–100: keywords (kiro +25, aws +15, agent/agentic +20, llm/ai coding +15, startup +10, security +10) + recency (today +15, this week +8). Never labeled "AI".
3. **Triage & Summarize** — sort by score or newest, filters All / High ≥70 / Unread / Saved, search (`/`), keyboard `↑`/`↓` (roving focus), `j`/`k`/`s`/`r`, Web Share, opt-in notifications (`≥85`), and one-click server-side **Gemini TL;DR** summaries.
4. **Act** — "→ Kiro task" opens `KiroTaskModal` (glass `Dialog`) to preview `tasks.md`, `requirements.md`, and `design.md`, copy Markdown, or download a ready-to-drop `<slug>-kiro-spec.zip` archive for `.kiro/specs/`.

## Development workflow

- **Spec Kit:** `/speckit-constitution` → `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` → `/speckit-converge` (commands in `.gemini/commands/`).
- **Kiro:** steering + specs + hooks live in `.kiro/` — read them before changing behavior.
- **Web best practices:** before writing UI/CSS/client JS, consult `docs/modern-web-guidance/` (Google Chrome, vendored).
- **Rules:** the constitution (`.specify/memory/constitution.md`) wins over agent defaults. Full system description: `docs/resurrected-reader-system.md`. Shared agent context: `AGENTS.md`.

## Deployment

The target is **Cloudflare Workers + Static Assets**, not Cloudflare Pages or a
static-only host: API routes and `/mcp` require the Worker. `npm run build` creates
`dist/worker/wrangler.json` and `dist/client/`. `npm run start` runs that built
configuration locally through Wrangler; `npm run dev` uses Vite/workerd.

`wrangler.jsonc` enables Node compatibility for the existing provider SDKs and
routes `/api/*` plus `/mcp` through the Worker before SPA assets. Configure optional
provider secrets in the runtime, never in client-side `VITE_*` variables. For local
development, use environment variables or a gitignored `.dev.vars` file following
`.env.example`. No credentials are needed for feed reading or deterministic scores.

**Deployment and publishing require the owner's explicit approval.** Build,
preview, and start commands are local only; no deploy script is provided.

For a repeatable local Wrangler smoke test, set `READER_TEST_URL` to the running
local server's origin and run `npx tsx --test tests/api.test.ts tests/mcp.test.ts`.
These tests refuse AI-capable calls if that runtime has credentials configured.

## License

MIT — see `LICENSE`.
