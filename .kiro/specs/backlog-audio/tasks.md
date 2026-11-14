# Tasks

- [x] Read `AGENTS.md`, `package.json`, `src/lib/briefing.ts`, `src/lib/storage.ts`, `src/components/DailyBriefingView.tsx`, `src/components/TopBar.tsx`, `src/App.tsx`, `tests/briefing.test.ts`, `.kiro/specs/backlog-ask/*`, and modern-web accessibility/privacy guides.
- [ ] Create `.kiro/specs/backlog-audio/{requirements.md, design.md, tasks.md}` before writing code.
- [ ] Implement `src/lib/tts.ts` (`SpeechEngine`, native Web Speech adapter, `isSpeechSupported`, `speak`, `stop`, `listVoices`, `subscribeVoices`, `chunkSentences`, `buildBriefingUtterances`, `createBriefingPlayer` with generation token).
- [ ] Extend `ReaderSettings`, `DEFAULT_SETTINGS`, and `sanitizeSettings` in `src/lib/storage.ts` with `audioVoiceURI` and `audioRate` (clamped `0.5`–`2`).
- [ ] Wire audio controls, voice/speed inputs, `aria-live="polite"` status, unsupported guard, and active item highlight in `src/components/DailyBriefingView.tsx`.
- [ ] Add optional mini player (`Play/Pause`, `item x/5`, truncated title, `Stop`) to `src/components/TopBar.tsx` and lift shared player state in `src/App.tsx`.
- [ ] Add deterministic unit tests in `tests/tts.test.ts` using a stubbed `SpeechEngine`.
- [ ] Run `npx tsc --noEmit`, `npx tsc -p tsconfig.node.json --noEmit`, `npm run lint`, `npx tsx --test tests/*.test.ts`, and `npm run build`.
- [ ] Manual browser smoke check on Chromium / Safari / Firefox for device-dependent `voiceschanged` voice availability.