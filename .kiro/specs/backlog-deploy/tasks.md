# Tasks — Backlog #11 Deploy Readiness

- [x] Run `npm run build` and verify `dist/worker/wrangler.json`, zero files > 25 MiB in `dist/`, and zero `@huggingface/transformers` / `promptfoo` / `evals/` code in `dist/worker/`.
- [x] Audit `.github/workflows/deploy.yml` for Node version, build/test gates, secret names (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`), and `wrangler deploy` flags.
- [x] Write `docs/deployment.md` runbook covering push, Actions manual trigger, repository secret URL/names, post-deploy URL confirmation, smoke checklist, rollback steps, and workflow parity notes.
