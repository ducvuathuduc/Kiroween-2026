# Tasks — Backlog #8 Promptfoo Eval Harness

- [x] Read `.github/workflows/evals.yml`, `server/ai.ts`, `src/lib/scoring.ts`, `tests/scoring.test.ts`, and verify promptfoo provider/assertion schema.
- [x] Create `.kiro/specs/backlog-evals/{requirements.md, design.md, tasks.md}` before writing code.
- [x] Install `promptfoo` as a `devDependency` and ensure `package-lock.json` is up to date for `.github/workflows/evals.yml`.
- [x] Extract `SUMMARY_SYSTEM_PROMPT` and `buildSummaryPrompt` into `server/summaryPrompt.ts` and import it in `server/ai.ts`.
- [x] Create `evals/golden/summaries.json` (12+ real items) and `evals/golden/scoring.json` (mirroring `tests/scoring.test.ts`).
- [x] Create deterministic validators/providers (`evals/validators.mjs`, `evals/providers/summaryFixtureProvider.mjs`, `evals/providers/scoringProvider.mjs`) and `evals/prompts/summaryPrompt.mjs`.
- [x] Create `evals/promptfoo.yaml` (deterministic CI gate) and `evals/promptfoo.judge.yaml` (advisory LLM judge).
- [x] Extend `.github/workflows/evals.yml` deterministic job to run `evals/promptfoo.yaml`.
- [x] Verify `npx promptfoo eval --config evals/promptfoo.yaml --no-share`, prove deliberately hallucinated summary fails non-zero, test advisory judge (or document honest `NOT RUN` if key/quota unavailable), and run full build/typecheck/lint/test/Worker bundle checks.
