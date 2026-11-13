# Spec: Resurrected Reader v1 — Requirements

## User stories

1. As a builder, I add an RSS feed URL and see its items appear in the radar, so I can track sources I care about.
2. As a builder, I see every item with a 0–100 Signal score, sorted highest first, so the important reads surface without scrolling.
3. As a builder, I filter by All / High signal (≥70) / Unread / Saved and search by title, so I can triage fast.
4. As a builder, I open an item in the reader pane with a short summary and an "Open original" link, so I can decide in seconds whether to read the full post.
5. As a builder, I turn a high-signal item into a Kiro task (Markdown spec with Goal + Acceptance criteria) copied to my clipboard, so reading becomes action.
6. As a builder, my feeds, read and saved state persist across visits, so the radar remembers me.

## Acceptance criteria

- [ ] Add feed validates http(s) URL, fetches it, shows items; invalid URL shows an inline error, no crash.
- [ ] A feed that fails to fetch shows a per-feed error; other feeds keep working.
- [ ] Signal score 0–100, deterministic: keyword weights (kiro +25, aws +15, agent/agentic +20, llm/ai coding +15, startup +10, security +10) + recency (today +15, this week +8), capped at 100.
- [ ] List sorted by score desc, then date desc. High-signal filter shows only ≥70.
- [ ] Clicking an item opens it in the reader pane and marks it read.
- [ ] Save/Unsave, Mark unread, Refresh all work. Refresh re-fetches all feeds and updates the timestamp.
- [ ] "→ Kiro task" shows a modal with a Markdown spec and copies it to clipboard.
- [ ] Keyboard: j/k move selection, s save/unsave, r refresh.
- [ ] 6 sample items bundled so first open looks alive offline; labeled as sample.
- [ ] `npm run build` passes; no console errors on load; no dead buttons; no lorem ipsum.
