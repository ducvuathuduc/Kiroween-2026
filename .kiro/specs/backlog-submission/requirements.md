# Backlog #12 — Kiroween 2026 Submission Drafts & README Sync

Owner-approved scope: produce truthful, judge-ready submission drafts (`docs/submission/devpost-draft.md`, `docs/submission/demo-script.md`) and update `README.md` with accurate implemented features and deploy instructions while marking unexecuted owner steps (`live URL`, `video recording`, `Devpost submit`) honestly.

## Requirements (EARS)

1. **Honest Devpost Write-Up (`docs/submission/devpost-draft.md`)**: `docs/submission/devpost-draft.md` SHALL include:
   - Project title, concise tagline, and one-paragraph pitch.
   - Complete "What it does" breakdown covering all 10 implemented backlog features cleanly and honestly (only capabilities verified in the codebase — zero invented metrics, zero fake users).
   - Detailed "How we built it with Kiro" section listing every `.kiro/specs/*` directory by exact name and explaining the spec-driven `requirements.md → design.md → tasks.md → implement → verify` workflow, steering rules (`.kiro/steering/`), save hooks (`.kiro/hooks/`), and MCP tooling (`.kiro/settings/mcp.json`).
   - Inspiration, What we learned, and What's next (including owner-activated Cloudflare Email Routing on `workers/newsletter/`).
2. **Under-3-Minute Demo Shot List (`docs/submission/demo-script.md`)**: `docs/submission/demo-script.md` SHALL specify exact timestamps and spoken narration lines totaling `<= 180` seconds across all seven required beats:
   - (1) Hook: the problem (`0:00–0:15`, 15s)
   - (2) Feed + deterministic 4D score (`0:15–0:45`, 30s)
   - (3) Ask today's feeds with citations (`0:45–1:15`, 30s)
   - (4) In-browser semantic search live (`1:15–1:45`, 30s)
   - (5) Audio briefing (`1:45–2:05`, 20s)
   - (6) Newsletter bridge (`2:05–2:25`, 20s)
   - (7) Close + live URL (`2:25–2:40`, 15s — total 160s `<= 180s`, leaving 20s buffer).
3. **Updated `README.md`**: `README.md` SHALL accurately list all implemented features (including in-browser semantic search, promptfoo evals, and newsletter-to-feed bridge), local run/test/eval commands, link to `docs/deployment.md`, and keep live URL marked `TBD (confirmed after owner triggers Deploy workflow)`.
4. **Explicit Owner Action Boundary**: Submission deliverables SHALL clearly identify video recording, triggering `.github/workflows/deploy.yml`, DNS/Email Routing activation, and Devpost form submission as manual owner actions.

## Acceptance Criteria

- `docs/submission/devpost-draft.md` lists all `.kiro/specs/*` folders accurately with zero fabricated metrics or unimplemented features.
- `docs/submission/demo-script.md` covers all 7 shots in order with exact word-timed narration and total duration `<= 180s`.
- `README.md` accurately documents features, commands, deploy runbook link, and `TBD` live URL.
