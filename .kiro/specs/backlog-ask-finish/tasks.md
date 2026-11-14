# Finish Ask tasks

- [x] Record requirements and design before implementation.
- [x] Integrate both entry points and progressive validated response rendering.
- [x] Test fragmented stream boundaries, callback ordering and error handling; exercise mounted App manually in Chromium with clearly labeled fixtures.
- [x] Verify types, lint, tests, build and rendered interactions. Mixed worktree run: 81 tests passed; three existing lint warnings. Chromium covered both launch points, blank submit, Escape, Close, Stop, 408, 503, abstention and a fixture citation.
- [x] Real Gemini QA was not run: no provider credentials are configured. No generated-answer grounding or quality claim is made.
- [ ] Review and deliver Ask separately without deploying.

The server validates the complete answer before emitting frames; progressive display is transport framing, not live model-token streaming. Automated mounted-browser regression coverage remains outstanding; the integrated UI check above was manual.
