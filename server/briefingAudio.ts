import { Mp3Encoder } from '@breezystack/lamejs'
import { GoogleGenAI } from '@google/genai'
import {
  buildSpokenBriefingScript,
  countSpokenWords,
  estimateSpokenMinutes,
  sanitizeSpokenScriptForTTS,
  type SpokenBriefingInputItem,
  type SpokenBriefingScript,
} from '../src/lib/spokenScript.ts'

export const GEMINI_TTS_MODEL = 'gemini-3.8-flash-lite-tts'

export const GEMINI_TTS_VOICES = [
  'Kore',
  'Puck',
  'Charon',
  'Fenrir',
  'Zephyr',
] as const

export type GeminiTtsVoice = (typeof GEMINI_TTS_VOICES)[number]

export const DEFAULT_GEMINI_TTS_VOICE: GeminiTtsVoice = 'Kore'

export interface R2ObjectBodyLike {
  arrayBuffer(): Promise<ArrayBuffer>
  httpMetadata?: { contentType?: string }
  customMetadata?: Record<string, string>
}

export interface R2BucketBinding {
  get(key: string): Promise<R2ObjectBodyLike | null>
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string }
      customMetadata?: Record<string, string>
    },
  ): Promise<unknown>
}

export interface BriefingAudioEnv {
  BRIEFING_AUDIO_BUCKET?: R2BucketBinding
}

export interface TtsStatusResponse {
  available: boolean
  model: string
  r2Bound: boolean
  defaultVoice: GeminiTtsVoice
  voices: ReadonlyArray<{
    id: string
    voiceName: GeminiTtsVoice
    label: string
  }>
}

export interface SpokenScriptResult extends SpokenBriefingScript {
  mode: 'gemini' | 'deterministic'
}

export type BriefingAudioCacheStatus = 'HIT' | 'MISS' | 'BYPASS'

export type SynthesizeBriefingResult =
  | {
      ok: true
      mp3: Uint8Array
      cacheStatus: BriefingAudioCacheStatus
      cacheKey: string
      voice: GeminiTtsVoice
      model: string
      r2Bound: boolean
      wordCount: number
      estimatedMinutes: number
      spokenScript: string
    }
  | {
      ok: false
      status: 400 | 502 | 503
      error: string
      mode: 'unavailable' | 'error'
      cacheStatus: 'MISS' | 'BYPASS'
      cacheKey: string
      voice: GeminiTtsVoice
      model: string
      r2Bound: boolean
      wordCount: number
      estimatedMinutes: number
      spokenScript: string
    }

export type ChunkSynthesizer = (params: {
  text: string
  voice: GeminiTtsVoice
  apiKey: string
}) => Promise<Uint8Array>

const VOICE_LABELS: Record<GeminiTtsVoice, string> = {
  Kore: 'Kore — balanced anchor',
  Puck: 'Puck — bright & energetic',
  Charon: 'Charon — warm & measured',
  Fenrir: 'Fenrir — crisp & direct',
  Zephyr: 'Zephyr — calm & articulate',
}

export function getGeminiTtsKey(): string {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    ''
  )
}

export function sanitizeGeminiVoice(raw: unknown): GeminiTtsVoice {
  if (typeof raw !== 'string') return DEFAULT_GEMINI_TTS_VOICE
  const normalized = raw.replace(/^gemini:/i, '').trim().toLowerCase()
  const matched = GEMINI_TTS_VOICES.find(
    (voice) => voice.toLowerCase() === normalized,
  )
  return matched ?? DEFAULT_GEMINI_TTS_VOICE
}

export function getBriefingTtsStatus(env?: BriefingAudioEnv): TtsStatusResponse {
  return {
    available: Boolean(getGeminiTtsKey()),
    model: GEMINI_TTS_MODEL,
    r2Bound: Boolean(env?.BRIEFING_AUDIO_BUCKET),
    defaultVoice: DEFAULT_GEMINI_TTS_VOICE,
    voices: GEMINI_TTS_VOICES.map((voiceName) => ({
      id: `gemini:${voiceName}`,
      voiceName,
      label: VOICE_LABELS[voiceName],
    })),
  }
}

export async function buildBriefingCacheKey(params: {
  script: string
  voice: GeminiTtsVoice
  model?: string
}): Promise<string> {
  const payload = `${params.model ?? GEMINI_TTS_MODEL}\n${params.voice}\n${params.script}`
  const encoded = new TextEncoder().encode(payload)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `briefing-audio/v1-${params.voice.toLowerCase()}-${hex.slice(0, 32)}.mp3`
}

export function isValidBriefingCacheFilename(filename: string): string | null {
  const clean = filename.trim()
  if (/^v1-(?:kore|puck|charon|fenrir|zephyr)-[a-f0-9]{32}\.mp3$/.test(clean)) {
    return `briefing-audio/${clean}`
  }
  return null
}

export function splitScriptIntoTtsChunks(
  script: string,
  maxChars = 1500,
): string[] {
  const paragraphs = script
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) return []

  const chunks: string[] = []
  let current = ''

  const pushPiece = (piece: string) => {
    const candidate = current ? `${current}\n\n${piece}` : piece
    if (candidate.length <= maxChars) {
      current = candidate
      return
    }
    if (current) {
      chunks.push(current)
      current = ''
    }
    if (piece.length <= maxChars) {
      current = piece
      return
    }
    const sentences = piece.split(/(?<=[.!?])\s+/).filter(Boolean)
    let sentenceBuf = ''
    for (const s of sentences) {
      const next = sentenceBuf ? `${sentenceBuf} ${s}` : s
      if (next.length <= maxChars) {
        sentenceBuf = next
      } else {
        if (sentenceBuf) chunks.push(sentenceBuf)
        sentenceBuf = s.slice(0, maxChars)
      }
    }
    if (sentenceBuf) current = sentenceBuf
  }

  for (const para of paragraphs) {
    pushPiece(para)
  }
  if (current) chunks.push(current)
  return chunks
}

export function extractPcmFromWav(wavBytes: Uint8Array): {
  sampleRate: number
  channels: number
  bitsPerSample: number
  pcm16: Int16Array
} {
  if (wavBytes.byteLength < 44) {
    throw new Error('Invalid WAV buffer returned by TTS model.')
  }
  const view = new DataView(
    wavBytes.buffer,
    wavBytes.byteOffset,
    wavBytes.byteLength,
  )
  const riff = String.fromCharCode(
    wavBytes[0]!,
    wavBytes[1]!,
    wavBytes[2]!,
    wavBytes[3]!,
  )
  const wave = String.fromCharCode(
    wavBytes[8]!,
    wavBytes[9]!,
    wavBytes[10]!,
    wavBytes[11]!,
  )
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error('TTS audio payload did not contain a valid RIFF/WAVE header.')
  }

  let sampleRate = 24000
  let channels = 1
  let bitsPerSample = 16
  let dataOffset = -1
  let dataSize = 0

  let offset = 12
  while (offset + 8 <= wavBytes.byteLength) {
    const chunkId = String.fromCharCode(
      wavBytes[offset]!,
      wavBytes[offset + 1]!,
      wavBytes[offset + 2]!,
      wavBytes[offset + 3]!,
    )
    const chunkSize = view.getUint32(offset + 4, true)
    const bodyStart = offset + 8
    const clampedEnd = Math.min(wavBytes.byteLength, bodyStart + chunkSize)

    if (chunkId === 'fmt ' && bodyStart + 16 <= wavBytes.byteLength) {
      channels = view.getUint16(bodyStart + 2, true) || 1
      sampleRate = view.getUint32(bodyStart + 4, true) || 24000
      bitsPerSample = view.getUint16(bodyStart + 14, true) || 16
    } else if (chunkId === 'data') {
      dataOffset = bodyStart
      dataSize = Math.max(0, clampedEnd - bodyStart)
      break
    }

    offset = bodyStart + chunkSize + (chunkSize % 2)
  }

  if (dataOffset === -1) {
    dataOffset = 44
    dataSize = wavBytes.byteLength - 44
  }

  const sampleCount = Math.floor(dataSize / 2)
  const pcm16 = new Int16Array(sampleCount)
  for (let i = 0; i < sampleCount; i += 1) {
    pcm16[i] = view.getInt16(dataOffset + i * 2, true)
  }

  return { sampleRate, channels, bitsPerSample, pcm16 }
}

export function encodeWavBuffersToMp3(
  wavBuffers: readonly Uint8Array[],
  kbps = 128,
): Uint8Array {
  if (wavBuffers.length === 0) {
    throw new Error('No WAV audio chunks available to encode.')
  }

  const decoded = wavBuffers.map((buf) => extractPcmFromWav(buf))
  const sampleRate = decoded[0]!.sampleRate || 24000
  const channels = Math.min(2, Math.max(1, decoded[0]!.channels || 1))
  const encoder = new Mp3Encoder(channels, sampleRate, kbps)
  const mp3Parts: Uint8Array[] = []
  const frameSize = 1152
  const pauseSamples = Math.floor(sampleRate * 0.25)

  const encodeMono = (samples: Int16Array) => {
    for (let i = 0; i < samples.length; i += frameSize) {
      const slice = samples.subarray(i, i + frameSize)
      const encoded = encoder.encodeBuffer(slice)
      if (encoded.length > 0) mp3Parts.push(encoded)
    }
  }

  decoded.forEach((chunk, index) => {
    if (channels === 1) {
      encodeMono(chunk.pcm16)
    } else {
      const monoCount = Math.floor(chunk.pcm16.length / 2)
      const left = new Int16Array(monoCount)
      const right = new Int16Array(monoCount)
      for (let i = 0; i < monoCount; i += 1) {
        left[i] = chunk.pcm16[i * 2] ?? 0
        right[i] = chunk.pcm16[i * 2 + 1] ?? 0
      }
      for (let i = 0; i < monoCount; i += frameSize) {
        const encoded = encoder.encodeBuffer(
          left.subarray(i, i + frameSize),
          right.subarray(i, i + frameSize),
        )
        if (encoded.length > 0) mp3Parts.push(encoded)
      }
    }

    if (index < decoded.length - 1 && pauseSamples > 0) {
      const silence = new Int16Array(pauseSamples)
      if (channels === 1) {
        encodeMono(silence)
      } else {
        for (let i = 0; i < pauseSamples; i += frameSize) {
          const slice = silence.subarray(i, i + frameSize)
          const encoded = encoder.encodeBuffer(slice, slice)
          if (encoded.length > 0) mp3Parts.push(encoded)
        }
      }
    }
  })

  const tail = encoder.flush()
  if (tail.length > 0) mp3Parts.push(tail)

  const totalLength = mp3Parts.reduce((sum, part) => sum + part.byteLength, 0)
  const out = new Uint8Array(totalLength)
  let writeOffset = 0
  for (const part of mp3Parts) {
    out.set(part, writeOffset)
    writeOffset += part.byteLength
  }
  return out
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'))
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export async function synthesizeChunkWithGeminiTts(params: {
  text: string
  voice: GeminiTtsVoice
  apiKey: string
}): Promise<Uint8Array> {
  const ai = new GoogleGenAI({
    apiKey: params.apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  })

  const response = await ai.models.generateContent({
    model: GEMINI_TTS_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: params.text,
            speechMetadata: {
              style: 'Clear, calm, single-narrator engineering news briefing',
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: params.voice },
        },
      },
    },
  })

  const parts = response.candidates?.[0]?.content?.parts ?? []
  const audioPart = parts.find(
    (part) =>
      typeof part.inlineData?.data === 'string' &&
      part.inlineData.data.length > 0,
  )
  const base64Audio = audioPart?.inlineData?.data
  if (!base64Audio) {
    throw new Error('Gemini 3.8 Flash-Lite TTS returned no audio data.')
  }
  return base64ToBytes(base64Audio)
}

export async function generateSpokenBriefingScript(params: {
  items: readonly SpokenBriefingInputItem[]
  nowIso?: string
  useAiPolish?: boolean
  aiRewrite?: (prompt: string, apiKey: string) => Promise<string>
}): Promise<SpokenScriptResult> {
  const deterministic = buildSpokenBriefingScript(params.items, {
    nowIso: params.nowIso,
  })
  const apiKey = getGeminiTtsKey()

  if (!params.useAiPolish || !apiKey || params.items.length === 0) {
    return {
      ...deterministic,
      mode: 'deterministic',
    }
  }

  const promptPayload = {
    dateSpoken: deterministic.dateSpoken,
    targetWordCount: '950-1150 words',
    rules: [
      'Single narrator broadcast script only (no dialogue, no multiple speakers).',
      'Short, crisp sentences.',
      'Spell out every number, score, version, percentage, and date in words.',
      'Zero URLs, zero markdown, zero links.',
      'Strictly stay grounded in the supplied stories.',
    ],
    stories: params.items.slice(0, 5).map((item, idx) => ({
      storyNumber: idx + 1,
      source: item.source,
      scoreOutOf100: Math.round(item.score),
      title: item.title,
      tldr: item.tldr,
      takeaways: item.takeaways ?? [],
      whyMatters: item.whyMatters ?? '',
      excerpt: (item.extractedText ?? item.description ?? '').slice(0, 1200),
    })),
  }

  try {
    let rewritten = ''
    if (params.aiRewrite) {
      rewritten = await params.aiRewrite(JSON.stringify(promptPayload), apiKey)
    } else {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      })
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: JSON.stringify(promptPayload),
        config: {
          systemInstruction:
            'Rewrite these 5 engineering briefing stories into a single-narrator spoken audio script of 950 to 1,150 words (~6-8 minutes). Use short clear sentences, spoken numbers and dates, zero URLs or links, and zero two-host dialogue. Never invent facts not present in the JSON.',
        },
      })
      rewritten = response.text ?? ''
    }

    const sanitized = sanitizeSpokenScriptForTTS(rewritten)
    const words = countSpokenWords(sanitized)
    if (words >= Math.min(400, Math.floor(deterministic.wordCount * 0.7))) {
      return {
        ...deterministic,
        script: sanitized,
        wordCount: words,
        estimatedMinutes: estimateSpokenMinutes(words),
        withinTargetRange: words >= 900 && words <= 1200,
        mode: 'gemini',
      }
    }
  } catch {
    // Fall back cleanly to deterministic spoken-script builder
  }

  return {
    ...deterministic,
    mode: 'deterministic',
  }
}

export async function synthesizeBriefingAudio(params: {
  items?: readonly SpokenBriefingInputItem[]
  script?: string
  voice?: unknown
  nowIso?: string
  env?: BriefingAudioEnv
  synthesizeChunk?: ChunkSynthesizer
}): Promise<SynthesizeBriefingResult> {
  const voice = sanitizeGeminiVoice(params.voice)
  const r2Bucket = params.env?.BRIEFING_AUDIO_BUCKET
  const r2Bound = Boolean(r2Bucket)

  let spokenScript =
    typeof params.script === 'string' && params.script.trim()
      ? sanitizeSpokenScriptForTTS(params.script)
      : ''

  if (!spokenScript && Array.isArray(params.items) && params.items.length > 0) {
    spokenScript = buildSpokenBriefingScript(params.items, {
      nowIso: params.nowIso,
    }).script
  }

  if (!spokenScript) {
    return {
      ok: false,
      status: 400,
      error: 'Briefing items or a non-empty spoken script are required.',
      mode: 'error',
      cacheStatus: r2Bound ? 'MISS' : 'BYPASS',
      cacheKey: '',
      voice,
      model: GEMINI_TTS_MODEL,
      r2Bound,
      wordCount: 0,
      estimatedMinutes: 0,
      spokenScript: '',
    }
  }

  const wordCount = countSpokenWords(spokenScript)
  const estimatedMinutes = estimateSpokenMinutes(wordCount)
  const cacheKey = await buildBriefingCacheKey({
    script: spokenScript,
    voice,
    model: GEMINI_TTS_MODEL,
  })

  if (r2Bucket) {
    try {
      const cached = await r2Bucket.get(cacheKey)
      if (cached) {
        const bytes = new Uint8Array(await cached.arrayBuffer())
        if (bytes.byteLength > 0) {
          return {
            ok: true,
            mp3: bytes,
            cacheStatus: 'HIT',
            cacheKey,
            voice,
            model: GEMINI_TTS_MODEL,
            r2Bound,
            wordCount,
            estimatedMinutes,
            spokenScript,
          }
        }
      }
    } catch {
      // Treat R2 read error cleanly as cache miss and proceed
    }
  }

  const apiKey = getGeminiTtsKey()
  if (!apiKey && !params.synthesizeChunk) {
    return {
      ok: false,
      status: 503,
      error:
        'Gemini 3.8 Flash-Lite TTS is unavailable because GEMINI_API_KEY is not configured on the server.',
      mode: 'unavailable',
      cacheStatus: r2Bound ? 'MISS' : 'BYPASS',
      cacheKey,
      voice,
      model: GEMINI_TTS_MODEL,
      r2Bound,
      wordCount,
      estimatedMinutes,
      spokenScript,
    }
  }

  const chunks = splitScriptIntoTtsChunks(spokenScript, 1500)
  const synthFn = params.synthesizeChunk ?? synthesizeChunkWithGeminiTts

  try {
    const wavBuffers: Uint8Array[] = []
    for (const chunk of chunks) {
      const wav = await synthFn({
        text: chunk,
        voice,
        apiKey: apiKey || 'injected-test-key',
      })
      wavBuffers.push(wav)
    }

    const mp3 = encodeWavBuffersToMp3(wavBuffers, 128)
    if (r2Bucket) {
      try {
        await r2Bucket.put(cacheKey, mp3, {
          httpMetadata: {
            contentType: 'audio/mpeg',
            cacheControl: 'public, max-age=86400',
          },
          customMetadata: {
            model: GEMINI_TTS_MODEL,
            voice,
            wordCount: String(wordCount),
            estimatedMinutes: String(estimatedMinutes),
          },
        })
      } catch {
        // Non-fatal: still serve freshly synthesized MP3
      }
    }

    return {
      ok: true,
      mp3,
      cacheStatus: r2Bound ? 'MISS' : 'BYPASS',
      cacheKey,
      voice,
      model: GEMINI_TTS_MODEL,
      r2Bound,
      wordCount,
      estimatedMinutes,
      spokenScript,
    }
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Gemini 3.8 Flash-Lite TTS synthesis failed.'
    return {
      ok: false,
      status: 502,
      error: message,
      mode: 'error',
      cacheStatus: r2Bound ? 'MISS' : 'BYPASS',
      cacheKey,
      voice,
      model: GEMINI_TTS_MODEL,
      r2Bound,
      wordCount,
      estimatedMinutes,
      spokenScript,
    }
  }
}
