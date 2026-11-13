# Backlog CI/CD — Design

- Keep verification commands explicit in CI and Deploy so manual deployment
  cannot bypass any existing gate. Use Node `22.x` (currently >=22.12) and npm
  caching from setup-node v4. Pin both actions to verified v4.4.0 tag SHAs.
- Give workflows contents-read only and checkout with persist-credentials false.
  CI has no deployment or model secrets. Deploy exposes Cloudflare credentials
  only to its final prerequisite check/deploy steps, after a successful build.
  Serialize manual deployments with a non-cancelling concurrency group.
- Keep the real Hono/Vite build output as the deployment source of truth:
  `dist/worker/wrangler.json`, not an invented Pages or alternative Worker config.
- Evals push/PR job runs existing `tests/scoring.test.ts` and
  `tests/radar.test.ts`; this checks the four dimensions, score thresholds,
  recency, AWS authority boundaries, and aggregation without external models.
  Its job summary distinguishes this coverage from pending summary checks.
- Schedule a separate advisory job daily at 03:17 UTC. Before installing anything,
  inspect prerequisites: repository variable `EVALS_LLM_JUDGE_ENABLED == true`,
  `evals/promptfoo.judge.yaml`, locked promptfoo dependency, and OPENAI_API_KEY
  repository secret. The separate judge config is a future feature #8 integration
  boundary; it must explicitly select a judge and carry the summary assertions.
  Missing prerequisites produce NOT RUN with reasons in the job summary. Once
  explicitly enabled and provisioned, use only the installed promptfoo binary
  (never npx auto-download), without sharing results. Job failure is advisory;
  always report its actual outcome. This change makes no model calls itself.
- Do not edit manifests, runtime, frontend, or other lanes' files. Reconcile the
  original CI requirement/design once to remove stale Node26/verify.yml wording.

## Verification

Actionlint validates YAML, event/expression syntax, and shell steps. Inspect event
sets and mandatory command parity independently. Run npm ci, both typechecks,
lint, all tests, build, and deterministic eval tests under actual Node22. Check
that the built Worker config exists. Do not dispatch Actions or invoke deploy.
Hosted Actions execution, Cloudflare credentials/deployment, and feature #8's
provider-backed eval acceptance remain unverified by local checks.
