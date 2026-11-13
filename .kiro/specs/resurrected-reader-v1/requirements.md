# Spec: Resurrected Reader v1 — Requirements

## User stories

1. As a builder, I add an RSS feed URL and see its items appear in the radar, so I can track sources I care about.
2. As a builder, I see every item with a 0–100 Signal score, sorted highest first, so the important reads surface without scrolling.
3. As a builder, I filter by All / High signal (≥70) / Unread / Saved and search by title, so I can triage fast.
4. As a builder, I open an item in the reader pane with a short summary and an "Open original" link, so I can decide in seconds whether to read the full post.
5. As a builder, I turn a high-signal item into a Kiro task (Markdown spec with Goal + Acceptance criteria) copied to my clipboard, so reading becomes action.
6. As a builder, my feeds, read and saved state persist across visits, so the radar remembers me.

## Acceptance criteria

- [x] Add feed validates http(s) URL, fetches it, shows items; invalid URL shows an inline error, no crash.
- [x] A feed that fails to fetch shows a per-feed error; other feeds keep working.
- [x] Signal score 0–100, deterministic: keyword weights (kiro +25, aws +15, agent/agentic +20, llm/ai coding +15, startup +10, security +10) + recency (today +15, this week +8), capped at 100.
- [x] List sorted by score desc, then date desc. High-signal filter shows only ≥70.
- [x] Clicking an item opens it in the reader pane and marks it read.
- [x] Save/Unsave, Mark unread, Refresh all work. Refresh re-fetches all feeds and updates the timestamp.
- [x] "→ Kiro task" shows a 3-file spec preview (`tasks.md`, `requirements.md`, `design.md`), copies Markdown to clipboard, and downloads a `<slug>-kiro-spec.zip` bundle; AWS Docs MCP registered in `.kiro/settings/mcp.json`.
- [x] "Summarize" generates a structured Gemini TL;DR via server-side `POST /api/summarize` without exposing `GEMINI_API_KEY`.
- [x] Community Pulse displays live Hacker News top stories and GitHub `topic:aws` repositories with `localStorage` + session caching.
- [x] OPML import/export (Google Reader `.opml`), Web Share (`navigator.share` + clipboard fallback), and high-signal notifications (`≥85`) work natively.
- [x] Keyboard: j/k move selection, s save/unsave, r refresh.
- [x] 6 sample items bundled so first open looks alive offline; labeled as sample.
- [x] `npm run build` passes; no console errors on load; no dead buttons; no lorem ipsum.
