# Backlog #2 — Audio Daily Briefing

Owner-approved scope: native browser `speechSynthesis` only — no Kokoro, no Piper, and no new npm dependencies. Daily Briefing reads the top 5 selected high-signal headlines and their 1-line TL;DRs aloud on-device, with a persistent mini player in the top bar while navigating across views.

- Wrap Web Speech behind a single replaceable `SpeechEngine` contract in `src/lib/tts.ts`, exposing `isSpeechSupported()`, `speak(text, { engine, voiceURI, rate })`, `stop()`, `listVoices()`, `subscribeVoices()`, `chunkSentences(text)`, `buildBriefingUtterances(items)`, and `createBriefingPlayer(engine?)`.
- Build the utterance queue once from the current `DailyBriefingItem[]` snapshot when Play is pressed; never re-fetch feeds or regenerate summaries per sentence.
- Chunk long text deterministically into bounded sentences without splitting abbreviations (e.g. `Dr.`, `e.g.`, `U.S.`) or decimals, and skip empty/whitespace chunks.
- Enforce an explicit queue state machine (`idle` / `speaking` / `paused`) with `play`, `pause`, `resume`, and `stop`. `stop()` cancels all queued utterances, and a monotonic generation token ensures stale `onEnd`/`onError` callbacks from rapid Stop/Play clicks never overlap or advance the new run.
- Handle asynchronous `voiceschanged` events cleanly because browsers often return an empty voice list on initial load, and guard all `window`/`speechSynthesis` access so unit tests run cleanly in Node.
- Persist `audioVoiceURI` (`string | null`, default `null`) and `audioRate` (`number`, default `1`, clamped to `0.5`–`2`) inside `ReaderSettings` in `src/lib/storage.ts`.
- Provide Play, Pause, and Stop controls, native labeled voice `<select>`, native labeled speed `<input type="range">` (`0.5`–`2`), active-item visual + `aria-current` highlight (`"Đang đọc"` badge + ring/border), `aria-live="polite"` status announcements, and a disabled Play state with inline status when speech synthesis is unavailable.
- Add an optional mini player in `TopBar` (`Play/Pause`, `item x/5`, truncated title, `Stop`) so playback stays controllable across views without breaking standalone `TopBar` usage.
- Verify deterministic sentence chunking and queue state transitions in `tests/tts.test.ts` using a stubbed `SpeechEngine` only (no real `speechSynthesis` or audio output in automated tests).