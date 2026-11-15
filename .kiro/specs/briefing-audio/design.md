# Spoken-Script Daily Briefing + TTS — Design

## 1. Architecture Overview

The feature builds directly onto `src/lib/tts.ts`, `src/components/DailyBriefingView.tsx`, `src/App.tsx`, `src/components/TopBar.tsx`, and `server.ts` without duplicating player controls or breaking offline Web Speech fallback:

```
DailyBriefingView / App.tsx
  ├─ On mount (online): GET /api/briefing/audio/status
  │     └─ returns { available, model: 'gemini-3.8-flash-lite-tts', r2Bound, voices } (never exposes keys)
  │
  ├─ Spoken Script Generation: src/lib/spokenScript.ts
  │     ├─ Single-narrator rewrite of Top 5 items (short sentences, spoken numbers/dates, zero URLs)
  │     ├─ Target ~900–1,200 words (~6–8 min @ 150 WPM) grounded strictly in item title/TL;DR/takeaways/whyMatters/text
  │     └─ Optional server polish via POST /api/briefing/script -> sanitizeSpokenScriptForTTS()
  │
  ├─ Play Action (using existing Play/Pause/Stop + Voice/Speed controls):
  │     ├─ If Gemini voice selected & server TTS available:
  │     │     └─ POST /api/briefing/audio ({ items / script, voice })
  │     │          ├─ R2 HIT  -> MP3 audio/mpeg (X-Briefing-Cache: HIT)
  │     │          ├─ R2 MISS -> chunk spoken script -> gemini-3.8-flash-lite-tts (WAV 24kHz mono)
  │     │          │              -> extract PCM -> encode unified MP3 (@breezystack/lamejs)
  │     │          │              -> R2.put(key, mp3) -> return MP3 (X-Briefing-Cache: MISS)
  │     │          └─ No key  -> HTTP 503 JSON -> client falls back cleanly to Web Speech API
  │     │
  │     └─ If no Gemini key OR on-device Web Speech voice selected:
  │           └─ Existing createBriefingPlayer() speaks the spoken script utterances via Web Speech API
  │              with honest mode badge & status label.
  │
  └─ Transcript Disclosure (accessibility.md §6):
        └─ Native <details><summary>Spoken script transcript (N words · ~M min)</summary>...</details>
```

## 2. Deterministic Spoken-Script Module (`src/lib/spokenScript.ts`)

Pure TypeScript module usable on both client and server (Zero DOM/Node dependencies):

- `TARGET_MIN_WORDS = 900`, `TARGET_MAX_WORDS = 1200`, `WORDS_PER_MINUTE = 150`.
- `stripUrlsAndLinks(text)`:
  - Converts markdown links `[anchor](https://...)` -> `anchor`.
  - Strips raw `http://...`, `https://...`, `ftp://...`, bare `www....` domains, email addresses, and leftover angle brackets/HTML tags.
- `integerToWords(n)` / `decimalToWords(raw)` / `yearToSpokenWords(year)`:
  - Converts integers `0..999_999_999` cleanly (`42` -> `"forty-two"`, `1200` -> `"one thousand two hundred"`, `2026` -> `"twenty twenty-six"` for 4-digit years `1900–2099`).
- `dateToSpokenWords(value)`:
  - Converts ISO dates (`YYYY-MM-DD` / ISO timestamps) into spoken calendar form (`"November fifteenth, twenty twenty-six"`), using ordinal day names (`first`..`thirty-first`).
- `normalizeTextForSpeech(text)`:
  - Removes URLs/links first so URL numbers (`https://example.com/2026/11/15`) are never read aloud.
  - Expands ISO dates (`2026-11-15`), scores (`92/100` -> `"ninety-two out of one hundred"`), percentages (`42.5%` -> `"forty-two point five percent"`), multipliers (`1.8x` -> `"one point eight times"`), semantic versions (`v2.4.1` -> `"version two point four point one"`), currency shorthand (`$5M` -> `"five million dollars"`), common units (`250ms` -> `"two hundred fifty milliseconds"`, `40KB` -> `"forty kilobytes"`), and remaining standalone numeric tokens.
  - Strips speaker-turn labels (`Alex:`, `Host 1:`, `Co-host:`) to strictly enforce single-narrator phrasing.
  - Wraps long sentences cleanly at clause/word boundaries so individual sentences stay crisp (`<= 24` words) for natural TTS pacing.
- `buildSpokenBriefingScript(items, options)`:
  - Inputs: up to 5 `SpokenBriefingInputItem` objects (`id`, `title`, `source`, `score`, `pubDate`, `tldr`, optional `takeaways`, `whyMatters`, `description`, `extractedText`, `scoreDimensions`).
  - Produces `SpokenBriefingScript`:
    - `script`: full single-narrator broadcast text (blank-line separated paragraphs for intro, Story 1..5, outro)
    - `segments`: array of `{ itemId, itemIndex, title, text }` so Web Speech fallback and progress tracking map cleanly back to the 5 cards in `DailyBriefingView`!
    - `wordCount`, `estimatedMinutes` (rounded to 1 decimal at 150 WPM), `withinTargetRange` (`900 <= wordCount <= 1200`), `dateSpoken`.
  - Uses deterministic per-story budgets (~190–215 words per story across 5 stories) pulling strictly from supplied `tldr`, `takeaways`, `whyMatters`, `extractedText`/`description`, and signal breakdown dimensions without inventing facts, capping gracefully at `<= 1,200` words on sentence boundaries.

## 3. Server TTS, PCM->MP3 Encoder, and R2 Caching (`server/briefingAudio.ts` + `server.ts`)

- **Model & Voices**:
  - `GEMINI_TTS_MODEL = 'gemini-3.8-flash-lite-tts'`
  - `GEMINI_TTS_VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'] as const`
  - Prohibited strings guard: no OpenAI `tts-1` / `gpt-4o-mini-tts` and no `melotts`.
- **WAV Parsing & Unified MP3 Encoding (`@breezystack/lamejs`)**:
  - Each `ai.models.generateContent({ model: 'gemini-3.8-flash-lite-tts', ... })` call returns WAV bytes (`audio/wav`, RIFF header, 24kHz mono 16-bit LE PCM).
  - `extractPcmFromWav(wavBytes)`: validates RIFF/WAVE header, locates the `fmt ` (extracting sample rate / channels / bitsPerSample) and `data` subchunks accurately, and returns `{ sampleRate, channels, pcm16: Int16Array }`.
  - `encodePcmToMp3(pcmChunks, sampleRate = 24000, kbps = 128)`: uses `Mp3Encoder` from `@breezystack/lamejs` across 1152-sample frames (inserting ~250ms silent gap between script chunks) and flushes to a contiguous `Uint8Array` of standard MPEG Layer III frames (`audio/mpeg`).
- **R2 Bucket Integration (`wrangler.jsonc` & `server.ts`)**:
  - Optional binding `BRIEFING_AUDIO_BUCKET?: R2BucketBinding` in Hono `Bindings` and `wrangler.jsonc` (configured safely only after verifying `vite build` / `@cloudflare/vite-plugin` compatibility).
  - Cache key: `briefing-audio/v1-${voice.toLowerCase()}-${sha256Hex.slice(0, 32)}.mp3`.
  - Routes in `server.ts`:
    1. `GET /api/briefing/audio/status`: returns `{ available: Boolean(getGeminiKey()), model: 'gemini-3.8-flash-lite-tts', r2Bound: Boolean(c.env?.BRIEFING_AUDIO_BUCKET), voices: GEMINI_TTS_VOICES }`.
    2. `POST /api/briefing/script`: validates `{ items, nowIso }`, optionally refines single-narrator transitions when Gemini key is set (via `gemini-4-hydrogen`), always runs `sanitizeSpokenScriptForTTS`, falls back cleanly to deterministic `buildSpokenBriefingScript`, returns `{ script, segments, wordCount, estimatedMinutes, withinTargetRange, mode: 'gemini' | 'deterministic' }`.
    3. `POST /api/briefing/audio`: validates `{ items?, script?, voice? }`, resolves spoken script, computes R2 cache key, checks R2 `get(key)` first (returning `audio/mpeg` + `X-Briefing-Cache: HIT` immediately if cached), returns `503` JSON `{ error, mode: 'unavailable', spokenScript, wordCount, estimatedMinutes }` if unconfigured (never fake MP3!), otherwise synthesizes chunks via `gemini-3.8-flash-lite-tts`, encodes MP3, stores in R2 `put(key, mp3Bytes, { httpMetadata: { contentType: 'audio/mpeg', cacheControl: 'public, max-age=86400' } })`, and returns `audio/mpeg` (`X-Briefing-Cache: MISS` or `BYPASS`).
    4. `GET /api/briefing/audio/:key`: serves an existing cached MP3 object from `BRIEFING_AUDIO_BUCKET` (`200 audio/mpeg` or `404 JSON`).

## 4. Client Playback & UI Integration (`src/lib/tts.ts`, `src/App.tsx`, `src/components/DailyBriefingView.tsx`)

- **Extend `DailyBriefingItem` cleanly** in `src/lib/tts.ts`:
  - Add optional fields (`takeaways?: string[]`, `whyMatters?: string`, `description?: string`, `pubDate?: string`) so existing callers and tests (`tests/tts.test.ts`) stay 100% compatible while `DailyBriefingView` passes full grounded item context for spoken-script synthesis.
- **Audio Engine Orchestration in `src/App.tsx`**:
  - On mount (online), fetch `/api/briefing/audio/status` -> `ttsStatus` (`{ available, model, r2Bound, voices }`).
  - Voice URI convention:
    - `'gemini:<VoiceName>'` (e.g. `'gemini:Kore'`) selects Gemini 3.8 Flash-Lite TTS MP3 playback when `ttsStatus.available` is true.
    - `''` or browser Web Speech `voiceURI` uses the existing `createBriefingPlayer()` (`window.speechSynthesis`).
  - When playing with Gemini TTS:
    - Uses `HTMLAudioElement` backed by a managed `Blob` URL (`URL.createObjectURL(mp3Blob)`, cleanly revoked on stop/replace/unmount).
    - Syncs `audioRate` (`audio.playbackRate = clampSpeechRate(rate)`), Play/Pause/Stop state (`'speaking' | 'paused' | 'idle'`), `TopBar` mini-player, and current segment estimation from `audio.currentTime / audio.duration`.
    - Shows `'loading'` / preparing feedback cleanly without breaking `BriefingPlaybackStatus` (`audioPreparing` boolean), and if `/api/briefing/audio` returns `503` or fails, automatically falls back to Web Speech playback of the spoken script segments with an honest mode/status notice!
- **UI & Guidance Compliance (`DailyBriefingView.tsx`)**:
  - Reuse the exact existing Audio Briefing player bar (Play/Pause/Stop buttons, `#briefing-voice-select`, `#briefing-rate-range`, live region, mode status line) — do NOT add a duplicate player bar.
  - Add honest mode badge/status (e.g., `gemini-3.8-flash-lite-tts · R2 cache HIT/MISS` vs `Web Speech API · Gemini TTS unconfigured`) and expandable `<details>` transcript viewer displaying the generated spoken script, word count, and estimated duration.
  - Modern-Web Guidance consulted:
    - `docs/modern-web-guidance/guides/accessibility/accessibility.md` (§6 Audio and video: `<details>` verbatim transcript for audio content; §8 Live regions: single `aria-live="polite"` status message).
    - `docs/modern-web-guidance/guides/html/html.md` (§5 `<details>`/`<summary>` native disclosure with `<summary>` as first child and no nested interactive controls inside `<summary>`).
    - `docs/modern-web-guidance/guides/ui-components/toolbar.md` (explicit `aria-pressed`, native `<button type="button">`, accessible names).
