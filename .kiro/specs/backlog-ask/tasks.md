# Tasks

- [x] Read provider/retrieval/UI code and approved owner decisions; fetch/rebase origin/main.
- [x] Write dedicated requirements/design before implementation.
- [x] Implement pure retrieval/citation policies with deterministic tests.
- [x] Add shared answer fallback helper without changing summary contracts.
- [x] Implement validated API and buffered NDJSON source/answer/done contract.
- [x] Build independent AskPanel and client stream reader without App/TopBar/storage writes.
- [ ] Release/rebase A's shared UI paths; integrate TopBar/CommandPalette panel entry points.
- [ ] Verify types/tests/lint/build, built Worker and rendered integrated UI.
- [ ] Credential-backed manual answer/citation QA (blocked: no provider credentials).
- [ ] Coordinator review, one complete feature commit and serialized delivery (no partial commit).

Checkpoint after rebasing onto origin/main e871977 and coordinator's memory
clearance: both TypeScript checks passed; full suite passed 72/72; lint passed
with the existing three Fast Refresh warnings; build passed with existing bundle
warnings; built Worker Ask/A2A/API/MCP subset passed 30/30; diff whitespace check
passed. The earlier exit-137 run is superseded, not counted as a pass.

Built Worker curl with no configured providers returned honest 503 for a valid
question and 400 for whitespace-only question. Chromium inspected the actual
independent panel, not App integration: labeled form, disabled empty submit,
actual no-provider error, Close/reopen and Escape dismissal, 390px narrow layout
and 2x screenshots. No browser runtime errors were reported. Screenshots:
`.amp/in/artifacts/ask-independent-no-provider.png` and
`.amp/in/artifacts/ask-independent-narrow.png`. Modern-web forms, accessibility
and security guidance shaped these controls. No provider-success or pending Stop
UI QA claim; those and integrated App/TopBar verification remain outstanding.

Owned services `lane-c-ask-dev` (8914), `lane-c-a2a` (8913) and browser session
`lane-c-ask` are stopped/closed after verification to release memory. All Ask
changes remain uncommitted pending shared UI ownership release and acceptance.
A2A 2158625 is unchanged. No provider credentials, paid calls, deployments or
pushes were used.
