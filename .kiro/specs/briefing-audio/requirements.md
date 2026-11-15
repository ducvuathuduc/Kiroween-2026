# Spoken-Script Daily Briefing + TTS — Requirements

## Overview

Resurrected Reader extends the existing Daily Briefing (`src/lib/briefing.ts`, `src/lib/tts.ts`, `src/components/DailyBriefingView.tsx`, `src/App.tsx`, `server.ts`) with a single-narrator spoken-script rewrite and `gemini-3.8-flash-lite-tts` voice synthesis cached as MP3 in Cloudflare R2, while keeping the existing Play/Pause/Stop and Voice/Speed controls unified and falling back honestly to the on-device Web Speech API when no TTS key is configured.

### Permitted & Prohibited Models

- **Permitted TTS model**: `gemini-3.8-flash-lite-tts` ONLY (via `@google/genai`).
- **Prohibited TTS models**: OpenAI `tts-1`, OpenAI `gpt-4o-mini-tts` (shutdown 6 Jan 2027), and Cloudflare MeloTTS (`@cf/myshell-ai/melotts`, deprecated 20 Nov 2026) SHALL NOT be referenced or invoked anywhere in the codebase.
- **Narration constraint**: Single-narrator script only. Multi-speaker or two-host dialogue (`gemini-3.8-flash-tts`, `multiSpeakerVoiceConfig`) SHALL NOT be used.

## Requirements (EARS)

1. **Single-Narrator Spoken-Script Rewrite (`src/lib/spokenScript.ts`, `POST /api/briefing/script`)**:
   - WHEN the system prepares the Top 5 Daily Briefing for audio playback, THE SYSTEM SHALL rewrite the 5 items into a cohesive single-narrator spoken script consisting of short broadcast sentences, spoken numbers and dates, zero raw URLs or markdown links, and a target budget of ~900–1,200 words (~6–8 minutes at 150 WPM) when sufficient article text/takeaways are provided, without inventing external facts or using two-host dialogue.
   - WHEN optional server Gemini text refinement is configured (`GEMINI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY`), THE SYSTEM MAY polish transitions with `gemini-4-hydrogen` and SHALL pass the result through deterministic speech sanitization (stripping any stray URLs, converting remaining dates/numbers/versions/scores into spoken words, enforcing single-narrator continuity, and falling back to the deterministic spoken-script builder on any error).

2. **Gemini 3.8 Flash-Lite TTS Synthesis (`POST /api/briefing/audio`)**:
   - WHEN a client posts briefing items or a spoken script and selects a supported single-speaker voice (`Kore`, `Puck`, `Charon`, `Fenrir`, `Zephyr`) to `POST /api/briefing/audio`, THE SYSTEM SHALL synthesize speech exclusively with `gemini-3.8-flash-lite-tts` via `@google/genai`, extract the 24kHz mono 16-bit PCM frames from the returned WAV payload(s), and encode a unified standard MP3 (`audio/mpeg`) stream.
   - WHEN an empty or invalid briefing payload is submitted, THE SYSTEM SHALL return HTTP `400` JSON `{ error }`.

3. **Cloudflare R2 MP3 Caching (`BRIEFING_AUDIO_BUCKET`, `POST /api/briefing/audio`, `GET /api/briefing/audio/:key`)**:
   - WHEN an R2 bucket binding (`BRIEFING_AUDIO_BUCKET`) is present, THE SYSTEM SHALL compute a deterministic content hash key (`briefing-audio/v1-<voice>-<sha256>.mp3`), check R2 before invoking `gemini-3.8-flash-lite-tts`, serve R2 cache hits directly with `Content-Type: audio/mpeg` and `X-Briefing-Cache: HIT`, and store newly encoded MP3 bytes in R2 (`httpMetadata: { contentType: 'audio/mpeg' }`) on cache miss (`X-Briefing-Cache: MISS`).
   - WHEN an R2 bucket binding is absent (local tests or unbound Worker), THE SYSTEM SHALL skip R2 gracefully (`X-Briefing-Cache: BYPASS`) without crashing.

4. **Honest No-Key Fallback & Existing Controls Integration (`DailyBriefingView.tsx`, `src/App.tsx`, `TopBar.tsx`)**:
   - WHEN `GEMINI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` is NOT configured on the server (`GET /api/briefing/audio/status` reports `available: false` or `POST /api/briefing/audio` returns HTTP `503`), THE SYSTEM SHALL NEVER fabricate audio or return fake MP3 bytes, SHALL keep the existing Web Speech API playback path active on the existing Play/Pause/Stop + Voice/Speed controls, and SHALL display the active mode honestly (e.g., `"On-device Web Speech API (Gemini TTS unconfigured)"`).
   - WHEN Gemini TTS IS available, THE SYSTEM SHALL wire the existing Play/Pause/Stop buttons, Speed slider, Voice selector (supporting Gemini prebuilt voices plus on-device Web Speech voices), and TopBar mini-player cleanly to the spoken-script + MP3 playback pipeline, and SHALL expose an expandable verbatim Spoken Script / Transcript disclosure (`<details>`) per `docs/modern-web-guidance/guides/accessibility/accessibility.md`.

5. **Preservation & Verification**:
   - THE SYSTEM SHALL NOT modify `workers/newsletter/`, `.github/workflows/deploy.yml`, or secret storage.
   - TypeScript (`npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.node.json --noEmit`), full unit tests (`npx tsx --test tests/*.test.ts`), linter (`npm run lint`), production build (`npm run build`), and headless Chromium preview verification SHALL pass with zero console errors.
