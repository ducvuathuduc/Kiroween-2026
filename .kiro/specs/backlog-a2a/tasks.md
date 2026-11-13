# Tasks

- [x] Research published versioned wire and current official JS SDK README.
- [x] Record requirements/design from owner-approved #9 brief before coding.
- [x] Share read-only functions between MCP and A2A without contract changes.
- [x] Implement discovery, validated message/send and terminal task artifacts.
- [x] Route discovery/A2A Worker-first and document runnable curl/limitations.
- [x] Verify live parity, failures, all existing tests/types/lint/build.
- [x] Verify built Wrangler card/tasks and rendered Docs; capture screenshot.
- [x] Fetch/rebase origin/main, reverify, commit #9 only; coordinator reviews/pushes.

Verification: both TypeScript commands passed; 63/63 tests passed (59 existing
plus four A2A tests); lint passed with three pre-existing Fast Refresh warnings;
Worker/client build passed with existing bundle/dynamic-import warnings. Built
Wrangler API/MCP/A2A checks passed 21/21. Live default-feed artifacts equal MCP
and the shared UI selector JSON; all three skills and failure paths exercised.
Docs inspected in Chromium at 1280 and 390 CSS pixels, DPR 2, with no console
errors. HTML/accessibility guides shaped semantic sections and focusable code.

Do not start #7 or Ask until continued after coordinator integration/report.
#7 is externally blocked: coordinator verified rsshub.app HTTP 403/test-only
notice; no approved production source or global host-allowlist decision exists.
