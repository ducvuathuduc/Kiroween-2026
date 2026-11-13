# Resurrected Reader 👻

**Google Reader, back from the dead — as an AI reading radar for AWS builders.**

Kiroween 2026 · Category: Resurrection · Solo entry by Huỳnh Diệu Thành (VTech Studio)

Reading is not the job. The radar reads everything, scores every item 0–100 for signal, and turns the reads that matter into **Kiro tasks** — so reading becomes shipping.

## Quickstart

```sh
npm install
npm run dev      # local dev server
npm run build    # typecheck + production build → dist/
npm run preview  # serve the production build
npx tsc --noEmit # typecheck only
npm run lint     # oxlint
```

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React 19 + Vite 8 + TypeScript 7 (strict) | Exactly what Google AI Studio Build generates |
| Styling & UI | Tailwind CSS v4 + `shadcn/ui` + `lucide-react` | Monochrome Vercel Geist theme tokens in `src/index.css`, Radix primitives in `src/components/ui/` |
| Typography | `@fontsource-variable/geist` + `@fontsource-variable/geist-mono` | Self-hosted Geist Sans and Geist Mono variable fonts |
| Navigation & Motion | `@ui-sdk/react` (`Listbox`) + `motion` | Roving focus + arrow-key list navigation (`definePrimitive`), 160ms pane/modal transitions |
| Data | RSS/Atom via CORS proxy, parsed in-browser | No backend, no keys, no cost in v1 |
| Security | Native `Sanitizer` API + `dompurify` fallback | Sanitizes untrusted RSS HTML before rendering excerpts |
| Dates | `date-fns` | Clean relative timestamps and refresh clock formatting |
| State | React + localStorage | Feeds, read/saved persist per browser |
| Specs | Spec Kit + Kiro | `.specify/` and `.kiro/` at the repo root |

## Live feeds (verified)

- AWS News Blog — `aws.amazon.com/blogs/aws/feed/`
- AWS Machine Learning Blog — `aws.amazon.com/blogs/machine-learning/feed/`
- Hacker News — `hnrss.org/frontpage`

## How it works

1. **Ingest** — feeds fetched through `api.allorigins.win`, parsed with `DOMParser`, and sanitized via native `setHTML()` / `dompurify` before rendering rich excerpts. A failing feed shows inline; the rest keep working.
2. **Score** — deterministic 0–100: keywords (kiro +25, aws +15, agent/agentic +20, llm/ai coding +15, startup +10, security +10) + recency (today +15, this week +8). Never labeled "AI".
3. **Triage** — sort by score or newest, filters All / High ≥70 / Unread / Saved, search (`/`), keyboard `↑`/`↓` (roving focus), `j`/`k`/`s`/`r`.
4. **Act** — "→ Kiro task" opens `KiroTaskModal` (glass `Dialog`) to preview the generated Markdown spec (Goal + acceptance criteria) and copy it to the clipboard.

## Development workflow

- **Spec Kit:** `/speckit-constitution` → `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` → `/speckit-converge` (commands in `.gemini/commands/`).
- **Kiro:** steering + specs + hooks live in `.kiro/` — read them before changing behavior.
- **Web best practices:** before writing UI/CSS/client JS, consult `docs/modern-web-guidance/` (Google Chrome, vendored).
- **Rules:** the constitution (`.specify/memory/constitution.md`) wins over agent defaults. Full system description: `docs/resurrected-reader-system.md`. Shared agent context: `AGENTS.md`.

## Deployment

Static site — `npm run build`, serve `dist/` anywhere (Vercel / Netlify / GitHub Pages / Cloudflare Pages).

## License

MIT — see `LICENSE`.
