# Backlog #9 — Agent Card and stateless task stub

Owner-approved scope: expose discovery and synchronous JSON-RPC `message/send`
tasks using native Hono/fetch, not an SDK or invented `{skill:...}` transport.

- Publish `/.well-known/agent-card.json` with the request-origin endpoint,
  three skills, accurate capabilities, and no obsolete `authentication` field.
- Pin the wire to published A2A **0.3.0**, because the explicitly requested
  `message/send`, `kind`, and lowercase task states are that version's wire.
  Current SDK main implements 1.0 (`SendMessage`, different shapes); do not
  silently mix versions or claim this stub implements latest/full A2A.
- `get_top_items`, `get_briefing`, and `export_kiro_task` reuse the exact MCP
  business functions. Preserve all eight MCP tools and their contracts.
- Input is one user Message containing one DataPart. Its application data is
  `{skill:"get_briefing"}`, `{skill:"get_top_items",limit?:1..50,minScore?:0..100}`,
  or `{skill:"export_kiro_task",id:"<live item ID>"}`. No natural-language routing.
- Each valid call creates a new Task, transitions submitted → working →
  completed/failed within that request, and returns only the terminal snapshot.
  Completed tasks contain one JSON DataPart artifact. Failures contain an agent
  status message, never fake articles, offline samples, or invented AI output.
- Invalid JSON/envelopes/params and unsupported methods return JSON-RPC errors.
  Reject task/context continuation, push configuration, incompatible output
  modes and unsupported input parts. Bound request bytes to 192 KiB.
- Public, read-only, no credentials required (`security: []`); no AI provider
  calls, SSE, push, polling storage, multi-turn history, or deployment.
- Worker-first routing must cover the card and `/a2a` namespace through the
  built Static Assets runtime. Docs include runnable curl and limitations.
- Verify live briefing artifact equals the UI selector and MCP JSON for the
  same loaded items; verify all three skills, failed tasks, invalid inputs,
  existing regression gates, built Wrangler routing, and rendered Docs.

Version decision resolves conflicting shorthand in the brief in favor of its
verbatim `message/send` requirement. This is a deliberately limited task stub,
not a claim of full protocol compliance or unexecuted peer interoperability.
