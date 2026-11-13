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
No secrets, API keys, tokens, or personal data in the repo — ever. Client-side code talks only to public RSS feeds through a CORS proxy. User data (feeds, read/saved state) stays in the user's own browser (localStorage). Nothing is sent to a server in v1.

## Technology Stack
- Web app: React 19 + Vite 8 + TypeScript 7 (strict), Tailwind CSS v4. This is exactly the stack Google AI Studio Build generates — do not introduce another framework.
- No backend in v1. Optional v2: Node.js server runtime, Firebase (Firestore + Auth), Gemini API via server-side secrets.
- Package manager: npm. Commands: `npm run dev`, `npm run build`, `npm run preview`, `npx tsc --noEmit`, `npm run lint`.

## Development Workflow
1. Spec: `/speckit-specify` or Kiro spec (requirements → design → tasks), review each phase.
2. Plan: `/speckit-plan` with the stack above; record decisions in the spec.
3. Tasks: `/speckit-tasks`, then `/speckit-implement` in small vertical slices.
4. Converge: `/speckit-converge` until it reports Converged; fix root causes, rerun checks.
5. Before any UI/CSS/JS work, consult `docs/modern-web-guidance/` (Google Chrome's Modern Web Guidance, vendored) — prefer native platform patterns over legacy libraries.

## Quality Gates
- `npm run build` passes; `npx tsc --noEmit` passes; `npm run lint` passes.
- Manual QA: app boots, feeds load or fail inline without crashing, filters/search/keyboard work, Kiro-task copy works, no console errors.
- Every PR/commit message states what changed, what was verified, and what remains unverified.

## Governance
This constitution supersedes all other practices in the repo. Amendments require a documented reason and an update to this file. Complexity must be justified. When this constitution conflicts with an agent's default habits, the constitution wins.

**Version**: 1.0.0 | **Ratified**: 2026-11-13 | **Last Amended**: 2026-11-13
