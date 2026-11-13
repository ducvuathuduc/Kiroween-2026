# Spec: Resurrected Reader v1 — Tasks

- [ ] 1. Scaffold Vite + React + TypeScript + Tailwind; verify `npm run build` passes on the empty scaffold.
- [ ] 2. `src/lib/feeds.ts`: fetch + parse RSS/Atom through the CORS proxy; per-feed errors.
- [ ] 3. `src/lib/scoring.ts`: deterministic 0–100 signal score per design.md.
- [ ] 4. `src/lib/sampleData.ts`: 6 realistic sample items, labeled as sample.
- [ ] 5. Layout: TopBar (counts, last refresh, Refresh), 3 panes, dark resurrection theme.
- [ ] 6. FeedList: feeds with unread counts, add-feed (validated), remove-feed, "All items".
- [ ] 7. ItemList: score badges, read/unread, filters (All / High signal / Unread / Saved), search.
- [ ] 8. ReaderPane: summary (first 2–3 sentences, HTML stripped), Open original, Save, Mark unread.
- [ ] 9. KiroTaskModal: Markdown spec from the selected item + Copy to clipboard.
- [ ] 10. Persistence: feeds + read/saved in localStorage.
- [ ] 11. Keyboard: j/k navigate, s save/unsave, r refresh.
- [ ] 12. Empty/error states; verify `npm run build` passes and no console errors.
- [ ] 13. README (run instructions) + MIT LICENSE. Do not delete `.kiro/`.
