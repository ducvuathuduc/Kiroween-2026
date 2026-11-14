# Backlog #8 — Promptfoo Eval Harness

Owner-approved scope: `promptfoo` (devDependency only) wired to a single shared runtime summary prompt and the existing `.github/workflows/evals.yml` workflow. Do NOT use DeepEval, Ragas, Langfuse, or Opik, and do NOT create a second workflow file.

## Requirements (EARS)

1. **Single Shared Prompt Source**: The system SHALL extract the runtime summary system instruction and user prompt builder from `server/ai.ts` into a single shared module (`server/summaryPrompt.ts`) imported by both `server/ai.ts` and `evals/`, with zero prompt duplication.
2. **Curated Golden Datasets**: `evals/golden/summaries.json` SHALL contain 10–20 real AWS/Kiro/HN builder article fixtures (with source URLs and excerpts), and `evals/golden/scoring.json` SHALL mirror the deterministic scoring fixtures from `tests/scoring.test.ts` (high-signal AWS/Kiro recency, decay, invalid dates, official URL vs lookalike URL authority checks).
3. **Deterministic CI Gate (`evals/promptfoo.yaml`)**: `evals/promptfoo.yaml` SHALL run deterministically with zero LLM API calls and zero API keys required, verifying:
   - Summary guardrail assertions (`wordCount(tldr + takeaways + whyMatters) <= 100`, valid JSON structure, zero invented URLs not present in the source article/allowed link).
   - Golden scoring assertions verifying `scoreItem()` / `explainScore()` outputs match expected deterministic scores and bounds.
   - `npx promptfoo eval --config evals/promptfoo.yaml` SHALL exit `0` when all assertions pass and non-zero when any assertion fails (proven by verifying a deliberately hallucinated summary fails).
4. **Advisory LLM Judge (`evals/promptfoo.judge.yaml`)**: `evals/promptfoo.judge.yaml` SHALL evaluate the shared runtime summary prompt over `evals/golden/summaries.json` using deterministic guardrails plus `llm-rubric` assertions for factual faithfulness and builder usefulness, used strictly as an advisory nightly job (`continue-on-error: true`).
5. **Existing CI Workflow Extension**: `.github/workflows/evals.yml` SHALL extend its existing `deterministic` job to run `evals/promptfoo.yaml` on every push/PR to `main` and keep its existing `nightly-judge` job wired to `evals/promptfoo.judge.yaml` and `package-lock.json` without duplicating workflows.
6. **Worker Bundle Isolation**: Neither `promptfoo` nor `evals/` SHALL be imported by `server.ts`, `server/ai.ts`, or `src/*`, nor included in `dist/worker/`.
