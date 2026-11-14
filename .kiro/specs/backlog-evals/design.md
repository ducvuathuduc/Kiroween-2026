# Design — Promptfoo Eval Harness (`evals/`)

## Architecture

- **Shared Runtime Prompt (`server/summaryPrompt.ts`)**: Exports `SUMMARY_SYSTEM_PROMPT` and `buildSummaryPrompt({ title, feedTitle, link, content })`. Imported by `server/ai.ts` (`summarizeWithFallback` and `runSummarizeOnProvider` / `summarizeDirectWithGoogleGenAI`) and by `evals/` providers so prompt edits at runtime are automatically tested in evals.
- **Deterministic Validators (`evals/validators.mjs`)**: Pure ESM helpers exported for both `evals/promptfoo.yaml` / `evals/promptfoo.judge.yaml` assertions and unit tests:
  - `countSummaryWords(summary)`: Parses summary JSON (`{ tldr, takeaways, whyMatters }`) and counts words across all fields (`<= 100` word budget).
  - `findInventedUrls(outputText, allowedUrls)`: Extracts `http(s)://...` URLs from output and rejects any URL whose normalized host/origin+path is not present in the source article URL or excerpt text.
  - `validateDeterministicSummary(outputText, context)`: Returns `{ pass, score, reason }` combining JSON validity, `<= 100` words, and zero invented URLs.
- **Custom Deterministic Providers (`evals/providers/`)**:
  - `summaryFixtureProvider.mjs`: Exercises the real `buildSummaryPrompt` from `server/summaryPrompt.ts` and evaluates candidate summary outputs (from `vars.candidateSummary`) for each golden item in `evals/golden/summaries.json` so `evals/promptfoo.yaml` deterministically enforces `<= 100` words and no invented URLs offline without API keys.
  - `scoringProvider.mjs`: Invokes the real `explainScore()` / `scoreItem()` from `src/lib/scoring.ts` (loaded cleanly in Node) against `evals/golden/scoring.json` cases so promptfoo gates exact deterministic score assertions alongside `tests/scoring.test.ts`.
- **Promptfoo Configs**:
  - `evals/promptfoo.yaml`: Runs deterministic provider targets over `evals/golden/summaries.json` and `evals/golden/scoring.json` with `type: javascript` assertions. Exits `0` on pass and non-zero (`100`) on failure.
  - `evals/promptfoo.judge.yaml`: Uses `openai:gpt-4.1-mini` (matching `PROVIDER_CATALOG.openai.modelLabel` and `.github/workflows/evals.yml`'s `OPENAI_API_KEY`) with `file://evals/prompts/summaryPrompt.mjs` (importing `server/summaryPrompt.ts`) over `evals/golden/summaries.json`, enforcing deterministic guardrails plus `llm-rubric` assertions.
- **CI Integration (`.github/workflows/evals.yml`)**: Extends the `deterministic` job to execute `node_modules/.bin/promptfoo eval --config evals/promptfoo.yaml --no-share` after `npx tsx --test tests/scoring.test.ts tests/radar.test.ts tests/semanticSearch.test.ts` with telemetry/update/remote-generation disabled.

## Out of Scope / Explicitly Excluded
- No DeepEval, Ragas, Langfuse, or Opik.
- No second `.github/workflows/*.yml` eval workflow file.
- No committed API keys or secrets.

## Verified Reference APIs
- `promptfoo` custom JS provider (`id: file://...`, `async callApi(prompt, context)`) returning `{ output }`.
- `promptfoo` JavaScript assertions (`type: javascript`, returning boolean or `{ pass, score, reason }`) and `llm-rubric` assertions with `defaultTest.options.provider`.
- `promptfoo eval --config <path> --no-share` returning exit `0` on pass and `100` on failure.
