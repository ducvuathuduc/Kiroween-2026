# Resurrected Reader 👻

**Google Reader, back from the dead — as an AI reading radar for AWS builders.**

Kiroween 2026 · Category: Resurrection · Solo entry by Huỳnh Diệu Thành (VTech Studio)

Reading is not the job. The radar reads everything, scores every item 0–100 for signal, and turns the reads that matter into **Kiro tasks** — so reading becomes shipping.

## Quickstart

> Live URL: **TBD** (pending manual Cloudflare Workers deploy — see [`docs/deployment.md`](docs/deployment.md))

```sh
npm install
npm run dev      # local dev server
npm run build    # typecheck + Worker/client build → dist/worker + dist/client
npm run start    # run the built Worker + assets locally through Wrangler
npm run preview  # preview through Vite's Cloudflare integration (port 3000)
npx tsc --noEmit # app typecheck
npx tsc -p tsconfig.node.json --noEmit # Worker/server typecheck
npx tsx --test tests/*.test.ts # unit + Worker + real-feed smoke tests
npm run lint     # oxlint
PROMPTFOO_DISABLE_TELEMETRY=1 npx promptfoo eval --config evals/promptfoo.yaml --no-share --no-write # deterministic evals
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

1. **Ingest, Pulse & Newsletters** — same-origin `/api/rss` fetches public RSS/Atom XML for browser `DOMParser` parsing (with `api.rss2json.com` and `api.allorigins.win` fallbacks), `/api/extract` uses `defuddle` for full-article extraction on allowed hosts, live **Community Pulse** pulls HN Top Stories + GitHub `topic:aws`, **OPML 2.0** restores Google Reader subscriptions, and the **Newsletter-to-Feed Bridge** (`src/lib/newsletter.ts` + sibling `workers/newsletter/`) turns raw `.eml`/RFC 822 emails into unguessable `/rss/:feedId`, `/atom/:feedId`, and `/json/:feedId` feeds via `postal-mime`.
2. **Score & Personalize** — four deterministic 0–100 dimensions: **Relevance 42% / Recency 24% / Authority 18% / Novelty 16%**. `explainScore()` exposes matched cues; optional local taste feedback (`rr-personalization` IndexedDB) nudges ordering without changing the deterministic score. No LLM or API key is involved in scoring.
3. **Search, Ask & Audio Briefing** — `/` runs quantized in-browser `all-MiniLM-L6-v2` semantic search in a Web Worker (`0.6` semantic + `0.4` keyword) with server `/api/embed` and keyword fallbacks; **Ask** (`POST /api/ask`) streams citation-enforced answers and abstains when sources are absent; **Daily Briefing** streams top-5 reads via browser Web Speech API; optional server-side **Gemini → OpenAI → Anthropic → Bedrock** summaries use configured providers cleanly.
4. **Act & Evaluate** — "→ Kiro task" opens `KiroTaskModal` (glass `Dialog`) to preview `tasks.md`, `requirements.md`, and `design.md`, copy Markdown, or download a ready-to-drop `<slug>-kiro-spec.zip` archive for `.kiro/specs/`. Deterministic quality gates run via `evals/promptfoo.yaml` and `.github/workflows/{ci,evals}.yml`.

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
preview, and start commands are local only; `.github/workflows/deploy.yml` deploys
only when manually dispatched (`workflow_dispatch`). See the full step-by-step
runbook and secret checklist in [`docs/deployment.md`](docs/deployment.md).

For a repeatable local Wrangler smoke test, set `READER_TEST_URL` to the running
local server's origin and run `npx tsx --test tests/api.test.ts tests/mcp.test.ts`.
These tests refuse AI-capable calls if that runtime has credentials configured.

### Submission docs & evidence still required

Submission drafts live in [`docs/submission/devpost-draft.md`](docs/submission/devpost-draft.md)
and [`docs/submission/demo-script.md`](docs/submission/demo-script.md). Local verification
is not a live deployment or proof of successful paid-provider calls. Before submission,
confirm the live `*.workers.dev` URL after manual deploy, verify a real configured provider
with the owner's approval, record the under-three-minute demo, and wire DNS/Email Routing if
activating live inbound addresses on `workers/newsletter/`.

Before exposing provider-backed endpoints publicly, review access controls,
rate limits, and provider budgets. The proxy checks hostnames and literal IPs,
including redirects, but does not resolve DNS to prevent rebinding. See
[`docs/resurrected-reader-system.md`](docs/resurrected-reader-system.md) for runtime
boundaries and remaining delivery requirements.

## License

MIT — see `LICENSE`.
