# Design — Submission Drafts (Devpost, Demo Script, README)

## Deliverables

1. **`docs/submission/devpost-draft.md`**:
   - Follows Devpost Markdown headings cleanly: Project Name, Tagline, Elevator Pitch, Inspiration, What it does (explicitly organized across the 10 implemented backlog capabilities: #1 Offline PWA, #2 Audio Daily Briefing, #3 Full-Text Defuddle Extraction, #4 In-Browser Semantic Search, #5 Personal Reading Boost, #6 Ask Today's Feeds with Citations, #8 Promptfoo Eval Harness, #9 A2A Discovery & Stateless Task Stub, #10 Newsletter-to-Feed Bridge, plus core V1: 4D Deterministic Scoring, Signal Radar, Daily Briefing, Kiro Spec `.zip` Export, MCP `/mcp`), How we built it with Kiro (enumerating all `.kiro/specs/` directories, `.kiro/steering/`, `.kiro/hooks/verify-on-save.json`, `.kiro/settings/mcp.json`, and the `requirements → design → tasks → implement → verify` loop), Challenges we ran into, Accomplishments that we're proud of (factual test/build counts only — zero invented metrics or fake users), What we learned, and What's next (owner deploy, video, Cloudflare Email Routing wiring).
2. **`docs/submission/demo-script.md`**:
   - Strict `< 3:00` storyboard (`2:40` total / 160 seconds) split into exact timed beats:
     - `0:00–0:15` (15s): Hook — the AWS builder firehose & Google Reader resurrection problem.
     - `0:15–0:45` (30s): Live 3-pane Feed + untouched deterministic 4D signal score (`Why this score` breakdown + Signal Radar).
     - `0:45–1:15` (30s): Ask today's feeds (`POST /api/ask` cited answer + abstention safety).
     - `1:15–1:45` (30s): Live in-browser semantic search (`all-MiniLM-L6-v2` Web Worker + `0.6*semantic + 0.4*keyword` badges + offline caching).
     - `1:45–2:05` (20s): Audio Daily Briefing (`speechSynthesis` playback + persistent TopBar mini player).
     - `2:05–2:25` (20s): Newsletter bridge (`Newsletter` modal -> create unguessable feed -> paste AWS newsletter email -> 4D score + `/rss/:feedId`).
     - `2:25–2:40` (15s): Close with Kiro `.zip` export + live URL overlay (`TBD` until owner deploy).
   - Includes exact on-screen visual actions + spoken narration (~130–145 words/minute pace) so recording stays smoothly under 180 seconds.
3. **`README.md` update**:
   - Updates feature overview, stack/architecture table (adding `postal-mime`, `@huggingface/transformers` browser worker, `promptfoo` evals, `defuddle` extraction, `workers/newsletter/` sibling worker), Quickstart/Evals commands, link to `docs/deployment.md`, and `Live URL: TBD (pending owner manual deploy via .github/workflows/deploy.yml)`.

## Out of Scope
- Recording the video file itself.
- Submitting the Devpost form or publishing to Cloudflare.
