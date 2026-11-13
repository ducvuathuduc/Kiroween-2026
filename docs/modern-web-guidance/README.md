# Modern Web Guidance (vendored)

Vendored copy of [GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance) v1.0.0 (2026-11-09), Apache License 2.0 — see `LICENSE-Apache-2.0`. Canonical source is the upstream repo; this copy exists so agents working in this repo (especially Google AI Studio Build, which has no shell access to `npx`) can read the guides directly.

## What it is

250 expert-curated guides for modern web platform best practices: CSS/layout, HTML/DOM, JavaScript/APIs, accessibility, performance, forms, security, privacy, PWA, UI atoms/behaviors/components, user experience, visual design, built-in AI, WebAssembly, WebMCP.

## How to use it in this repo

- **Before writing or changing any UI, CSS, or client-side JS**, find the guide for the pattern you are implementing under `guides/<category>/` and read it first. `SKILL.md` lists the trigger topics.
- Prefer native platform APIs from the guides over adding a library (e.g. `<dialog>` + Popover API instead of a modal library, container queries instead of JS resize observers).
- With Gemini CLI / an agent that has shell access, the canonical workflow is `npx -y modern-web-guidance@latest search "<2-5 word query>"` then `retrieve "<id>"` (see `SKILL.md`). In AI Studio Build, read the guide files directly.
- When a guide shaped your change, name it in your summary (e.g. "applied `light-dismiss-a-dialog`").
- Do **not** run `legacy-scan` here — it is for modernizing legacy codebases, not for new features.

## Updating

To refresh to a newer upstream release, replace this folder with a fresh copy of `skills/modern-web-guidance/` from the upstream repo and update the version + date above.
