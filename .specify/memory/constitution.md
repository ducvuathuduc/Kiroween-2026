# Resurrected Reader Constitution

## Core Principles

### I. Spec-first (NON-NEGOTIABLE)
Every feature starts as a written spec — requirements, design, tasks — reviewed before any code is written. Specs live in `.kiro/specs/` (Kiro) and `.specify/specs/` (Spec Kit) and are committed next to the code they describe. No silent scope expansion: if it is not in the spec, it does not ship.

### II. Evidence-first, no fabrication (NON-NEGOTIABLE)
Never invent users, metrics, revenue, awards, API behavior, or feed availability. Live feeds are verified with curl before being listed. The signal score is a deterministic keyword + recency formula and must never be labeled "AI". Sample data is an offline fallback only and is always labeled as sample in the UI.

### III. Verify by build (NON-NEGOTIABLE)
No claim of "done" without proof: `npm run build` and `npx tsc --noEmit` must pass, the app must boot with no console errors, and every button must do something real. No dead UI, no lorem ipsum, no placeholder screens presented as finished.

### IV. Smallest coherent change
Preserve working code and healthy architecture. Fix root causes, not symptoms. No mass refactors, no new dependencies without a concrete benefit and a compatibility check. Prefer the platform over a library: use native web APIs before adding a dependency.

### V. Security & privacy
No secrets, API keys, tokens, or personal data in the repo or browser bundle — ever. Client-side code talks only to public RSS feeds and read-only public APIs (Hacker News Firebase API, GitHub public search API). Gemini summarization calls run strictly server-side (`server.ts` `/api/summarize`) using `GEMINI_API_KEY` provisioned by AI Studio Build. Existing user state (feeds, read/saved state, cached summaries) stays in browser `localStorage`; the personal taste profile stays on the device in IndexedDB and is not sent to the server.

## Technology Stack
- Web app: React 19 + Vite 8 + TypeScript 7 (strict), Tailwind CSS v4.
- Server runtime: Hono (`server.ts`) on Cloudflare Workers + Static Assets, with the Cloudflare Vite plugin for local development and builds. Existing API contracts and the stateless `/mcp` endpoint reuse server-only AI SDK provider fallback. `npm run start` runs the built Worker locally; deployment requires explicit owner approval. Optional future sync: Firebase Auth + Firestore.
- Package manager: npm. Commands: `npm run dev`, `npm run build`, `npm run start`, `npm run preview`, `npx tsc --noEmit`, `npm run lint`.

## Development Workflow
1. Spec: `/speckit-specify` or Kiro spec (requirements → design → tasks), review each phase.
2. Plan: `/speckit-plan` with the stack above; record decisions in the spec.
3. Tasks: `/speckit-tasks`, then `/speckit-implement` in small vertical slices.
4. Converge: `/speckit-converge` until it reports Converged; fix root causes, rerun checks.
5. Before any UI/CSS/JS work, consult `docs/modern-web-guidance/` (Google Chrome's Modern Web Guidance, vendored) — prefer native platform patterns over legacy libraries.

## Quality Gates
- `npm run build` passes; `npx tsc --noEmit` passes; `npm run lint` passes.
- Manual QA: app boots, feeds load or fail inline without crashing, filters/search/keyboard work, Kiro spec export & Gemini Summarize work, no console errors.
- Every PR/commit message states what changed, what was verified, and what remains unverified.

## Governance
This constitution supersedes all other practices in the repo. Amendments require a documented reason and an update to this file. Complexity must be justified. When this constitution conflicts with an agent's default habits, the constitution wins.

**Version**: 1.3.0 | **Ratified**: 2026-11-13 | **Last Amended**: 2026-11-14 (Owner approved local IndexedDB for the personal taste profile; existing state remains in localStorage.)
