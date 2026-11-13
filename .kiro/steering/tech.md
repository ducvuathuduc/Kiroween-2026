---
inclusion: always
---

# Resurrected Reader — Tech

## Stack
- React + Vite + TypeScript (AI Studio Build default), Tailwind CSS.
- Hono `server.ts` runs on Cloudflare Workers + Static Assets, with server-only AI SDK provider credentials optional for AI features. No database or keys are required for RSS and deterministic scoring.
- RSS uses the same-origin `/api/rss` proxy, with rss2json and allorigins fallbacks. MCP `/mcp` uses the default feed catalog and the same parsers/scoring; it never returns offline sample items.
- `npm run dev` uses Vite with the Cloudflare plugin; `npm run build` builds Worker + client assets; `npm run start` runs the built app locally through Wrangler. Deployment requires explicit owner approval.
- State persisted in localStorage (feeds, read/saved).

## Verified live feeds
- https://aws.amazon.com/blogs/aws/feed/
- https://aws.amazon.com/blogs/machine-learning/feed/
- https://hnrss.org/frontpage
- Kiro blog has no RSS (returns HTML) — do not use. AWS What's New /feed/ returns empty — do not use.

## Rules
- Deterministic signal scoring only. Never label a deterministic score as "AI".
- Sample data is an offline fallback only, clearly labeled as sample.
- No secrets in the repo. No lorem ipsum. Every button does something real.
- TypeScript strict; validate external data at the boundary.
