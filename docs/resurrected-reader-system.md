# Resurrected Reader — System Description

> Google Reader died in 2013. Resurrected Reader brings it back as an **AI reading radar for AWS builders** — not an RSS clone. It reads, scores, and turns signal into action.
> Kiroween 2026 · Category: **Resurrection** · Team: solo (Huỳnh Diệu Thành, VTech Studio)

## 1. Problem & users

AWS builders drown in sources: AWS News Blog, AWS ML Blog, Hacker News, changelogs, Devpost. No signal, only noise. Good posts get buried; reading never turns into action.

**Primary user:** a solo AWS builder / founder who builds with Kiro and wants the 5 reads a day that actually matter — and a next step for each.

## 2. Product (v1 — this repo)

A 3-pane radar (Google Reader layout, reborn):

1. **Ingest** — RSS/Atom from builder sources, fetched client-side through a CORS proxy, parsed in the browser. Per-feed errors never break the app.
2. **Score** — every item gets a deterministic 0–100 Signal score: keyword weights (kiro +25, aws +15, agent/agentic +20, llm/ai coding +15, startup +10, security +10) + recency (today +15, this week +8), capped at 100. No LLM, no key, no cost.
3. **Triage** — sort by score, filters (All / High signal ≥70 / Unread / Saved), full-text search, keyboard (j/k/s/r).
4. **Read** — reader pane with an extractive summary (first 2–3 sentences) and an "Open original" link.
5. **Act** — "→ Kiro task" turns a read into a Markdown spec (Goal + acceptance criteria) copied to the clipboard, ready to paste into Kiro.

**Verified live feeds:** `aws.amazon.com/blogs/aws/feed/`, `aws.amazon.com/blogs/machine-learning/feed/`, `hnrss.org/frontpage`. Kiro blog has no RSS; AWS What's New feed returns empty — both excluded.

**Offline fallback:** 6 labeled sample items render when no live feed loads.

## 3. Architecture

### v1 — client-only (shipped)

```
RSS sources ──CORS proxy──▶ fetch (lib/feeds.ts) ──▶ parse (DOMParser)
                                                        │
                                              score (lib/scoring.ts)
                                                        ▼
UI (React) ◀── state (App.tsx, localStorage) ◀── sorted items
  ├─ TopBar      counts, refresh
  ├─ FeedList    feeds, unread counts, add/remove
  ├─ ItemList    score badges, filters, search
  └─ ReaderPane  summary, actions, Kiro-task copy
```

- **Stack:** React 19 + Vite 8 + TypeScript 7 (strict) + Tailwind CSS v4 — exactly the stack Google AI Studio Build generates. No other framework.
- **No backend, no keys, no database in v1.** State lives in `localStorage` (feeds, read/saved).
- **Module map:** `src/lib/` (feeds, scoring, sampleData — pure, testable), `src/components/` (one component per pane), `src/App.tsx` (state + keyboard + orchestration).

### v2 — vision (not built, not claimed)

- Gemini-powered abstractive summaries + "why this matters" (server-side `GEMINI_API_KEY`, never in client code).
- Firebase Auth + Firestore: sync feeds/state across devices, shared radars.
- Multiplayer reading rooms (AI Studio server runtime).
- OPML import/export, per-user scoring weights, daily digest email.

## 4. How it is built (agentic workflow)

- **Spec Kit** (`.specify/`): constitution → `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` → `/speckit-converge`. Commands wired for Gemini (`.gemini/commands/`).
- **Kiro** (`.kiro/`): steering (`product.md`, `tech.md`, `structure.md`), spec `resurrected-reader-v1` (requirements/design/tasks), hook `verify-on-save.json` (typecheck on every TS save), `settings/mcp.json`.
- **Modern Web Guidance** (`docs/modern-web-guidance/`, vendored from GoogleChrome, Apache-2.0): consult the relevant guide **before** writing UI/CSS/client JS — native platform patterns first (dialog, popover, view transitions, container queries), no legacy libraries.
- **Google AI Studio Build**: the app is developed in Build mode on the imported repo; GitHub sync pushes changes back with AI-written commit messages.

## 5. Quality gates (production-ready bar)

- `npm run build` passes · `npx tsc --noEmit` passes · `npm run lint` (oxlint) passes.
- Manual QA: boots with no console errors; a failing feed shows inline and others keep working; filters/search/keyboard verified; Kiro-task copy verified; no dead buttons; no lorem ipsum.
- No secrets in the repo; no fabricated metrics; scores labeled deterministic.

## 6. Deployment

Static site — any static host works (Vercel, Netlify, GitHub Pages, Cloudflare Pages). `npm run build` → `dist/`. No server needed for v1. Live URL is required for the Kiroween submission.

## 7. Risks & non-goals

- CORS proxy availability (allorigins) — mitigated by per-feed errors + sample fallback.
- RSS feeds change shape — parser is defensive (RSS `item` + Atom `entry`, missing fields default safely).
- Non-goals for v1: accounts, sync, server, LLM features, mobile app.

## 8. Repo map

```
├── .kiro/                  Kiro specs, steering, hooks, MCP
├── .specify/               Spec Kit: constitution, templates, scripts, workflows
├── .gemini/commands/       /speckit-* commands for Gemini
├── docs/
│   ├── resurrected-reader-system.md   this file
│   └── modern-web-guidance/          vendored Chrome web best practices
├── src/                    React app (App, components, lib)
├── index.html  package.json  vite.config.ts  tsconfig*.json
├── AGENTS.md               shared agent context (read this first)
├── README.md  LICENSE (MIT)  .gitignore
```
