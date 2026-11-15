import type { SignalDimensions } from './scoring'

export interface DailyBriefingItem {
  id: string
  title: string
  url: string
  score: number
  source: string
  tldr: string
  pubDate?: string
  takeaways?: readonly string[]
  whyMatters?: string
  description?: string
  extractedText?: string
  scoreDimensions?: SignalDimensions
  spokenText?: string
}

export interface BriefingTtsVoiceOption {
  id: string
  voiceName: string
  label: string
}

export interface BriefingTtsStatus {
  available: boolean
  model: string
  r2Bound: boolean
  defaultVoice: string
  voices: BriefingTtsVoiceOption[]
}

export type AudioPlaybackEngineMode = 'gemini-tts' | 'web-speech' | 'unavailable'

export function isGeminiVoiceSelection(voiceURI: string | null | undefined): boolean {
  return typeof voiceURI === 'string' && voiceURI.startsWith('gemini:')
}

export interface SpeechVoiceInfo {
  voiceURI: string
  name: string
  lang: string
  default?: boolean
  localService?: boolean
}

export interface SpeakCallbacks {
  onStart?: () => void
  onEnd?: () => void
  onError?: (reason: string) => void
}

export interface SpeechSpeakRequest {
  text: string
  voiceURI?: string | null
  rate?: number
}

export interface SpeechEngine {
  isSupported: () => boolean
  speak: (req: SpeechSpeakRequest, callbacks?: SpeakCallbacks) => void
  cancel: () => void
  pause: () => void
  resume: () => void
  getVoices: () => SpeechVoiceInfo[]
  onVoicesChanged?: (listener: () => void) => () => void
}

export type BriefingPlaybackStatus = 'idle' | 'speaking' | 'paused'

export interface BriefingUtterance {
  text: string
  itemId: string
  itemIndex: number
  itemTitle: string
  kind: 'headline' | 'tldr'
}

export interface SpeakOptions {
  engine?: SpeechEngine
  voiceURI?: string | null
  rate?: number
  onStart?: () => void
  onEnd?: () => void
  onError?: (reason: string) => void
}

export interface BriefingPlayerOptions {
  voiceURI?: string | null
  rate?: number
}

export interface BriefingPlayerCallbacks {
  onStateChange?: (status: BriefingPlaybackStatus) => void
  onItemChange?: (index: number, item: DailyBriefingItem) => void
  onComplete?: () => void
  onError?: (message: string) => void
}

export interface BriefingPlayer {
  getStatus: () => BriefingPlaybackStatus
  getCurrentIndex: () => number
  play: (
    items: ReadonlyArray<DailyBriefingItem>,
    options?: BriefingPlayerOptions,
  ) => void
  pause: () => void
  resume: () => void
  stop: () => void
  setOptions: (options: BriefingPlayerOptions) => void
  subscribe: (callbacks: BriefingPlayerCallbacks) => () => void
}

const MIN_RATE = 0.5
const MAX_RATE = 2

export function clampSpeechRate(rate: unknown): number {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return 1
  const clamped = Math.min(MAX_RATE, Math.max(MIN_RATE, rate))
  return Math.round(clamped * 100) / 100
}

function getWebSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  if (!('speechSynthesis' in window) || !window.speechSynthesis) return null
  if (typeof SpeechSynthesisUtterance === 'undefined') return null
  return window.speechSynthesis
}

export function createWebSpeechEngine(): SpeechEngine {
  return {
    isSupported: () => getWebSpeechSynthesis() !== null,
    speak: (req, callbacks) => {
      const synth = getWebSpeechSynthesis()
      if (!synth) {
        callbacks?.onError?.('Web Speech synthesis is not supported in this browser.')
        return
      }
      const utterance = new SpeechSynthesisUtterance(req.text)
      utterance.rate = clampSpeechRate(req.rate)
      if (req.voiceURI) {
        const match = synth
          .getVoices()
          .find((voice) => voice.voiceURI === req.voiceURI)
        if (match) {
          utterance.voice = match
        }
      }
      utterance.onstart = () => callbacks?.onStart?.()
      utterance.onend = () => callbacks?.onEnd?.()
      utterance.onerror = (event) => {
        const code = event?.error
        if (code === 'canceled' || code === 'interrupted') return
        callbacks?.onError?.(
          code ? `Speech synthesis error (${code}).` : 'Speech synthesis failed.',
        )
      }
      synth.speak(utterance)
    },
    cancel: () => {
      getWebSpeechSynthesis()?.cancel()
    },
    pause: () => {
      getWebSpeechSynthesis()?.pause()
    },
    resume: () => {
      getWebSpeechSynthesis()?.resume()
    },
    getVoices: () => {
      const synth = getWebSpeechSynthesis()
      if (!synth) return []
      return synth.getVoices().map((voice) => ({
        voiceURI: voice.voiceURI,
        name: voice.name,
        lang: voice.lang,
        default: voice.default,
        localService: voice.localService,
      }))
    },
    onVoicesChanged: (listener) => {
      const synth = getWebSpeechSynthesis()
      if (!synth || typeof synth.addEventListener !== 'function') {
        return () => {}
      }
      synth.addEventListener('voiceschanged', listener)
      return () => synth.removeEventListener('voiceschanged', listener)
    },
  }
}

const defaultEngine: SpeechEngine = createWebSpeechEngine()

export function isSpeechSupported(engine: SpeechEngine = defaultEngine): boolean {
  return engine.isSupported()
}

export function listVoices(engine: SpeechEngine = defaultEngine): SpeechVoiceInfo[] {
  if (!engine.isSupported()) return []
  return engine.getVoices()
}

export function subscribeVoices(
  listener: () => void,
  engine: SpeechEngine = defaultEngine,
): () => void {
  if (!engine.isSupported() || !engine.onVoicesChanged) {
    return () => {}
  }
  return engine.onVoicesChanged(listener)
}

export function speak(text: string, options: SpeakOptions = {}): void {
  const engine = options.engine ?? defaultEngine
  const clean = text.trim()
  if (!clean) return
  if (!engine.isSupported()) {
    options.onError?.('Web Speech synthesis is not supported in this browser.')
    return
  }
  engine.speak(
    {
      text: clean,
      voiceURI: options.voiceURI ?? null,
      rate: clampSpeechRate(options.rate),
    },
    {
      onStart: options.onStart,
      onEnd: options.onEnd,
      onError: options.onError,
    },
  )
}

export function stop(engine: SpeechEngine = defaultEngine): void {
  engine.cancel()
}

const DOT_SENTINEL = '\u0000'

const ABBREVIATION_PATTERN =
  /\b(Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|vs|etc|approx|est|Fig|No|Vol|Inc|Ltd|Corp|Co)\./gi

function maskNonTerminalDots(input: string): string {
  return (
    input
      // Protect decimal numbers and semantic versions (e.g. 1.5, v2.1.3)
      .replace(/(\d)\.(\d)/g, `$1${DOT_SENTINEL}$2`)
      // Protect dotted abbreviations like e.g., i.e., U.S., U.K.
      .replace(/\b(?:[A-Za-z]\.){2,}/g, (match) =>
        match.replace(/\./g, DOT_SENTINEL),
      )
      // Protect common honorific/editorial abbreviations
      .replace(ABBREVIATION_PATTERN, (match) =>
        match.slice(0, -1) + DOT_SENTINEL,
      )
  )
}

function unmaskDots(input: string): string {
  return input.replaceAll(DOT_SENTINEL, '.')
}

function splitLongChunk(sentence: string, maxLength: number): string[] {
  if (sentence.length <= maxLength) return [sentence]

  const result: string[] = []
  const clauseParts = sentence.split(/(?<=[,;:])\s+|\s+[—-]\s+/).filter(Boolean)
  let current = ''

  const pushWordWrapped = (segment: string) => {
    const words = segment.split(/\s+/).filter(Boolean)
    let line = ''
    for (const word of words) {
      if (word.length > maxLength) {
        if (line) {
          result.push(line)
          line = ''
        }
        for (let i = 0; i < word.length; i += maxLength) {
          result.push(word.slice(i, i + maxLength))
        }
        continue
      }
      const next = line ? `${line} ${word}` : word
      if (next.length <= maxLength) {
        line = next
      } else {
        if (line) result.push(line)
        line = word
      }
    }
    if (line) result.push(line)
  }

  for (const part of clauseParts) {
    const candidate = current ? `${current} ${part}` : part
    if (candidate.length <= maxLength) {
      current = candidate
    } else {
      if (current) {
        result.push(current)
        current = ''
      }
      if (part.length <= maxLength) {
        current = part
      } else {
        pushWordWrapped(part)
      }
    }
  }
  if (current) result.push(current)
  return result
}

export function chunkSentences(text: string, maxLength = 200): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  const safeLimit = Math.max(40, Math.floor(maxLength))
  const masked = maskNonTerminalDots(normalized)
  const rawSentences = masked
    .split(/(?<=[.!?]["'”’)\]]*)\s+(?=[A-Z0-9"“‘([]|[a-z]{2,})/)
    .map((part) => unmaskDots(part).trim())
    .filter(Boolean)

  const chunks: string[] = []
  for (const sentence of rawSentences) {
    for (const piece of splitLongChunk(sentence, safeLimit)) {
      const clean = piece.trim()
      if (clean) chunks.push(clean)
    }
  }
  return chunks
}

function ensureTerminalPunctuation(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

export function buildBriefingUtterances(
  items: ReadonlyArray<DailyBriefingItem>,
): BriefingUtterance[] {
  const utterances: BriefingUtterance[] = []

  items.forEach((item, index) => {
    const cleanTitle = item.title.trim()
    const cleanSpoken = item.spokenText?.trim() ?? ''

    if (cleanSpoken) {
      for (const chunk of chunkSentences(ensureTerminalPunctuation(cleanSpoken))) {
        utterances.push({
          text: chunk,
          itemId: item.id,
          itemIndex: index,
          itemTitle: cleanTitle || item.source,
          kind: 'tldr',
        })
      }
      return
    }

    const cleanTldr = item.tldr.trim()

    if (cleanTitle) {
      // Chunk the title first, then prefix only the first chunk: putting
      // "Item N." inside the chunked text would split it into its own
      // utterance ("Item 1." / "AWS announces ...") because chunkSentences
      // splits on terminal periods.
      const headlineChunks = chunkSentences(ensureTerminalPunctuation(cleanTitle))
      headlineChunks.forEach((chunk, chunkIndex) => {
        utterances.push({
          text: chunkIndex === 0 ? `Item ${index + 1}. ${chunk}` : chunk,
          itemId: item.id,
          itemIndex: index,
          itemTitle: cleanTitle,
          kind: 'headline',
        })
      })
    }

    if (cleanTldr && cleanTldr.toLowerCase() !== cleanTitle.toLowerCase()) {
      for (const chunk of chunkSentences(ensureTerminalPunctuation(cleanTldr))) {
        utterances.push({
          text: chunk,
          itemId: item.id,
          itemIndex: index,
          itemTitle: cleanTitle || item.source,
          kind: 'tldr',
        })
      }
    }
  })

  return utterances
}

export function createBriefingPlayer(
  engine: SpeechEngine = defaultEngine,
): BriefingPlayer {
  let status: BriefingPlaybackStatus = 'idle'
  let generation = 0
  let queue: BriefingUtterance[] = []
  let activeItems: DailyBriefingItem[] = []
  let cursor = 0
  let currentItemIndex = -1
  let options: BriefingPlayerOptions = { voiceURI: null, rate: 1 }
  const subscribers = new Set<BriefingPlayerCallbacks>()

  const emitState = (next: BriefingPlaybackStatus) => {
    status = next
    for (const cb of subscribers) {
      cb.onStateChange?.(next)
    }
  }

  const emitItem = (index: number, item: DailyBriefingItem) => {
    for (const cb of subscribers) {
      cb.onItemChange?.(index, item)
    }
  }

  const emitComplete = () => {
    for (const cb of subscribers) {
      cb.onComplete?.()
    }
  }

  const emitError = (message: string) => {
    for (const cb of subscribers) {
      cb.onError?.(message)
    }
  }

  const speakCurrent = (runGen: number) => {
    if (runGen !== generation || status === 'idle') return

    if (cursor >= queue.length) {
      queue = []
      cursor = 0
      currentItemIndex = -1
      emitState('idle')
      emitComplete()
      return
    }

    const nextUtterance = queue[cursor]
    if (!nextUtterance) {
      queue = []
      cursor = 0
      currentItemIndex = -1
      emitState('idle')
      emitComplete()
      return
    }

    if (nextUtterance.itemIndex !== currentItemIndex) {
      currentItemIndex = nextUtterance.itemIndex
      const item = activeItems[currentItemIndex]
      if (item) {
        emitItem(currentItemIndex, item)
      }
    }

    engine.speak(
      {
        text: nextUtterance.text,
        voiceURI: options.voiceURI ?? null,
        rate: clampSpeechRate(options.rate),
      },
      {
        onEnd: () => {
          if (runGen !== generation || status === 'idle') return
          cursor += 1
          speakCurrent(runGen)
        },
        onError: (reason) => {
          if (runGen !== generation || status === 'idle') return
          generation += 1
          queue = []
          cursor = 0
          currentItemIndex = -1
          engine.cancel()
          emitError(reason)
          emitState('idle')
        },
      },
    )
  }

  return {
    getStatus: () => status,
    getCurrentIndex: () => currentItemIndex,
    play: (items, nextOptions) => {
      generation += 1
      const runGen = generation
      engine.cancel()

      if (nextOptions) {
        options = {
          voiceURI: nextOptions.voiceURI ?? null,
          rate: clampSpeechRate(nextOptions.rate),
        }
      }

      if (!engine.isSupported()) {
        queue = []
        activeItems = []
        cursor = 0
        currentItemIndex = -1
        emitError('Web Speech synthesis is not supported in this browser.')
        emitState('idle')
        return
      }

      activeItems = [...items]
      queue = buildBriefingUtterances(activeItems)
      cursor = 0
      currentItemIndex = -1

      if (queue.length === 0) {
        emitState('idle')
        return
      }

      emitState('speaking')
      speakCurrent(runGen)
    },
    pause: () => {
      if (status !== 'speaking') return
      engine.pause()
      emitState('paused')
    },
    resume: () => {
      if (status !== 'paused') return
      engine.resume()
      emitState('speaking')
    },
    stop: () => {
      if (status === 'idle' && queue.length === 0) return
      generation += 1
      queue = []
      activeItems = []
      cursor = 0
      currentItemIndex = -1
      engine.cancel()
      emitState('idle')
    },
    setOptions: (nextOptions) => {
      options = {
        voiceURI:
          nextOptions.voiceURI !== undefined
            ? nextOptions.voiceURI
            : options.voiceURI,
        rate:
          nextOptions.rate !== undefined
            ? clampSpeechRate(nextOptions.rate)
            : options.rate,
      }
    },
    subscribe: (callbacks) => {
      subscribers.add(callbacks)
      return () => {
        subscribers.delete(callbacks)
      }
    },
  }
}