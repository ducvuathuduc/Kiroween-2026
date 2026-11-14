# Resurrected Reader

> **Google Reader, back from the dead — as an AI reading radar for AWS builders.**
>
> Kiroween 2026 · Category: **Resurrection** · Live URL: **TBD** (pending manual Cloudflare Workers deploy by repo owner)

## Elevator Pitch

In 2013 Google Reader shut down, leaving engineering teams drowning in unprioritized RSS tabs, email newsletters, and social links. **Resurrected Reader** brings back Google Reader's iconic 3-pane keyboard workflow (`j`/`k`, `Cmd/Ctrl+K`, OPML 2.0) and turns it into a **spec-first AI reading radar for AWS builders**: every article and imported newsletter receives a transparent, deterministic 4-dimension signal score (`0–100`), supports grounded Ask Q&A with clickable feed citations, searches locally via in-browser `all-MiniLM-L6-v2` embeddings, reads a Daily Briefing aloud via Web Speech API, and exports ready-to-drop `.kiro/specs/` `.zip` bundles so reading becomes shipping.

## Inspiration

Reading engineering blogs is not the job — shipping is. Classical feed readers treated a major Amazon Bedrock architecture launch the same as a minor release note: chronological firehoses with zero triage or bridge into your IDE workflow. We wanted to resurrect the speed and clarity of Google Reader on modern **Cloudflare Workers + Static Assets** while keeping the reader honest: the `0–100` signal score is **100% deterministic math (never called AI)**, and AI features only activate where genuine synthesis or retrieval is needed, abstaining explicitly when answers aren't in today's feeds.

## What It Does (All 10 Shipped Backlog Capabilities)

1. **Offline-Capable PWA (`#1`)** — Precache + `NetworkFirst` runtime caching (`rr-pages-v1`, `rr-rss-v1`, `rr-assets-v1`) via `vite-plugin-pwa`, offline cached briefing snapshots, synthetic cover cache, and explicit user-triggered update prompts.
2. **Browser Audio Daily Briefing (`#2`)** — Top-5 high-signal briefing queue (`DailyBriefingView`) with native `window.speechSynthesis` playback controls, voice selection, and rate adjustment in `TopBar` and briefing cards.
3. **Full-Article Extraction (`#3`)** — Same-origin `/api/extract` route powered by `defuddle` + `linkedom` + `turndown`, scoped to permitted public hosts (`AWS News Blog`, `AWS ML Blog`, `Hacker News`), upgrading reader excerpts and recalculating deterministic signal depth.
4. **In-Browser Semantic Search (`#4`)** — Web Worker running quantized `all-MiniLM-L6-v2` (`@huggingface/transformers`), caching 384-d vectors in IndexedDB (`rr-semantic`), and ranking timelines via `0.6 * cosineSimilarity + 0.4 * keywordMatch` with server `/api/embed` and pure keyword fallbacks.
5. **On-Device Personal Taste Boost (`#5`)** — Privacy-preserving local feedback centroids and topic weights stored in IndexedDB (`rr-personalization`) that re-order timelines without modifying the transparent 4D deterministic score.
6. **Grounded Ask with Citations & Abstention (`#6`)** — `POST /api/ask` NDJSON stream (`server/ask.ts` + `server/askPolicy.ts`) retrieving over today's live feeds, enforcing source citation brackets (`[1]`), and abstaining honestly (`"not in today's feeds"`) when evidence is insufficient.
7. **Automated CI & Manual-Only Deploy Gate (`#7`)** — `.github/workflows/ci.yml` runs strict TypeScript checks, `oxlint`, unit/integration suites, and Vite/Wrangler bundle builds on every push/PR; `.github/workflows/deploy.yml` gates Cloudflare deployment strictly behind manual `workflow_dispatch`.
8. **Promptfoo Deterministic Eval Suite (`#8`)** — `evals/promptfoo.yaml` runs 30 deterministic checks (`promptfoo-evals` in `.github/workflows/evals.yml`) verifying scoring boundaries, citation validation, abstention policy, and Kiro bundle formatting without spending paid API tokens; optional judge eval (`evals/promptfoo.judge.yaml`) runs when `OPENAI_API_KEY` is provided.
9. **A2A Discovery & Stateless Task Stub (`#9`)** — `/.well-known/agent-card.json` and JSON-RPC `POST /a2a/tasks` (`message/send`) exposing `get_top_items`, `get_briefing`, and `export_kiro_task` over live public feeds.
10. **Newsletter-to-Feed Bridge (`#10`)** — Inspired by `leafac/kill-the-newsletter` and `juherr/kill-the-news` (MIT): generates cryptographically random 128-bit `feedId`s decoupled from readable inbound addresses (`noun.noun.NN@domain`), parses raw RFC 822 / `.eml` newsletters with `postal-mime`, scores entries through `explainScore()`, supports AI TL;DRs, serves `/rss/:feedId`, `/atom/:feedId`, and `/json/:feedId` with `ETag`/`304`, and provides an isolated sibling Email Routing Worker (`workers/newsletter/`).

## How We Built It with Kiro

Every single milestone followed a strict **spec-first Kiro workflow**: `requirements.md` -> `design.md` -> `tasks.md` -> vertical-slice implementation -> automated verification (`tsc`, `oxlint`, `tsx --test`, `npm run build`, `promptfoo`, and real Chromium Playwright QA).

- **14 Spec Directories in `.kiro/specs/`:**
  - `resurrected-reader-v1` (core 3-pane reader, deterministic 4D scoring, Signal Radar Recharts, Mermaid pipeline, Kiro `.zip` export)
  - `backlog-pwa`, `backlog-a2a`, `backlog-extract`, `backlog-ask`, `backlog-ask-finish`, `backlog-personalize`, `backlog-audio`, `backlog-semantic`, `backlog-evals`, `backlog-ci`, `backlog-newsletter`, `backlog-deploy`, `backlog-submission`
- **Steering (`.kiro/steering/`):** `product.md`, `tech.md`, and `structure.md` kept every component locked to React 19 + Vite 8 + TypeScript 7 strict + Tailwind v4 + monochrome Vercel Geist tokens + `.specify/memory/constitution.md` honesty rules.
- **Hooks (`.kiro/hooks/`):** `verify-on-save.json` triggered `npx tsc --noEmit` automatically after `.ts`/`.tsx` edits so type regressions surfaced immediately.
- **MCP Integration (`.kiro/settings/mcp.json` + `/mcp`):** Configured `awslabs.aws-documentation-mcp-server` for Kiro spec verification alongside Resurrected Reader's own 8-tool Streamable HTTP `/mcp` endpoint (`hono` + `@modelcontextprotocol/server`).
- **One-Click Spec Export (`KiroTaskModal`):** Pure client-side IEEE 802.3 CRC-32 PKZIP builder (`src/lib/zip.ts`) packages `requirements.md`, `design.md`, and `tasks.md` for any article or newsletter straight into `<slug>-kiro-spec.zip` ready to unzip into `.kiro/specs/`.

## Challenges We Ran Into

- **Worker Bundle Size & Runtime Isolation:** `@huggingface/transformers` ONNX WASM assets are huge for edge Workers; we ensured `dist/worker/` excludes all transformer/eval bundles (`optimizeDeps.exclude` + client-only Web Worker) while keeping `dist/worker/` clean under Cloudflare's 25 MiB cap.
- **Honest AI Boundaries:** Preventing hallucinated summaries or ungrounded Ask answers required strict server-side citation checks (`server/askPolicy.ts`) and returning explicit `503` notices instead of fabricated fallbacks whenever server provider keys are unset.
- **Same-Origin Capability Feeds:** Keeping private newsletter `/rss/:feedId` feeds decoupled from external CORS proxies (`rss2json` / `allorigins`) so unguessable capability URLs never leak to third parties, while excluding `/rss/*`, `/atom/*`, and `/json/*` from Workbox navigation caching.

## Accomplishments That We're Proud Of

- Zero-key baseline that actually works out of the box: live AWS & HN feeds, deterministic 4D scoring, local `all-MiniLM-L6-v2` semantic search, browser TTS audio briefing, manual newsletter `.eml` parsing, Kiro `.zip` export, MCP, and A2A all operate without paid API keys.
- Multi-provider AI routing via Vercel AI SDK v7 (`Gemini -> OpenAI -> Anthropic -> Amazon Bedrock`) keeping `@google/genai` intact and all secrets strictly server-side.
- Verifiable engineering discipline across unit tests, deterministic promptfoo evals, Workers bundling, and browser end-to-end flows.

## What We Learned

Resurrecting an iconic 2013 product is not about nostalgia skins — it is about pairing keyboard-first information density with modern edge primitives, verifiable scoring boundaries, and direct bridges from reading into engineering specs.

## What's Next

- Owner-triggered Cloudflare Workers deployment via `.github/workflows/deploy.yml` and live URL verification.
- Optional owner-side provisioning of `NEWSLETTER_KV` + MX/Email Routing DNS records to activate live inbound email capture on the sibling `workers/newsletter/` Worker.
- Optional judge-backed `promptfoo` runs (`OPENAI_API_KEY`) and live multi-provider QA before final Devpost submission.
