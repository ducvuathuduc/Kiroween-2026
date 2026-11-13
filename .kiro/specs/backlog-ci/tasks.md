# Backlog CI/CD — Tasks

- [x] Inspect existing Verify workflow, lockfile engines, Hono build config, and
  deterministic test coverage; confirm owner approval of Node22.12+.
- [x] Verify upstream checkout/setup-node v4 tag SHAs and write dedicated specs.
- [x] Replace Verify with CI and add manual-only Deploy plus honest Evals workflow.
- [x] Reconcile original continuous-verification requirement/design.
- [x] Validate YAML/Actions syntax, event boundaries, secret isolation, and gate parity.
- [x] Run full repository gates and deterministic eval smoke under Node22.12+.
- [x] Rebase latest origin/main, inspect diff, and commit this feature only.
- [ ] Coordinator inspects/pushes; hosted CI and any deployment remain separate evidence.

## Observed local evidence (2026-11-13)

- Actual Node v22.23.5: npm ci installed 446 packages; both typechecks exit 0;
  lint exit 0 (three existing Fast Refresh warnings); full tests 59/59 pass;
  build exit 0 (existing chunk-size/dynamic-import warnings); scoring/radar 8/8
  pass; Wrangler --version reports 4.161.0; built Worker config exists.
- Checksum-verified actionlint 1.7.12 reports no workflow errors. Independent
  YAML/structure assertions confirm manual-only deployment, CI/Deploy gate
  parity, pinned actions, no legacy Verify, and no secrets in push eval/CI jobs.
- Executed only prerequisite shell steps with deliberately empty credentials:
  nightly writes four NOT RUN reasons and ready=false; Deploy fails exit 1 and
  names both required secrets without their values. No deploy/model call ran.
- Initial nested npx toolchain wrapper failed with npm EUSAGE after successful
  npm ci; resolved by invoking checks with the installed Node22 binary on PATH.
  This was local command-wrapper behavior, not a repository gate failure.
- Rebased without conflicts onto origin/main 2158625 (A2A), then repeated npm ci,
  both typechecks, lint, full tests (63/63 pass, zero skipped), build, deterministic
  eval tests (8/8 pass), and actionlint under Node v22.23.5; all exit 0.
  No manifest, runtime, frontend, or other lane files changed in this commit.
- Feature #8 summary/rubric checks, hosted Actions, and deployment remain NOT RUN.
