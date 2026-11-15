# Tasks — Docs + Site Pages Set

- [x] Read existing pages and routing (`PageShell.tsx`, `DocsPage.tsx`, `AboutPage.tsx`, `ChangelogPage.tsx`, `PrivacyPolicyPage.tsx`, `SettingsPage.tsx`, `ShortcutsPage.tsx`, `routes.ts`, `App.tsx`, `TopBar.tsx`, `FeedList.tsx`, `CommandPalette.tsx`) and `docs/modern-web-guidance/guides/{html/html.md, accessibility/accessibility.md}`.
- [x] Write `.kiro/specs/docs-pages/{requirements.md, design.md, tasks.md}` before writing code.
- [x] Update `src/lib/routes.ts` to register `/guide`, `/faq`, `/terms`, and `/contact` (`guide`, `faq`, `terms`, `contact`).
- [x] Implement `src/components/UserGuidePage.tsx`, `src/components/TermsPage.tsx`, `src/components/FaqPage.tsx`, and `src/components/ContactPage.tsx` reusing `PageShell` and the Vercel Geist visual system with honest, non-fabricated content and accessible native semantics.
- [x] Check `AboutPage.tsx`, `ChangelogPage.tsx`, and `PrivacyPolicyPage.tsx` for consistency and apply minimal surgical fixes to `PrivacyPolicyPage.tsx` for any contradictions (updated storage keys, active AI/TTS endpoints, and `/mcp` read-only non-AI scope).
- [x] Wire all four new pages into `src/App.tsx`, `src/components/PageShell.tsx` footer links, `src/components/TopBar.tsx` Pages dropdown, `src/components/FeedList.tsx` workspace links, and `src/components/CommandPalette.tsx` icons so zero pages are orphaned.
- [x] Add unit tests in `tests/production.test.ts` verifying route parsing, normalization, reverse routing, `searchCommandTargets` lookup, and footer/route completeness for all new pages.
- [x] Verify `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.node.json --noEmit`, `npx tsx --test tests/*.test.ts`, `npm run lint`, `npm run build`, and headless Chromium preview verification across `/guide`, `/faq`, `/terms`, `/contact`, and all nav/footer links with 0 console errors; mark tasks complete.
