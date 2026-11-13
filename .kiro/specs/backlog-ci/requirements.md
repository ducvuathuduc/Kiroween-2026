# Backlog CI/CD — Requirements

## Scope and approval

The owner approved Node 22.12+ instead of Node 20: locked Wrangler 4.161.0
requires Node >=22.12.0 and AI SDK 7.0.172 requires Node >=22. No dependency
downgrades, deployment execution, repository settings changes, or paid model
calls are authorized during implementation.

## Acceptance criteria

1. Replace `verify.yml` with `ci.yml`, named CI, for pushes and pull requests to
   main. Use Node 22.x, npm caching, commit-pinned checkout/setup-node v4 actions,
   and read-only repository permissions.
2. CI must install locked dependencies with npm ci, run both application and
   server TypeScript checks, lint, `npx tsx --test tests/*.test.ts`, and the full
   Worker/client build. All checks are mandatory and failures propagate.
3. `deploy.yml`, named Deploy, has only workflow_dispatch. Repeat all CI gates
   before `npx wrangler deploy --config dist/worker/wrangler.json`. Require
   CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID repository secrets; report
   missing names clearly without logging values. Never deploy during validation.
4. `evals.yml` gates main pushes/PRs with existing deterministic scoring tests,
   without model credentials or paid requests. Nightly LLM judging is advisory,
   never a per-commit gate.
5. Feature #8 is not present. Summary assertions and real LLM-rubric checks must
   be explicitly reported NOT RUN, pending that feature, not disguised as passing
   scoring tests. Nightly execution requires a dedicated judge config, a locally
   locked promptfoo binary, a real judge credential, and explicit quota opt-in.
6. Ship all three workflows in one feature commit, with no duplicate legacy
   Verify workflow. Validate Actions syntax and all repository gates on actual
   Node 22.12+, then rebase latest origin/main before delivery to the coordinator.
