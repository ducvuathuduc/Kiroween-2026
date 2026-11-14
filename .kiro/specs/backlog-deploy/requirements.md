# Backlog #11 — Deploy Readiness (Cloudflare Workers + Static Assets)

Owner-approved scope: prepare and verify release readiness cleanly without executing `wrangler deploy`, without modifying repo secrets or DNS, and without inventing any unconfirmed live URL.

## Requirements (EARS)

1. **Clean Release Build & Bundle Constraints**: Running `npm run build` SHALL produce `dist/worker/wrangler.json` and `dist/client/` with zero TypeScript or bundler errors. Every file inside `dist/worker/` and `dist/client/` SHALL remain strictly under Cloudflare Workers Static Assets' 25 MiB per-file limit, and the Worker bundle (`dist/worker/`) SHALL NOT contain `@huggingface/transformers`, `onnxruntime-web`, `promptfoo`, or `evals/` code.
2. **Exact Release Runbook (`docs/deployment.md`)**: The repository SHALL provide `docs/deployment.md` documenting the exact manual deployment workflow:
   - Pushing the verified commit to `main`.
   - Triggering `.github/workflows/deploy.yml` manually via GitHub → Actions → Deploy → Run workflow (`workflow_dispatch`).
   - Configuring required repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` at the exact GitHub repository Settings → Secrets and variables → Actions URL (`https://github.com/ducvuathuduc/Kiroween-2026/settings/secrets/actions`).
   - Explaining how Cloudflare determines the live `*.workers.dev` URL after the first successful run (never inventing a hardcoded unconfirmed URL).
   - Providing a concrete post-deploy smoke checklist (`/`, `/api/health`, `/api/providers`, `/api/rss`, `/mcp`, `/.well-known/agent-card.json`, `/rss/:feedId`, PWA offline reload).
   - Providing the exact rollback procedure (re-running `.github/workflows/deploy.yml` from the previous known-good commit or tag).
   - Explaining the optional, separate owner-approved sibling Worker (`workers/newsletter/wrangler.toml`) setup if inbound email routing is activated later.
3. **Workflow vs Runbook Parity Audit**: `.github/workflows/deploy.yml` SHALL be audited against `docs/deployment.md` (Node version, lockfile install, TypeScript/lint/test/build gates, secret names `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, `dist/worker/wrangler.json` check, and `npx wrangler deploy --config dist/worker/wrangler.json`). Any mismatch SHALL be fixed or explicitly reported.
4. **No Unauthorized Deploy or Fake URL**: Neither automated checks nor documentation SHALL trigger a live Cloudflare deploy from this sandbox or fabricate a production URL prior to an actual owner-triggered GitHub Actions Deploy run.

## Acceptance Criteria

- `npm run build` succeeds and generates `dist/worker/wrangler.json`.
- Zero files exceed 25 MiB in `dist/`; `dist/worker/` contains zero matches for `@huggingface/transformers`, `promptfoo`, or `evals/`.
- `docs/deployment.md` covers steps 1–6 accurately and matches `.github/workflows/deploy.yml` secret and command names verbatim.
