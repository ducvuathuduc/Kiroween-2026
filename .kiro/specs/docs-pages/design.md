# Docs + Site Pages Set — Design

## Architecture & Visual System

All new pages reuse `PageShell` (`src/components/PageShell.tsx`) with the existing Vercel monochrome palette (`bg-white`, `zinc-50`/`zinc-200`/`zinc-950`), self-hosted Geist & Geist Mono (`font-mono tabular-nums`), and existing `shadcn/ui` primitives (`Button`, `Separator`, `Badge`).

### Modern-Web Guidance Applied

- `docs/modern-web-guidance/guides/html/html.md`:
  - Native `<details>` and `<summary>` disclosure elements with `name="faq-group"` (or independent `<details>` blocks) for the FAQ page — avoiding unnecessary JS state or custom ARIA accordions, and keeping `<summary>` free of nested headings or links.
  - One semantic `<h1>` per page, sequential `<h2>`/`<h3>` hierarchy, `<ol>` for ordered step-by-step instructions, `<dl>` for structured definitions/channels, and `<a>` for route/external navigation vs `<button type="button">` for copy actions.
- `docs/modern-web-guidance/guides/accessibility/accessibility.md`:
  - Distinct accessible names for navigation landmarks (`aria-label="Guide sections"`, `aria-label="Site directory"`), `aria-current="page"` on active footer/nav items, `role="status"` + `aria-live="polite"` feedback when copying `huynhthanh@vtechstudio.tech`, and clean visible `:focus-visible` states.

## Routing & Navigation Design

### 1. `src/lib/routes.ts`
Extend `AppRoute` with `'guide' | 'terms' | 'faq' | 'contact'`:
- `{ id: 'guide', path: '/guide', label: 'User Guide', ... }`
- `{ id: 'faq', path: '/faq', label: 'FAQ', ... }`
- `{ id: 'terms', path: '/terms', label: 'Terms of Service', ... }`
- `{ id: 'contact', path: '/contact', label: 'Contact & Support', ... }`

Export `SITE_FOOTER_ROUTES` (or keep `FOOTER_LINKS` synced cleanly and tested) so unit tests verify every `NavigableRoute` is present in the site directory.

### 2. Navigation & Zero-Orphan Wiring
- **`PageShell.tsx`**: Include all 14 `NavigableRoute` pages in `FOOTER_LINKS` (`Feed`, `Briefing`, `Signal Radar`, `System & Health`, `User Guide`, `Docs`, `Shortcuts`, `Settings`, `About`, `Changelog`, `FAQ`, `Privacy Policy`, `Terms of Service`, `Contact`).
- **`TopBar.tsx`**: Add `User Guide`, `FAQ`, `Terms of Service`, and `Contact & Support` under the `Pages` section of the reader options dropdown (`MoreHorizontal`).
- **`FeedList.tsx`**: Add `Guide`, `FAQ`, `Terms`, `Contact` alongside `Docs`, `Settings`, `About`, `Changelog`, `Privacy` in the sidebar `Workspace resources` footer links.
- **`CommandPalette.tsx`**: Already maps all `ROUTES` via `searchCommandTargets`; add distinct Lucide icons (`Compass`, `HelpCircle`, `Scale`, `Mail`) in `targetIcon()` for `guide`, `faq`, `terms`, `contact`.
- **`src/App.tsx`**: Render `<UserGuidePage />`, `<FaqPage />`, `<TermsPage />`, and `<ContactPage />` cleanly in the `activeView` switch.

## Page Breakdown

### 1. `src/components/UserGuidePage.tsx` (`/guide`)
- Sticky sidebar TOC (`Guide sections` — matching `DocsPage.tsx` responsive 12-col grid) jumping cleanly to 8 ordered step-by-step sections:
  1. Feed (3-pane triage, filters, Markdown copy, Kiro `.zip`, Ask Q&A, semantic search)
  2. Daily Briefing & Audio (Top 5 TL;DR synthesis, single-narrator spoken script, Gemini 3.8 Flash-Lite TTS MP3 vs Web Speech fallback)
  3. Signal Radar & Feed Health (`/radar` charts & `/system` status)
  4. Second Brain Past-Reads Resurface (`From your past reads` in Reader, `Resurfaced today` in sidebar, honest semantic vs `topic-overlap` match badges)
  5. Newsletter-to-Feed Bridge (private `/rss/:feedId`, `/atom/:feedId`, `/json/:feedId`, pasting RFC 822 or `.eml`, isolated `workers/newsletter/`)
  6. MCP Server (`/mcp` authless read-only demo tools + `aws-docs` MCP)
  7. Keyboard Shortcuts (`j`/`k`/`Enter`/`/`/`⌘K`/`o`/`s`/`e`/`b`/`r`/`?` + link to `/shortcuts` & `?` modal)
  8. Settings (density, startup filter, personal ranking, alerts, provider availability, JSON/OPML export & two-step clear)
- Cross-links cleanly to `/docs` (Technical Reference) and live views.

### 2. `src/components/TermsPage.tsx` (`/terms`)
- Clear sections:
  1. Open-Source License (MIT License; authored by Huỳnh Diệu Thành / VTech Studio for Kiroween 2026)
  2. Service Scope & Local-First Responsibility (browser `localStorage`/IndexedDB persistence, user backups via JSON/OPML)
  3. External Feeds & Third-Party Content (RSS/Atom publishers, HN/GitHub Pulse, fallback CORS proxies, publisher copyright)
  4. Optional AI Providers, MCP & Audio Features (server-configured keys, no guaranteed accuracy of AI summaries/Ask answers, deterministic 4D score transparency, authless read-only `/mcp` scope)
  5. Acceptable Use & Warranty Disclaimer (MIT "AS IS" without warranty or SLA; real contact `huynhthanh@vtechstudio.tech`).

### 3. `src/components/FaqPage.tsx` (`/faq`)
- Grouped native `<details>` / `<summary>` disclosures answering real user questions accurately:
  - Scoring & "is the score AI?" (No — 100% deterministic 4D formula)
  - Where data is stored and whether accounts exist (No accounts; localStorage + IndexedDB + Cache API; JSON/OPML export)
  - Why some AI features or providers show unavailable (Server keys stay server-side; unconfigured providers skip cleanly or fall back to extractive/Web Speech)
  - How Daily Briefing audio works without a key (Honest Web Speech fallback using the single-narrator spoken script)
  - How Second Brain matches past reads without an API key (`topic-overlap` deterministic matching vs semantic cosine when embeddings exist)
  - How Newsletter-to-Feed and `/mcp` work safely (Unguessable 128-bit `/rss/:feedId`, read-only authless `/mcp` over public default feeds)
  - Offline PWA capabilities

### 4. `src/components/ContactPage.tsx` (`/contact`)
- Direct channels:
  - Email support & feedback: `mailto:huynhthanh@vtechstudio.tech` + working `Copy email` button with accessible live feedback.
  - Bug reports & source code: `https://github.com/ducvuathuduc/Kiroween-2026` & `/issues`.
- Self-service diagnostics & documentation links:
  - Check live feed status in `/system`
  - Browse `/guide` and `/faq`
  - Review `/privacy` and `/terms`
- Zero fabricated SLAs, response-time promises, phone lines, or dummy forms.

### 5. Existing Pages Consistency Fix (`src/components/PrivacyPolicyPage.tsx`)
- Surgical fix only: add `rr.newsletter.v1`, `rr.pastReads.v1`, and IndexedDB (`rr-personalization`, `rr-semantic`) / Cache Storage notes; list active Worker routes (`/api/ai/summarize`, `/api/ai/embed`, `/api/ai/resurface`, `/api/ask`, `/api/extract`, `/api/briefing/audio`, `/api/briefing/script`); correct paragraph on `/mcp` so it accurately reflects read-only deterministic/public catalog tools without claiming `/mcp` invokes paid AI tools.
