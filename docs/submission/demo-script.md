# Demo Video Script — Resurrected Reader (2:40 / 160s)

> **Target runtime:** `2 minutes 40 seconds` (`160s`, strictly `< 3:00`).
> **Screen resolution:** 1440×900 desktop browser, clean Vercel monochrome light mode, DevTools console closed (verified clean beforehand).
> **Owner setup before recording:** Confirm live deployed `*.workers.dev` URL (or local `npm run preview` during dry-run) and optionally configure `GEMINI_API_KEY` on the Worker if demonstrating live AI Ask/Summarize.

---

### Beat 1 — Hook (`0:00 – 0:15` · 15s)
- **Visual:** Start on the live 3-pane Resurrected Reader home view (`/`). Briefly flash the left Subscriptions rail, center Signal-ranked timeline, and right Reader pane, then press `j` twice so the active indicator glides down rows.
- **Narration:**
  > "Google Reader died in 2013, leaving developers with chronological tabs and noisy newsletters. **Resurrected Reader** brings Reader back as an AI reading radar for AWS builders — reading is not the job; shipping Kiro tasks is."

### Beat 2 — Live Feed + Deterministic 4D Signal Score (`0:15 – 0:45` · 30s)
- **Visual:** Click an AWS News / AWS Machine Learning item (`score >= 70`). Click its score pill to open the **Why this score** popover showing **Relevance (42%)**, **Recency (24%)**, **Authority (18%)**, and **Novelty (16%)** with matched cues, then briefly click **Signal Radar** (`/radar`) to show the Recharts histogram and 4D spider chart.
- **Narration:**
  > "Live RSS feeds — AWS News, AWS Machine Learning, and Hacker News — plus Community Pulse load directly through our Hono Cloudflare Worker. Every item gets a `0` to `100` score that is **100% deterministic**, never an opaque LLM guess: click any badge to inspect the exact Relevance, Recency, Authority, and Novelty math."

### Beat 3 — Grounded Ask with Citations (`0:45 – 1:15` · 30s)
- **Visual:** Press `Cmd/Ctrl+K` (or click **Ask** in `TopBar`) to open `AskPanel`. Ask: *"What Amazon Bedrock or agent announcements are in today's feeds?"*. Highlight the streamed answer with inline `[1]` source citations, click a citation to jump straight to that item, and note the strict abstention guard (`"not in today's feeds"` for off-topic questions).
- **Narration:**
  > "When you want synthesis across the day's firehose, **Ask** streams answers strictly grounded in today's live feeds with clickable citations — and if the topic isn't in your feeds, our citation policy refuses to hallucinate and abstains cleanly."

### Beat 4 — Live Semantic Search (`1:15 – 1:45` · 30s)
- **Visual:** Press `/` to focus the `TopBar` search input. Verify the Sparkles semantic toggle is active, type `serverless containers deployment`, point out the inline `In-browser semantic · all-MiniLM-L6-v2 · 0.6/0.4` status bar and `semantic match 0.xx` chips on semantically close AWS ECS/Lambda results.
- **Narration:**
  > "Press slash to search by meaning, not just exact keywords. Resurrected Reader runs quantized `all-MiniLM-L6-v2` locally inside a Web Worker with an IndexedDB vector cache, blending cosine similarity and keyword rank — zero external keys needed."

### Beat 5 — Daily Briefing Audio (`1:45 – 2:05` · 20s)
- **Visual:** Click **Briefing** in `TopBar` (`/briefing`) showing the top 5 high-signal items. Click **Listen to briefing** to start Web Speech API playback; show the live playback indicator (`Speaking 1/5` + pause/stop controls) in the `TopBar` while navigating back to `/`.
- **Narration:**
  > "Switch to **Daily Briefing** for the top five high-signal reads of the day, and hit **Listen** to stream them hands-free through the browser's Web Speech API while you triage."

### Beat 6 — Newsletter-to-Feed Bridge (`2:05 – 2:25` · 20s)
- **Visual:** Click the **Mail** icon in the Subscriptions header to open `NewsletterModal`. Create a feed (`AWS Release Weekly`), highlight the unguessable `/rss/:feedId` path and decoupled `noun.noun.NN@...` inbound address, paste a raw `.eml` / RFC 822 AWS newsletter, click **Import email into feed**, show it scored in the timeline, and open `/rss/:feedId` in a quick tab showing real RSS XML.
- **Narration:**
  > "Engineering newsletters shouldn't rot in your inbox. Our **Newsletter Bridge** generates an unguessable RSS/Atom/JSON feed decoupled from its inbound address — import raw `.eml` messages immediately or wire our isolated sibling Cloudflare Email Worker, and entries flow right into scoring and AI summaries."

### Beat 7 — Kiro Task Export + Close (`2:25 – 2:40` · 15s)
- **Visual:** Click **→ Kiro task** (`e`) on the imported or top AWS item, flip quickly through `tasks.md`, `requirements.md`, `design.md`, and the Mermaid pipeline tab, click **Download .zip**, and pull back to the live app URL banner.
- **Narration:**
  > "Finally, press `e` on any high-signal article or newsletter to export a ready-to-drop `.kiro/specs/` `.zip` bundle and start building immediately. Try **Resurrected Reader** live at `<LIVE_WORKERS_URL>` — thank you!"

---

### Timing Check
- `15s + 30s + 30s + 30s + 20s + 20s + 15s = 160 seconds (2:40)` — `20s` buffer under the 3-minute limit.
