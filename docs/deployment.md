# Deployment Runbook — Cloudflare Workers + Static Assets

Resurrected Reader runs as a Hono Server Worker (`dist/worker/wrangler.json`) paired with Vite static assets (`dist/client/`). Deployment is **manual-only** via `.github/workflows/deploy.yml` (`workflow_dispatch`) and requires the repository owner's explicit action.

## 1. Prerequisites & GitHub Secrets

Configure the two deployment secrets in the GitHub repository before running the Deploy workflow:

- **GitHub Actions Secrets page:** `https://github.com/ducvuathuduc/Kiroween-2026/settings/secrets/actions`
- **`CLOUDFLARE_API_TOKEN`**: Cloudflare API token scoped with **Workers Scripts: Edit** and **Account Settings: Read**.
- **`CLOUDFLARE_ACCOUNT_ID`**: Target Cloudflare account ID.

Optional server-side AI credentials (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION`) belong in **Cloudflare Worker runtime secrets** (`npx wrangler secret put <NAME> --config dist/worker/wrangler.json` or Cloudflare Dashboard -> Worker -> Settings -> Variables & Secrets), never in GitHub build variables or client `VITE_*` env vars. Without AI keys, live RSS feeds, deterministic 4D scoring, local semantic search, audio briefings, newsletter manual import, MCP, and A2A still work; AI summary/ask/judge routes return clean `503` notices instead of fabricating results.

## 2. Step-by-Step Manual Deploy

### Step 1 — Push to `main`
Ensure all verified local changes are committed and pushed to `main`. Wait for automated push/PR checks (`.github/workflows/ci.yml` and `.github/workflows/evals.yml`) to pass cleanly.

### Step 2 — Run the Manual Deploy Workflow
1. Open `https://github.com/ducvuathuduc/Kiroween-2026/actions/workflows/deploy.yml` (**Actions -> Deploy**).
2. Click **Run workflow**.
3. Keep branch **`main`** selected and click **Run workflow**.
4. Wait for all workflow steps to finish cleanly:
   - `npx tsc --noEmit` + `npx tsc -p tsconfig.node.json --noEmit`
   - `npm run lint` (`oxlint`)
   - `npx tsx --test tests/*.test.ts`
   - `npm run build` (`dist/worker/wrangler.json` + `dist/client/`)
   - Secret check (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`)
   - `npx wrangler deploy --config dist/worker/wrangler.json`

### Step 3 — Confirm the Live URL
Read the deployed URL directly from the **`Deploy built Hono Worker and static assets`** step output in GitHub Actions (typically `https://resurrected-reader.<account-subdomain>.workers.dev`). Do not assume a custom domain unless explicitly bound in Cloudflare Dashboard.

## 3. Post-Deploy Smoke Checklist

Verify against the confirmed live `BASE` URL:

```sh
BASE="https://<your-confirmed-workers-dev-url>"
curl -fsS "$BASE/" | head -n 5
curl -fsS "$BASE/api/health"
curl -fsS "$BASE/api/providers"
curl -fsS "$BASE/.well-known/agent-card.json"
curl -fsS "$BASE/api/rss?url=https%3A%2F%2Faws.amazon.com%2Fblogs%2Faws%2Ffeed%2F" | head -n 5
```

Interactive browser checks on `$BASE`:
1. Live feeds load (`AWS News Blog`, `AWS Machine Learning Blog`, `Hacker News`), Community Pulse populates, and items show deterministic `0–100` 4D score badges.
2. Search triggers in-browser semantic search (with keyword fallback) cleanly.
3. Newsletter modal creates an unguessable feed, imports a raw email into the timeline + `/rss/:feedId`, and deletes cleanly (`404` on `/rss/:feedId`).
4. `Daily Briefing` plays browser audio via Web Speech API and `→ Kiro task` downloads a `.zip` bundle.
5. `npx tsx --test tests/api.test.ts tests/mcp.test.ts` passes with `READER_TEST_URL="$BASE"`.

## 4. Workflow Audit & Parity Notes

- **Promptfoo deterministic gate:** `.github/workflows/deploy.yml` runs `tsc`, `oxlint`, `npx tsx --test tests/*.test.ts`, and `npm run build`, but does **not** invoke `evals/promptfoo.yaml`. Ensure `.github/workflows/evals.yml` is green on the target commit before triggering `Deploy`.
- **Bundle boundary checks:** Verify `dist/worker/` stays well under Cloudflare Workers' 25 MiB compressed/file limit and contains zero `@huggingface/transformers`, `promptfoo`, or `evals/` code (`@huggingface/transformers` runs client-side in `dist/client/` only; `promptfoo` is a devDependency).
- **Sibling newsletter Worker (`workers/newsletter/`):** `deploy.yml` deploys **only** the main Worker (`dist/worker/wrangler.json`) where manual `.eml`/raw-email newsletter import works out of the box via isolate routes. Production inbound email routing (`workers/newsletter/wrangler.toml`) requires the owner to provision `NEWSLETTER_KV`, configure domain MX/SPF/DKIM records, and enable Cloudflare Email Routing rules separately.

## 5. Rollback

If a deployment introduces a regression:

1. **Instant Cloudflare rollback:**
   ```sh
   npx wrangler deployments list --config dist/worker/wrangler.json
   npx wrangler rollback <VERSION_ID> --config dist/worker/wrangler.json
   ```
   Or rollback directly in Cloudflare Dashboard -> **Workers & Pages -> resurrected-reader -> Deployments**.
2. **Git rollback + re-deploy:** Revert the offending commit on `main`, push, and re-run **Actions -> Deploy** (`workflow_dispatch`).
