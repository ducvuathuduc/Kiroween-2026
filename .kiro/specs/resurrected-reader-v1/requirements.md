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
- [x] Signal score 0–100, deterministic across 4 normalized dimensions (relevance 42%, recency 24%, authority 18%, novelty 16%), calibrated so high-signal real AWS/AI items land ≥70.
- [x] List sorted by score desc, then date desc. High-signal filter shows only ≥70.
- [x] Real feed image extraction (`media:content`, `media:thumbnail`, `enclosure`, `og:image`, RSS HTML `<img>`, and cached server-side `og:image` enrichment) rendered as thumbnails in the list and cover image in the reader pane, with a monogram tile fallback (never broken images).
- [x] Compact visual list rows showing thumbnail, title, score badge, and one-line summary (prioritizing Gemini TL;DR first line when available).
- [x] Clicking an item opens it in the reader pane with animated score count-up and marks it read.
- [x] Save/Unsave, Mark unread, Refresh all work. Refresh re-fetches all feeds and updates the timestamp.
- [x] Signal Radar view (Recharts): score distribution histogram, per-feed activity chart, and 4-dimension radar/spider chart per item built from live data.
- [x] System architecture view & modal pipeline tab: Mermaid diagram (`feed → score → action pipeline`) rendered cleanly in monochrome.
- [x] "→ Kiro task" shows a 3-file spec preview (`tasks.md`, `requirements.md`, `design.md`) plus item pipeline Mermaid tab, copies Markdown to clipboard, and downloads a `<slug>-kiro-spec.zip` bundle; AWS Docs MCP registered in `.kiro/settings/mcp.json`.
- [x] "Summarize" generates a structured Gemini TL;DR via server-side `POST /api/summarize` without exposing `GEMINI_API_KEY`.
- [x] Community Pulse displays live Hacker News top stories and GitHub `topic:aws` repositories with `localStorage` + session caching.
- [x] OPML import/export (Google Reader `.opml`), Web Share (`navigator.share` + clipboard fallback), and high-signal notifications (`≥85`) work natively.
- [x] Keyboard: j/k move selection, s save/unsave, r refresh.
- [x] 6 sample items bundled so first open looks alive offline; labeled as sample.
- [x] `npm run build` passes; no console errors on load; no dead buttons; no lorem ipsum.
