# Docs + Site Pages Set — Requirements

## Overview

Resurrected Reader completes its standard website pageset alongside the existing `/docs`, `/about`, `/changelog`, `/privacy`, `/shortcuts`, and `/settings` views. Every new page reuses `PageShell` and the Vercel black & white + Geist + shadcn/ui visual system, is wired into History routing (`src/lib/routes.ts`), navigation (`TopBar`, `FeedList`, `CommandPalette`), and `PageShell` footer links with zero orphaned routes, and states only verified facts.

## Existing Pages Consistency Audit

- `AboutPage.tsx` (`/about`), `ChangelogPage.tsx` (`/changelog`), and `PrivacyPolicyPage.tsx` (`/privacy`) already exist and SHALL NOT be rebuilt.
- Existing pages SHALL be checked for factual contradictions and corrected minimally if needed (specifically updating `PrivacyPolicyPage.tsx` so localStorage/IndexedDB keys, current Worker API routes, and `/mcp`'s strictly read-only non-AI scope match the live implementation).

## Requirements (EARS)

1. **User Guide Page (`UserGuidePage.tsx`, `/guide`)**:
   - WHEN a user navigates to `/guide`, THE SYSTEM SHALL render a step-by-step User Guide inside `PageShell` covering all core workflows:
     1. Feed (3-pane subscriptions, filters, reading, Markdown copy, Kiro spec export, Ask Q&A, semantic search)
     2. Daily Briefing (+ single-narrator spoken-script audio & Gemini 3.8 Flash-Lite TTS / Web Speech fallback)
     3. Signal Radar (`/radar` & `/system` histograms, feed yield, 4D spider charts, feed health)
     4. Second Brain past-reads resurface (`From your past reads` in Reader & `Resurfaced today` in sidebar, honest semantic vs `topic-overlap` labeling)
     5. Newsletter-to-Feed bridge (`/rss/:feedId`, `/atom/:feedId`, `/json/:feedId`, `.eml`/raw import, isolated `workers/newsletter/` overview)
     6. Read-only MCP Server (`/mcp` authless read-only demo scope + `aws-docs` MCP config)
     7. Keyboard shortcuts (classic Google Reader bindings `j`/`k`/`Enter`/`/`/`⌘K`/`o`/`s`/`e`/`b`/`r`/`?`)
     8. Settings (density, default filter, alerts, personal ranking, AI provider selection, JSON/OPML exports, data erase)
   - WHEN a user clicks section links or workflow quick links on `/guide`, THE SYSTEM SHALL navigate smoothly to the matching section anchor or live route (`/`, `/briefing`, `/radar`, `/system`, `/docs`, `/shortcuts`, `/settings`).

2. **Terms of Service Page (`TermsPage.tsx`, `/terms`)**:
   - WHEN a user navigates to `/terms`, THE SYSTEM SHALL render an honest Terms of Service inside `PageShell` grounded in the repository's MIT License, local-first architecture, third-party RSS/pulse feed attribution, optional user/operator-configured AI provider usage, and standard open-source "AS IS" warranty disclaimer, with zero fabricated pricing tiers, subscriptions, or SLA guarantees.

3. **FAQ Page (`FaqPage.tsx`, `/faq`)**:
   - WHEN a user navigates to `/faq`, THE SYSTEM SHALL render an accessible FAQ inside `PageShell` using native `<details>`/`<summary>` disclosure controls (per `docs/modern-web-guidance/guides/html/html.md`) covering common questions on deterministic 4D signal scoring vs. AI, browser-local storage vs. server keys, offline PWA behavior, spoken audio fallback, Second Brain resurfacing, and read-only MCP/A2A endpoints.

4. **Contact & Support Page (`ContactPage.tsx`, `/contact`)**:
   - WHEN a user navigates to `/contact`, THE SYSTEM SHALL render a Contact & Support page inside `PageShell` listing only real project channels: email (`huynhthanh@vtechstudio.tech`, with `mailto:` link and copy-to-clipboard button) and the GitHub repository (`https://github.com/ducvuathuduc/Kiroween-2026`), plus direct self-service troubleshooting links (`/system`, `/faq`, `/guide`).
   - THE SYSTEM SHALL NOT invent phone numbers, physical office addresses, live chat widgets, paid support plans, or fake ticket endpoints.

5. **Routing, Navigation & Zero Orphaned Pages (`src/lib/routes.ts`, `PageShell.tsx`, `TopBar.tsx`, `FeedList.tsx`, `CommandPalette.tsx`, `src/App.tsx`)**:
   - WHEN a user opens `/guide`, `/terms`, `/faq`, or `/contact` directly by URL, via `history.pushState`/`popstate`, via the footer directory, via the TopBar Pages menu, via the sidebar workspace links, or via `⌘K` Command Palette, THE SYSTEM SHALL resolve the route cleanly, update `document.title`, mark active `aria-current="page"`, and render the corresponding page with zero console errors.
   - WHEN inspecting `ROUTES` and `PageShell` footer links, EVERY navigable route in `ROUTES` SHALL be reachable from the footer directory and navigation menus so zero pages are orphaned.

6. **Preservation & Verification**:
   - THE SYSTEM SHALL NOT modify deployment configuration (`.github/workflows/deploy.yml`), secrets, or `workers/newsletter/`.
   - TypeScript (`npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.node.json --noEmit`), full unit tests (`npx tsx --test tests/*.test.ts` including tests for `/guide`, `/terms`, `/faq`, `/contact` and route parity), production build (`npm run build`), linter (`npm run lint`), and headless Chromium preview verification across all new routes and every nav/footer link SHALL pass with zero console errors.
