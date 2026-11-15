import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import app from '../server.ts'
import {
  buildSpokenBriefingScript,
  countSpokenWords,
  dateToSpokenWords,
  normalizeTextForSpeech,
  sanitizeSpokenScriptForTTS,
  type SpokenBriefingInputItem,
} from '../src/lib/spokenScript.ts'
import { buildBriefingUtterances } from '../src/lib/tts.ts'
import {
  buildBriefingCacheKey,
  encodeWavBuffersToMp3,
  extractPcmFromWav,
  GEMINI_TTS_MODEL,
  getBriefingTtsStatus,
  isValidBriefingCacheFilename,
  sanitizeGeminiVoice,
  synthesizeBriefingAudio,
  type R2BucketBinding,
  type R2ObjectBodyLike,
} from '../server/briefingAudio.ts'

function createSyntheticWavBuffer(durationMs = 120, sampleRate = 24000): Uint8Array {
  const numSamples = Math.floor((sampleRate * durationMs) / 1000)
  const dataSize = numSamples * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  bytes.set([0x52, 0x49, 0x46, 0x46], 0) // RIFF
  view.setUint32(4, 36 + dataSize, true)
  bytes.set([0x57, 0x41, 0x56, 0x45], 8) // WAVE
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12) // fmt 
  view.setUint32(16, 16, true) // PCM subchunk size
  view.setUint16(20, 1, true) // audioFormat = PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  bytes.set([0x64, 0x61, 0x74, 0x61], 36) // data
  view.setUint32(40, dataSize, true)

  for (let i = 0; i < numSamples; i += 1) {
    const sample = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000)
    view.setInt16(44 + i * 2, sample, true)
  }
  return bytes
}

function createMemoryR2Bucket(): {
  bucket: R2BucketBinding
  store: Map<string, { bytes: Uint8Array; contentType?: string; customMetadata?: Record<string, string> }>
} {
  const store = new Map<
    string,
    { bytes: Uint8Array; contentType?: string; customMetadata?: Record<string, string> }
  >()
  const bucket: R2BucketBinding = {
    async get(key: string): Promise<R2ObjectBodyLike | null> {
      const entry = store.get(key)
      if (!entry) return null
      return {
        arrayBuffer: async () =>
          entry.bytes.buffer.slice(
            entry.bytes.byteOffset,
            entry.bytes.byteOffset + entry.bytes.byteLength,
          ) as ArrayBuffer,
        httpMetadata: { contentType: entry.contentType },
        customMetadata: entry.customMetadata,
      }
    },
    async put(key, value, options) {
      const bytes =
        value instanceof Uint8Array
          ? value
          : typeof value === 'string'
            ? new TextEncoder().encode(value)
            : new Uint8Array(value)
      store.set(key, {
        bytes,
        contentType: options?.httpMetadata?.contentType,
        customMetadata: options?.customMetadata,
      })
    },
  }
  return { bucket, store }
}

function makeRichFiveStories(): SpokenBriefingInputItem[] {
  const topics = [
    [
      'Amazon Bedrock Agents add deterministic policy guardrails',
      'AWS News Blog',
      94,
      'Bedrock policy guardrails cut unexpected tool invocations by 42.5% in v2.4.0 production trials on 2026-11-15.',
    ],
    [
      'Cloudflare Workers AI standardizes BGE-M3 1024-dim vector indexing',
      'Cloudflare Changelog',
      90,
      'Workers teams combine Vectorize top-10 retrieval with reranking latency under 85ms across $2M workloads.',
    ],
    [
      'AWS Lambda SnapStart expands Python 3.13 cold-start pre-warming',
      'AWS Compute Blog',
      87,
      'Cold starts fall 3.4x for 512MB functions in 2026 production microservices without changing handler code.',
    ],
    [
      'Kiro IDE ships automated spec-to-test hooks for TypeScript teams',
      'Kiro Engineering',
      84,
      'Spec hooks validate EARS requirements before code generation and catch 78% of contract regressions.',
    ],
    [
      'OpenTelemetry Collector optimizes streaming traces on Graviton4 nodes',
      'CNCF Blog',
      81,
      'ARM64 fleet benchmarks show 35% lower memory overhead and 250ms faster tail sampling pipelines.',
    ],
  ] as const

  return topics.map(([title, source, score, lead], index) => {
    const detailedParagraph = [
      lead,
      `For teams running distributed workloads on https://aws.amazon.com/story-${index + 1}, [the release notes](https://example.com/docs/${index + 1}) detail strict IAM scoping, repeatable staging checks, and automated rollback triggers across three availability zones.`,
      `Field engineers tested throughput over 14 days with 1000 requests per second and observed predictable p99 latency under 120ms without manual tuning or extra sidecar containers.`,
      `Platform leads noted that migration scripts execute cleanly during rolling deploys while keeping audit trails intact for compliance reviews.`,
      `Adoption guides recommend pairing canary alarms with deterministic unit contracts before enabling automatic remediation in customer-facing regions.`,
    ].join(' ')

    return {
      id: `story-${index + 1}`,
      title,
      url: `https://example.com/story-${index + 1}`,
      score,
      source,
      pubDate: '2026-11-14T10:00:00Z',
      tldr: lead,
      takeaways: [
        `Benchmarks recorded 40% lower operational overhead across staging clusters in 2026.`,
        `Integrates with existing CI pipelines in under 15 minutes using standard configuration files.`,
        `See [architecture overview](https://example.com/arch/${index + 1}) for IAM role boundaries.`,
      ],
      whyMatters:
        'Builders gain measurable reliability and latency improvements without adding infrastructure complexity.',
      description: detailedParagraph,
      scoreDimensions: { relevance: 95, recency: 90, authority: 92, novelty: 88 },
    }
  })
}

test('normalizeTextForSpeech strips all URLs, speaks dates/numbers/versions, and enforces single narrator', () => {
  const raw = [
    'Alex: Check [the AWS post](https://aws.amazon.com/blogs/aws/new-release) and https://example.com/raw.',
    'Sam: On 2026-11-15, v2.4.0 scored 92/100 with 42.5% faster responses under 150ms across 1.8x throughput.',
  ].join(' ')

  const normalized = normalizeTextForSpeech(raw)
  assert.doesNotMatch(normalized, /https?:\/\//i)
  assert.doesNotMatch(normalized, /aws\.amazon\.com/i)
  assert.doesNotMatch(normalized, /\b(Alex|Sam):/i)
  assert.match(normalized, /November fifteenth, twenty twenty-six/)
  assert.match(normalized, /version two point four point zero/)
  assert.match(normalized, /ninety-two out of one hundred/)
  assert.match(normalized, /forty-two point five percent/)
  assert.match(normalized, /one hundred fifty milliseconds/)
  assert.match(normalized, /one point eight times/)
  assert.equal(dateToSpokenWords('2026-11-15'), 'November fifteenth, twenty twenty-six')
})

test('buildSpokenBriefingScript produces 900-1200 words (~6-8 min), short sentences, zero URLs, single narrator', () => {
  const items = makeRichFiveStories()
  const built = buildSpokenBriefingScript(items, { nowIso: '2026-11-15T08:00:00Z' })

  assert.equal(built.singleNarrator, true)
  assert.equal(built.segments.length, 5)
  assert.ok(
    built.wordCount >= 900 && built.wordCount <= 1200,
    `Expected 900-1200 words, got ${built.wordCount}`,
  )
  assert.ok(
    built.estimatedMinutes >= 6 && built.estimatedMinutes <= 8,
    `Expected 6-8 min, got ${built.estimatedMinutes}`,
  )
  assert.equal(built.withinTargetRange, true)
  assert.doesNotMatch(built.script, /https?:\/\//i)
  assert.doesNotMatch(built.script, /\b\d{4}-\d{2}-\d{2}\b/)

  const sentences = built.script
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  for (const sentence of sentences) {
    const words = countSpokenWords(sentence)
    assert.ok(words <= 26, `Sentence too long (${words} words): ${sentence}`)
  }
})

test('sanitizeSpokenScriptForTTS removes stray links, digits, and speaker tags cleanly', () => {
  const sanitized = sanitizeSpokenScriptForTTS(
    'Host 1: Visit https://news.ycombinator.com on 2026-11-15.\n\nHost 2: Latency dropped 50% for 200 users.',
  )
  assert.doesNotMatch(sanitized, /https?:\/\//)
  assert.doesNotMatch(sanitized, /Host \d:/i)
  assert.match(sanitized, /November fifteenth, twenty twenty-six/)
  assert.match(sanitized, /fifty percent/)
  assert.match(sanitized, /two hundred users/)
})

test('buildBriefingUtterances uses spokenText when supplied without breaking legacy calls', () => {
  const utterances = buildBriefingUtterances([
    {
      id: 's1',
      title: 'Ignored raw headline',
      url: 'https://example.com',
      score: 90,
      source: 'AWS Blog',
      tldr: 'Ignored raw TLDR',
      spokenText: 'Story one, from AWS Blog. First short sentence. Second short sentence.',
    },
  ])
  assert.equal(utterances.length, 3)
  assert.equal(utterances[0]?.text, 'Story one, from AWS Blog.')
})

test('extractPcmFromWav and encodeWavBuffersToMp3 produce valid MPEG audio bytes', () => {
  const wav = createSyntheticWavBuffer(150, 24000)
  const parsed = extractPcmFromWav(wav)
  assert.equal(parsed.sampleRate, 24000)
  assert.equal(parsed.channels, 1)
  assert.equal(parsed.pcm16.length, 3600)

  const mp3 = encodeWavBuffersToMp3([wav, wav], 128)
  assert.ok(mp3.byteLength > 500)
  // Valid MPEG audio frame header starts with 11-bit sync word (0xFF followed by 0xE0..0xFF)
  assert.equal(mp3[0], 0xff)
  assert.ok((mp3[1]! & 0xe0) === 0xe0)
})

test('synthesizeBriefingAudio caches MP3 in R2 on miss and serves HIT without re-synthesizing', async () => {
  const { bucket, store } = createMemoryR2Bucket()
  let synthCalls = 0
  const seenVoices: string[] = []
  const items = makeRichFiveStories()

  const first = await synthesizeBriefingAudio({
    items,
    voice: 'Charon',
    nowIso: '2026-11-15T08:00:00Z',
    env: { BRIEFING_AUDIO_BUCKET: bucket },
    synthesizeChunk: async ({ voice }) => {
      synthCalls += 1
      seenVoices.push(voice)
      return createSyntheticWavBuffer(80, 24000)
    },
  })

  assert.equal(first.ok, true)
  if (!first.ok) return
  assert.equal(first.cacheStatus, 'MISS')
  assert.equal(first.model, 'gemini-3.8-flash-lite-tts')
  assert.equal(first.voice, 'Charon')
  assert.ok(synthCalls >= 1)
  assert.ok(seenVoices.every((v) => v === 'Charon'))
  assert.equal(store.size, 1)
  assert.equal(store.get(first.cacheKey)?.contentType, 'audio/mpeg')

  const callsAfterFirst = synthCalls
  const second = await synthesizeBriefingAudio({
    items,
    voice: 'Charon',
    nowIso: '2026-11-15T08:00:00Z',
    env: { BRIEFING_AUDIO_BUCKET: bucket },
    synthesizeChunk: async () => {
      synthCalls += 1
      return createSyntheticWavBuffer(80, 24000)
    },
  })

  assert.equal(second.ok, true)
  if (!second.ok) return
  assert.equal(second.cacheStatus, 'HIT')
  assert.equal(second.cacheKey, first.cacheKey)
  assert.equal(synthCalls, callsAfterFirst, 'R2 cache HIT must not invoke TTS again')
  assert.deepEqual(second.mp3, first.mp3)
})

test('synthesizeBriefingAudio returns honest 503 when Gemini key is unconfigured (never fakes audio)', async () => {
  const prevGemini = process.env.GEMINI_API_KEY
  const prevGoogle = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  delete process.env.GEMINI_API_KEY
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY

  try {
    const status = getBriefingTtsStatus()
    assert.equal(status.available, false)
    assert.equal(status.model, GEMINI_TTS_MODEL)

    const result = await synthesizeBriefingAudio({
      items: makeRichFiveStories(),
      voice: 'gemini:Kore',
      nowIso: '2026-11-15T08:00:00Z',
    })
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.status, 503)
    assert.equal(result.mode, 'unavailable')
    assert.ok(result.wordCount >= 900)

    const apiRes = await app.request('/api/briefing/audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: makeRichFiveStories(), voice: 'Kore' }),
    })
    assert.equal(apiRes.status, 503)
    const json = (await apiRes.json()) as { mode?: string; model?: string; error?: string }
    assert.equal(json.mode, 'unavailable')
    assert.equal(json.model, 'gemini-3.8-flash-lite-tts')
    assert.match(json.error ?? '', /GEMINI_API_KEY/)
  } finally {
    if (prevGemini !== undefined) process.env.GEMINI_API_KEY = prevGemini
    if (prevGoogle !== undefined) process.env.GOOGLE_GENERATIVE_AI_API_KEY = prevGoogle
  }
})

test('Worker routes /api/briefing/audio/status, /api/briefing/script, and /api/briefing/audio/:filename validate inputs and serve R2 objects', async () => {
  const statusRes = await app.request('/api/briefing/audio/status')
  assert.equal(statusRes.status, 200)
  const statusBody = (await statusRes.json()) as {
    model: string
    voices: Array<{ voiceName: string }>
  }
  assert.equal(statusBody.model, 'gemini-3.8-flash-lite-tts')
  assert.deepEqual(
    statusBody.voices.map((v) => v.voiceName),
    ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'],
  )

  const emptyScriptRes = await app.request('/api/briefing/script', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [] }),
  })
  assert.equal(emptyScriptRes.status, 400)

  const scriptRes = await app.request('/api/briefing/script', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: makeRichFiveStories(),
      nowIso: '2026-11-15T08:00:00Z',
    }),
  })
  assert.equal(scriptRes.status, 200)
  const scriptJson = (await scriptRes.json()) as {
    script: string
    wordCount: number
    singleNarrator: boolean
    mode: string
  }
  assert.equal(scriptJson.singleNarrator, true)
  assert.ok(scriptJson.wordCount >= 900 && scriptJson.wordCount <= 1200)

  const { bucket } = createMemoryR2Bucket()
  const key = await buildBriefingCacheKey({ script: scriptJson.script, voice: 'Kore' })
  const filename = key.replace('briefing-audio/', '')
  assert.equal(isValidBriefingCacheFilename(filename), key)
  assert.equal(isValidBriefingCacheFilename('../secret.mp3'), null)

  const mp3 = encodeWavBuffersToMp3([createSyntheticWavBuffer(80)], 128)
  await bucket.put(key, mp3, { httpMetadata: { contentType: 'audio/mpeg' } })

  const r2Res = await app.request(
    `/api/briefing/audio/${filename}`,
    { method: 'GET' },
    { BRIEFING_AUDIO_BUCKET: bucket },
  )
  assert.equal(r2Res.status, 200)
  assert.equal(r2Res.headers.get('content-type'), 'audio/mpeg')
  assert.equal(r2Res.headers.get('x-briefing-cache'), 'HIT')
  const fetchedBytes = new Uint8Array(await r2Res.arrayBuffer())
  assert.deepEqual(fetchedBytes, mp3)

  assert.equal(sanitizeGeminiVoice('gemini:Zephyr'), 'Zephyr')
  assert.equal(sanitizeGeminiVoice('invalid-voice'), 'Kore')
})

test('prohibited TTS models (OpenAI tts-1 / gpt-4o-mini-tts / MeloTTS) are never referenced', async () => {
  const filesToCheck = [
    'server.ts',
    'server/briefingAudio.ts',
    'src/lib/spokenScript.ts',
    'src/lib/tts.ts',
    'src/components/DailyBriefingView.tsx',
    'src/App.tsx',
  ]
  const prohibited = /\b(tts-1|gpt-4o-mini-tts|melotts)\b/i
  for (const rel of filesToCheck) {
    const content = await fs.readFile(path.resolve(rel), 'utf8')
    assert.equal(
      prohibited.test(content),
      false,
      `Prohibited TTS reference found in ${rel}`,
    )
  }
})
