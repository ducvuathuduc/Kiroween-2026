---
inclusion: always
---

# Resurrected Reader — Tech

## Stack
- React + Vite + TypeScript (AI Studio Build default), Tailwind CSS.
- No backend in v1. No API keys required.
- RSS fetched client-side via `api.rss2json.com` (CORS-enabled JSON, primary) with `api.allorigins.win/raw?url=` and direct CORS `fetch` + `DOMParser` fallbacks.
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
