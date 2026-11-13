# AGENTS.md — Resurrected Reader

Shared context for every agent working in this repo (Kiro, Gemini, AI Studio Build, or any other). Read this first.

## What this is
Resurrected Reader — Google Reader reborn as an AI reading radar for AWS builders. Kiroween 2026, category Resurrection. Full description: `docs/resurrected-reader-system.md`. Constitution: `.specify/memory/constitution.md` (it wins over your defaults).

## Stack (do not change)
- React 19 + Vite 8 + TypeScript 7 (strict) + Tailwind CSS v4. This is exactly what Google AI Studio Build generates. Do **not** introduce Vue, Svelte, Next.js, or another framework.
- No backend in v1. No API keys. RSS via `https://api.allorigins.win/raw?url=` + `DOMParser`.
- npm. Commands: `npm run dev` / `npm run build` / `npm run preview` / `npx tsc --noEmit` / `npm run lint`.

## Where things live
- App: `src/App.tsx`, `src/components/` (one per pane), `src/lib/` (feeds, scoring, sampleData — pure functions).
- Specs: `.kiro/specs/resurrected-reader-v1/` (requirements/design/tasks) and `.specify/specs/`. Read the spec before changing behavior.
- Steering: `.kiro/steering/` (product/tech/structure). Hooks: `.kiro/hooks/` (typecheck on save). Never delete `.kiro/`.
- Spec Kit: `.specify/` (constitution, templates, scripts). Commands: `.gemini/commands/speckit.*.toml`.
- Web best practices: `docs/modern-web-guidance/` (vendored from GoogleChrome/modern-web-guidance v1.0.0, Apache-2.0).

## Rules
1. **Spec first.** No feature without a spec entry. Update the spec when behavior changes.
2. **Before any UI/CSS/client-JS work**, read the relevant guide in `docs/modern-web-guidance/guides/` (accessibility, performance, forms, css, html, ui-components, …). Prefer native platform APIs over adding a library. If a guide shaped your change, say which one.
3. **Never invent.** No fake feeds, metrics, users, or API behavior. The signal score is deterministic — never call it "AI". Sample data is labeled SAMPLE.
4. **Verify before claiming done:** `npm run build` + `npx tsc --noEmit` pass, app boots with no console errors, every button works.
5. **Smallest coherent change.** No rewrites, no new dependencies without a concrete benefit.
6. **No secrets in the repo.** Ever.
