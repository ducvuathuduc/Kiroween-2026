# Design — Deploy Readiness (Cloudflare Workers + Static Assets)

## Architecture & Verification Plan
- **Build Artifact Contract**: `npm run build` executes `tsc -b && vite build` using `@cloudflare/vite-plugin`, outputting `dist/worker/wrangler.json`, `dist/worker/index.js`, and `dist/client/` static assets.
- **Bundle Size & Isolation Gates**:
  - Verify `dist/` contains zero files exceeding Cloudflare's `25 MiB` static asset limit (`find dist -type f -size +25M` returns empty).
  - Verify `dist/worker/` contains zero references to `@huggingface/transformers`, `onnxruntime`, `promptfoo`, or `evals/` (`grep -rnE '@huggingface/transformers|promptfoo|onnxruntime' dist/worker` returns zero matches).
- **Runbook (`docs/deployment.md`)**:
  1. **Pre-flight & Push**: Verify `tsc` (app + node), `oxlint`, `npx tsx --test tests/*.test.ts`, `npm run build`, and `promptfoo eval --config evals/promptfoo.yaml`, then push to `main`.
  2. **Secrets Configuration**: Add `CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit + Account Settings:Read) and `CLOUDFLARE_ACCOUNT_ID` under `https://github.com/ducvuathuduc/Kiroween-2026/settings/secrets/actions`, plus optional AI provider secrets (`GEMINI_API_KEY`, etc.) on the Cloudflare Worker dashboard (never in `VITE_*` or Git).
  3. **Manual Trigger**: GitHub → **Actions** → **Deploy** (`.github/workflows/deploy.yml`) → **Run workflow** (`workflow_dispatch` on `main`).
  4. **Expected Live URL**: Confirmed from Wrangler's deploy output in the Actions log (`https://resurrected-reader.<account-subdomain>.workers.dev` or owner custom domain) — never hardcoded or guessed before a real run.
  5. **Post-Deploy Smoke Checklist**: Verify HTTP 200 and live DOM/API/XML payloads across `/`, `/api/health`, `/api/providers`, `/api/rss`, `/mcp`, `/.well-known/agent-card.json`, newsletter `/rss/:feedId`, Summarize, Ask, and PWA offline reload.
  6. **Rollback**: Re-run the manual **Deploy** workflow targeting the previous known-good commit/tag, or roll back Worker versions in Cloudflare Dashboard → Workers & Pages → `resurrected-reader` → Deployments.
  7. **Workflow Audit**: Compare every step, secret, and command in `.github/workflows/deploy.yml` against `docs/deployment.md` and report any mismatch (for example optional `workers/newsletter/` deployment and runtime Worker AI secrets vs CI deploy secrets).

## Out of Scope
- Executing `wrangler deploy` from this sandbox.
- Modifying DNS or Cloudflare account resources.
- Fabricating a production `workers.dev` URL before deployment.
