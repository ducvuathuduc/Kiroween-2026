import {
  computeTopicOverlapScore,
  extractItemTopics,
  findSharedTopics,
  MIN_TOPIC_OVERLAP_SCORE,
  type PastReadRecord,
  type SecondBrainMatchKind,
} from '../src/lib/secondBrain.ts'
import type { FeedItem } from '../src/lib/feeds.ts'
import { summarizeWithFallback } from './ai.ts'
import { buildSummaryPrompt, SUMMARY_JSON_SYSTEM_PROMPT } from './summaryPrompt.ts'
import { sanitizeProviderId } from '../src/lib/providers.ts'

export const WORKERS_AI_SUMMARY_MODEL = '@cf/meta/llama-3.2-1b-instruct'
export const WORKERS_AI_EMBED_MODEL = '@cf/baai/bge-m3'
export const WORKERS_AI_RERANK_MODEL = '@cf/baai/bge-reranker-base'
export const BGE_M3_DIMENSIONS = 1024
const DAY_MS = 86_400_000

export interface WorkersAiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>
}

export interface VectorizeMatch {
  id: string
  score: number
  values?: number[]
  metadata?: Record<string, unknown>
}

export interface VectorizeUpsertRecord {
  id: string
  values: number[]
  metadata?: Record<string, unknown>
}

export interface VectorizeIndexBinding {
  query(
    vector: number[],
    options: {
      topK: number
      returnMetadata?: 'all' | 'indexed' | 'none'
      returnValues?: boolean
    },
  ): Promise<{ matches?: VectorizeMatch[] }>
  upsert(vectors: VectorizeUpsertRecord[]): Promise<unknown>
}

export interface QueueBinding {
  send(body: unknown): Promise<void>
}

export interface ExecutionCtxLike {
  waitUntil(promise: Promise<unknown>): void
}

export interface LiveAiEnv {
  AI?: WorkersAiBinding
  VECTORIZE?: VectorizeIndexBinding
  EMBED_QUEUE?: QueueBinding
}

export type LiveSummaryMode = 'workers-ai' | 'provider' | 'extractive'

export interface LiveSummaryResult {
  tldr: string
  takeaways: string[]
  whyMatters: string
  model: string
  mode: LiveSummaryMode
  provider?: string
  fallbackReason?: string
}

export interface EmbedIngestItem {
  id: string
  feedId?: string
  feedTitle: string
  title: string
  link?: string
  description: string
  pubDate?: string
  interactedAt?: string
  readAt?: string
  savedAt?: string
  score?: number
}

export interface LiveEmbedResult {
  available: boolean
  model: string
  dimensions: number
  embeddings: Record<string, number[]>
  queuedIngest: boolean
  ingestTarget?: 'queue' | 'waitUntil' | 'none'
  reason?: string
}

export interface ResurfaceCandidateInput {
  id: string
  feedId?: string
  feedTitle: string
  title: string
  link?: string
  description: string
  pubDate?: string
  score?: number
  readAt?: string
  savedAt?: string
}

export interface ResurfaceRequestInput {
  query: string
  topStory?: {
    id: string
    title: string
    description?: string
    feedTitle?: string
  }
  candidates: ResurfaceCandidateInput[]
  minAgeDays?: number
  limit?: number
  nowMs?: number
}

export interface LiveResurfaceMatch {
  item: PastReadRecord
  score: number
  matchKind: SecondBrainMatchKind
  sharedTopics: string[]
  interactedAt: string
  daysAgo: number
  why: string
  rerankScore?: number
  vectorScore?: number
  matchedTopStory?: {
    id: string
    title: string
  }
}

export interface LiveResurfaceResult {
  mode: 'workers-ai-vectorize' | 'topic-overlap'
  model: string
  rerankerModel: string | null
  vectorizeHits: number
  rerankedCount: number
  matches: LiveResurfaceMatch[]
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

export function l2Normalize(vec: readonly number[]): number[] {
  let normSq = 0
  for (let i = 0; i < vec.length; i += 1) {
    const v = vec[i]
    if (typeof v !== 'number' || !Number.isFinite(v)) return []
    normSq += v * v
  }
  if (normSq <= 0) return []
  const invNorm = 1 / Math.sqrt(normSq)
  return vec.map((v) => v * invNorm)
}

export function scheduleBackground(
  ctx: ExecutionCtxLike | null | undefined,
  promise: Promise<unknown>,
): boolean {
  const safe = promise.catch(() => undefined)
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(safe)
    return true
  }
  return false
}

export function formatEmbedText(item: {
  title: string
  feedTitle?: string
  description: string
}): string {
  const cleanDesc = item.description.replace(/\s+/g, ' ').trim().slice(0, 800)
  return `${item.title}\n${item.feedTitle ?? ''}\n${cleanDesc}`.trim()
}

function cleanPlainText(raw: string): string {
  return raw
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildExtractiveSummary(params: {
  title: string
  feedTitle: string
  content: string
  fallbackReason?: string
}): LiveSummaryResult {
  const cleaned = cleanPlainText(params.content)
  const rawSentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20)

  const tldr =
    rawSentences.length > 0
      ? rawSentences.slice(0, 2).join(' ').slice(0, 280)
      : `${params.title} (${params.feedTitle || 'Feed'}).`.slice(0, 280)

  const takeaways: string[] = []
  const seen = new Set<string>()
  for (const sentence of rawSentences.slice(1)) {
    const key = sentence.toLowerCase().slice(0, 48)
    if (seen.has(key)) continue
    seen.add(key)
    takeaways.push(sentence.length > 180 ? `${sentence.slice(0, 177)}...` : sentence)
    if (takeaways.length >= 3) break
  }
  if (takeaways.length === 0 && rawSentences[0]) {
    takeaways.push(
      rawSentences[0].length > 180
        ? `${rawSentences[0].slice(0, 177)}...`
        : rawSentences[0],
    )
  }

  const topics = extractItemTopics({
    title: params.title,
    description: cleaned,
  }).curated

  const whyMatters =
    topics.length > 0
      ? `Extractive summary covering ${topics.slice(0, 3).join(', ')} from ${params.feedTitle || 'this feed'}.`
      : `Extractive summary derived directly from the article text (${params.feedTitle || 'RSS feed'}).`

  return {
    tldr,
    takeaways,
    whyMatters,
    model: 'extractive',
    mode: 'extractive',
    ...(params.fallbackReason ? { fallbackReason: params.fallbackReason } : {}),
  }
}

function extractWorkersAiText(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (!raw || typeof raw !== 'object') return ''
  const obj = raw as {
    response?: unknown
    result?: { response?: unknown }
    choices?: Array<{ message?: { content?: unknown }; text?: unknown }>
  }
  if (typeof obj.response === 'string') return obj.response
  if (typeof obj.result?.response === 'string') return obj.result.response
  const choice = obj.choices?.[0]
  if (typeof choice?.message?.content === 'string') return choice.message.content
  if (typeof choice?.text === 'string') return choice.text
  return ''
}

function parseSummaryJson(rawText: string): {
  tldr: string
  takeaways: string[]
  whyMatters: string
} | null {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      tldr?: unknown
      takeaways?: unknown
      whyMatters?: unknown
    }
    const tldr = typeof parsed.tldr === 'string' ? parsed.tldr.trim() : ''
    if (!tldr) return null
    const takeaways = Array.isArray(parsed.takeaways)
      ? parsed.takeaways
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .map((x) => x.trim())
          .slice(0, 4)
      : []
    const whyMatters =
      typeof parsed.whyMatters === 'string' ? parsed.whyMatters.trim() : ''
    return { tldr, takeaways, whyMatters }
  } catch {
    return null
  }
}

export async function summarizeWithWorkersAi(params: {
  title: string
  feedTitle: string
  link: string
  content: string
  preferredProvider?: unknown
  env?: LiveAiEnv
}): Promise<LiveSummaryResult> {
  const { title, feedTitle, link, content, env } = params

  let workersAiUnavailableReason: string | undefined
  if (env?.AI) {
    try {
      const prompt = buildSummaryPrompt({ title, feedTitle, link, content })
      const raw = await env.AI.run(WORKERS_AI_SUMMARY_MODEL, {
        messages: [
          { role: 'system', content: SUMMARY_JSON_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: 340,
        temperature: 0.2,
      })
      const rawText = extractWorkersAiText(raw)
      const parsed = parseSummaryJson(rawText)
      if (parsed) {
        return {
          ...parsed,
          model: WORKERS_AI_SUMMARY_MODEL,
          mode: 'workers-ai',
        }
      }
      if (rawText.trim().length >= 30) {
        const lines = rawText
          .split('\n')
          .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
          .filter(Boolean)
        if (lines.length > 0) {
          return {
            tldr: lines[0].slice(0, 320),
            takeaways: lines.slice(1, 4).map((l) => l.slice(0, 180)),
            whyMatters:
              lines[4]?.slice(0, 220) ??
              `Summarized via ${WORKERS_AI_SUMMARY_MODEL}.`,
            model: WORKERS_AI_SUMMARY_MODEL,
            mode: 'workers-ai',
          }
        }
      }
      workersAiUnavailableReason =
        'Workers AI returned an invalid response; showing extractive summary.'
    } catch {
      workersAiUnavailableReason =
        'Workers AI unavailable; showing extractive summary.'
    }
  }

  try {
    const providerResult = await summarizeWithFallback({
      title,
      feedTitle,
      link,
      content,
      preferredProvider: sanitizeProviderId(params.preferredProvider),
    })
    return {
      tldr: providerResult.tldr,
      takeaways: providerResult.takeaways,
      whyMatters: providerResult.whyMatters,
      model: providerResult.provider,
      provider: providerResult.provider,
      mode: 'provider',
    }
  } catch {
    return buildExtractiveSummary({
      title,
      feedTitle,
      content,
      fallbackReason:
        workersAiUnavailableReason ??
        'Workers AI binding unavailable; showing extractive summary.',
    })
  }
}

function parseBgeM3Vectors(raw: unknown): number[][] {
  if (!raw || typeof raw !== 'object') return []
  const obj = raw as {
    data?: unknown
    embeddings?: unknown
    result?: { data?: unknown }
  }
  const source = Array.isArray(obj.data)
    ? obj.data
    : Array.isArray(obj.embeddings)
      ? obj.embeddings
      : Array.isArray(obj.result?.data)
        ? obj.result.data
        : []

  const vectors: number[][] = []
  for (const row of source) {
    const arr = Array.isArray(row)
      ? row
      : ArrayBuffer.isView(row)
        ? Array.from(row as Float32Array)
        : []
    if (arr.length !== BGE_M3_DIMENSIONS) {
      vectors.push([])
      continue
    }
    vectors.push(l2Normalize(arr.map((n) => Number(n))))
  }
  return vectors
}

export async function runBgeM3Embeddings(
  ai: WorkersAiBinding,
  texts: readonly string[],
): Promise<number[][]> {
  if (texts.length === 0) return []
  const cleaned = texts.map((t) => t.replace(/\s+/g, ' ').trim().slice(0, 2000))
  const raw = await ai.run(WORKERS_AI_EMBED_MODEL, { text: cleaned })
  return parseBgeM3Vectors(raw)
}

export async function upsertItemsToVectorize(params: {
  items: readonly EmbedIngestItem[]
  precomputedEmbeddings?: Record<string, number[]>
  env: LiveAiEnv
}): Promise<number> {
  const { items, precomputedEmbeddings, env } = params
  if (!env.VECTORIZE || items.length === 0) return 0

  const missing = items.filter(
    (item) =>
      !precomputedEmbeddings?.[item.id] ||
      precomputedEmbeddings[item.id].length !== BGE_M3_DIMENSIONS,
  )

  const vectorsById: Record<string, number[]> = { ...precomputedEmbeddings }
  if (missing.length > 0 && env.AI) {
    const computed = await runBgeM3Embeddings(
      env.AI,
      missing.map((it) => formatEmbedText(it)),
    )
    missing.forEach((it, idx) => {
      const vec = computed[idx]
      if (vec && vec.length === BGE_M3_DIMENSIONS) {
        vectorsById[it.id] = vec
      }
    })
  }

  const upsertRows: VectorizeUpsertRecord[] = []
  for (const item of items) {
    const values = vectorsById[item.id]
    if (!values || values.length !== BGE_M3_DIMENSIONS) continue
    upsertRows.push({
      id: item.id,
      values,
      metadata: {
        id: item.id,
        feedId: item.feedId ?? '',
        feedTitle: item.feedTitle,
        title: item.title.slice(0, 300),
        link: item.link ?? '',
        description: item.description.slice(0, 600),
        pubDate: item.pubDate ?? '',
        interactedAt:
          item.savedAt ?? item.readAt ?? item.interactedAt ?? new Date().toISOString(),
        ...(item.readAt ? { readAt: item.readAt } : {}),
        ...(item.savedAt ? { savedAt: item.savedAt } : {}),
        ...(typeof item.score === 'number' ? { score: item.score } : {}),
      },
    })
  }

  if (upsertRows.length === 0) return 0
  await env.VECTORIZE.upsert(upsertRows)
  return upsertRows.length
}

export async function embedWithWorkersAi(params: {
  texts?: Array<{ id: string; text: string }>
  items?: EmbedIngestItem[]
  ingest?: boolean
  ingestOnly?: boolean
  env?: LiveAiEnv
  executionCtx?: ExecutionCtxLike
}): Promise<LiveEmbedResult> {
  const { texts = [], items = [], ingest = false, ingestOnly = false, env, executionCtx } = params

  if (ingest && ingestOnly && items.length > 0) {
    if (env?.EMBED_QUEUE) {
      const queued = scheduleBackground(
        executionCtx,
        env.EMBED_QUEUE.send({ type: 'embed-ingest', items }),
      )
      if (!queued) {
        void env.EMBED_QUEUE.send({ type: 'embed-ingest', items }).catch(() => undefined)
      }
      return {
        available: Boolean(env.AI),
        model: WORKERS_AI_EMBED_MODEL,
        dimensions: BGE_M3_DIMENSIONS,
        embeddings: {},
        queuedIngest: true,
        ingestTarget: 'queue',
      }
    }
    if (env?.AI && env?.VECTORIZE) {
      const job = upsertItemsToVectorize({ items, env })
      const scheduled = scheduleBackground(executionCtx, job)
      if (!scheduled) {
        void job.catch(() => undefined)
      }
      return {
        available: true,
        model: WORKERS_AI_EMBED_MODEL,
        dimensions: BGE_M3_DIMENSIONS,
        embeddings: {},
        queuedIngest: true,
        ingestTarget: 'waitUntil',
      }
    }
    return {
      available: false,
      model: WORKERS_AI_EMBED_MODEL,
      dimensions: BGE_M3_DIMENSIONS,
      embeddings: {},
      queuedIngest: false,
      ingestTarget: 'none',
      reason: 'Workers AI or Vectorize binding unavailable for async ingest.',
    }
  }

  if (!env?.AI) {
    return {
      available: false,
      model: WORKERS_AI_EMBED_MODEL,
      dimensions: BGE_M3_DIMENSIONS,
      embeddings: {},
      queuedIngest: false,
      ingestTarget: 'none',
      reason: 'Workers AI binding unavailable.',
    }
  }

  const textEntries: Array<{ id: string; text: string }> = [
    ...texts,
    ...items.map((it) => ({ id: it.id, text: formatEmbedText(it) })),
  ].slice(0, 48)

  if (textEntries.length === 0) {
    return {
      available: true,
      model: WORKERS_AI_EMBED_MODEL,
      dimensions: BGE_M3_DIMENSIONS,
      embeddings: {},
      queuedIngest: false,
      ingestTarget: 'none',
    }
  }

  try {
    const vectors = await runBgeM3Embeddings(
      env.AI,
      textEntries.map((entry) => entry.text),
    )
    const embeddings: Record<string, number[]> = {}
    textEntries.forEach((entry, idx) => {
      const vec = vectors[idx]
      if (vec && vec.length === BGE_M3_DIMENSIONS) {
        embeddings[entry.id] = vec
      }
    })

    let queuedIngest = false
    let ingestTarget: 'queue' | 'waitUntil' | 'none' = 'none'
    if (ingest && items.length > 0) {
      if (env.EMBED_QUEUE) {
        const sendPromise = env.EMBED_QUEUE.send({
          type: 'embed-ingest',
          items,
          embeddings,
        })
        if (!scheduleBackground(executionCtx, sendPromise)) {
          void sendPromise.catch(() => undefined)
        }
        queuedIngest = true
        ingestTarget = 'queue'
      } else if (env.VECTORIZE) {
        // Never block HTTP response path on Vectorize upsert.
        const upsertPromise = upsertItemsToVectorize({
          items,
          precomputedEmbeddings: embeddings,
          env,
        })
        if (!scheduleBackground(executionCtx, upsertPromise)) {
          void upsertPromise.catch(() => undefined)
        }
        queuedIngest = true
        ingestTarget = 'waitUntil'
      }
    }

    return {
      available: Object.keys(embeddings).length > 0,
      model: WORKERS_AI_EMBED_MODEL,
      dimensions: BGE_M3_DIMENSIONS,
      embeddings,
      queuedIngest,
      ingestTarget,
    }
  } catch (err) {
    return {
      available: false,
      model: WORKERS_AI_EMBED_MODEL,
      dimensions: BGE_M3_DIMENSIONS,
      embeddings: {},
      queuedIngest: false,
      ingestTarget: 'none',
      reason: err instanceof Error ? err.message : 'Workers AI embedding failed.',
    }
  }
}

function normalizeCandidate(raw: ResurfaceCandidateInput): PastReadRecord | null {
  if (!raw.id || !raw.title) return null
  const interactedAt = raw.savedAt ?? raw.readAt ?? raw.pubDate
  if (!interactedAt || !Number.isFinite(Date.parse(interactedAt))) return null
  return {
    id: raw.id,
    feedId: raw.feedId ?? 'past-read',
    feedTitle: raw.feedTitle || 'Archive',
    title: raw.title,
    link: raw.link ?? '',
    description: raw.description ?? '',
    pubDate: raw.pubDate ?? interactedAt,
    ...(typeof raw.score === 'number' && Number.isFinite(raw.score)
      ? { score: raw.score }
      : {}),
    ...(raw.readAt ? { readAt: raw.readAt } : { readAt: interactedAt }),
    ...(raw.savedAt ? { savedAt: raw.savedAt } : {}),
  }
}

function vectorizeMatchToRecord(
  match: VectorizeMatch,
  candidateById: Map<string, PastReadRecord>,
): PastReadRecord | null {
  const existing = candidateById.get(match.id)
  if (existing) return existing
  const meta = match.metadata ?? {}
  const title = typeof meta.title === 'string' ? meta.title : ''
  const interactedAt =
    typeof meta.savedAt === 'string'
      ? meta.savedAt
      : typeof meta.readAt === 'string'
        ? meta.readAt
        : typeof meta.interactedAt === 'string'
          ? meta.interactedAt
          : typeof meta.pubDate === 'string'
            ? meta.pubDate
            : ''
  if (!title || !interactedAt || !Number.isFinite(Date.parse(interactedAt))) {
    return null
  }
  return {
    id: match.id,
    feedId: typeof meta.feedId === 'string' && meta.feedId ? meta.feedId : 'vectorize',
    feedTitle:
      typeof meta.feedTitle === 'string' && meta.feedTitle
        ? meta.feedTitle
        : 'Second Brain Archive',
    title,
    link: typeof meta.link === 'string' ? meta.link : '',
    description: typeof meta.description === 'string' ? meta.description : '',
    pubDate: typeof meta.pubDate === 'string' && meta.pubDate ? meta.pubDate : interactedAt,
    ...(typeof meta.score === 'number' && Number.isFinite(meta.score)
      ? { score: meta.score }
      : {}),
    readAt:
      typeof meta.readAt === 'string' && meta.readAt ? meta.readAt : interactedAt,
    ...(typeof meta.savedAt === 'string' && meta.savedAt
      ? { savedAt: meta.savedAt }
      : {}),
  }
}

function parseRerankScores(raw: unknown, count: number): number[] {
  const scores = Array<number>(count).fill(0)
  if (!raw || typeof raw !== 'object') return scores
  const obj = raw as {
    response?: unknown
    data?: unknown
    result?: { response?: unknown; data?: unknown }
  }
  const rows = Array.isArray(obj.response)
    ? obj.response
    : Array.isArray(obj.data)
      ? obj.data
      : Array.isArray(obj.result?.response)
        ? obj.result.response
        : Array.isArray(obj.result?.data)
          ? obj.result.data
          : []

  for (let i = 0; i < rows.length; i += 1) {
    const entry = rows[i]
    if (typeof entry === 'number' && Number.isFinite(entry)) {
      if (i < count) scores[i] = clamp01(entry)
    } else if (entry && typeof entry === 'object') {
      const rec = entry as { id?: unknown; index?: unknown; score?: unknown }
      const idx =
        typeof rec.id === 'number'
          ? rec.id
          : typeof rec.index === 'number'
            ? rec.index
            : i
      if (idx >= 0 && idx < count && typeof rec.score === 'number') {
        scores[idx] = clamp01(rec.score)
      }
    }
  }
  return scores
}

function isSameArticle(
  a: { id?: string; title?: string },
  b: { id?: string; title?: string },
): boolean {
  if (a.id && b.id && a.id === b.id) return true
  const ta = (a.title ?? '').trim().toLowerCase()
  const tb = (b.title ?? '').trim().toLowerCase()
  return Boolean(ta && ta === tb)
}

function computeRecencyAndRadarBoost(params: {
  baseScore: number
  daysAgo: number
  minAgeDays: number
  signalScore?: number
}): number {
  const { baseScore, daysAgo, minAgeDays, signalScore } = params
  const excessDays = Math.max(0, daysAgo - minAgeDays)
  const recencyDecay = Math.exp(-excessDays / 90)
  const signalNorm = clamp01((signalScore ?? 50) / 100)
  const decayed = baseScore * (0.75 + 0.25 * recencyDecay)
  return Math.round(clamp01(decayed + 0.15 * signalNorm) * 1000) / 1000
}

export async function resurfaceSecondBrain(
  input: ResurfaceRequestInput,
  env?: LiveAiEnv,
): Promise<LiveResurfaceResult> {
  const nowMs =
    typeof input.nowMs === 'number' && Number.isFinite(input.nowMs)
      ? input.nowMs
      : Date.now()
  const minAgeDays =
    typeof input.minAgeDays === 'number' && Number.isFinite(input.minAgeDays)
      ? Math.max(0, input.minAgeDays)
      : 0
  const limit =
    typeof input.limit === 'number' && Number.isFinite(input.limit)
      ? Math.max(1, Math.min(10, Math.floor(input.limit)))
      : 5

  const normalizedCandidates: PastReadRecord[] = []
  const candidateById = new Map<string, PastReadRecord>()
  for (const raw of input.candidates ?? []) {
    const rec = normalizeCandidate(raw)
    if (!rec) continue
    if (input.topStory && isSameArticle(rec, input.topStory)) continue
    normalizedCandidates.push(rec)
    candidateById.set(rec.id, rec)
  }

  const queryTarget: Pick<FeedItem, 'id' | 'title' | 'description'> = {
    id: input.topStory?.id ?? 'query',
    title: input.topStory?.title ?? input.query,
    description: input.topStory?.description ?? input.query,
  }

  const topStoryRef = input.topStory
    ? { id: input.topStory.id, title: input.topStory.title }
    : undefined

  let vectorizeHits = 0
  let rerankedCount = 0
  const collected: LiveResurfaceMatch[] = []
  const seenIds = new Set<string>()
  const seenTitles = new Set<string>()

  const markSeen = (rec: PastReadRecord): boolean => {
    const normTitle = rec.title.trim().toLowerCase()
    if (seenIds.has(rec.id) || (normTitle && seenTitles.has(normTitle))) {
      return false
    }
    seenIds.add(rec.id)
    if (normTitle) seenTitles.add(normTitle)
    return true
  }

  let usedLiveVectorize = false

  if (env?.AI && env?.VECTORIZE && input.query.trim().length > 0) {
    try {
      const [queryVec] = await runBgeM3Embeddings(env.AI, [input.query.trim()])
      if (queryVec && queryVec.length === BGE_M3_DIMENSIONS) {
        const vectorResult = await env.VECTORIZE.query(queryVec, {
          topK: 10,
          returnMetadata: 'all',
        })
        const rawMatches = Array.isArray(vectorResult.matches)
          ? vectorResult.matches.slice(0, 10)
          : []
        vectorizeHits = rawMatches.length

        const eligibleRecords: Array<{
          record: PastReadRecord
          vectorScore: number
          interactedAt: string
          daysAgo: number
        }> = []

        for (const match of rawMatches) {
          const record = vectorizeMatchToRecord(match, candidateById)
          if (!record) continue
          if (input.topStory && isSameArticle(record, input.topStory)) continue
          const interactedAt = record.savedAt ?? record.readAt ?? record.pubDate
          const ageMs = nowMs - Date.parse(interactedAt)
          if (!Number.isFinite(ageMs)) continue
          const daysAgo = Math.floor(ageMs / DAY_MS)
          if (minAgeDays > 0 && ageMs <= minAgeDays * DAY_MS) continue
          eligibleRecords.push({
            record,
            vectorScore: clamp01(match.score),
            interactedAt,
            daysAgo,
          })
        }

        if (eligibleRecords.length > 0) {
          usedLiveVectorize = true
          let rerankScores = eligibleRecords.map((e) => e.vectorScore)
          try {
            const rerankRaw = await env.AI.run(WORKERS_AI_RERANK_MODEL, {
              query: input.query.trim(),
              contexts: eligibleRecords.map((e) => ({
                text: formatEmbedText(e.record),
              })),
            })
            const parsedScores = parseRerankScores(rerankRaw, eligibleRecords.length)
            if (parsedScores.some((s) => s > 0)) {
              rerankScores = parsedScores
            }
          } catch {
            // Keep vector similarity score if reranker call fails transiently
          }

          const rerankedTop5 = eligibleRecords
            .map((entry, idx) => ({
              ...entry,
              rerankScore: rerankScores[idx] ?? entry.vectorScore,
            }))
            .sort((a, b) => b.rerankScore - a.rerankScore)
            .slice(0, 5)

          rerankedCount = rerankedTop5.length

          for (const entry of rerankedTop5) {
            if (!markSeen(entry.record)) continue
            const shared = findSharedTopics(queryTarget, entry.record, 4)
            const fallbackTopics =
              shared.length > 0
                ? shared
                : extractItemTopics(entry.record).curated.slice(0, 2)
            const finalScore = computeRecencyAndRadarBoost({
              baseScore: entry.rerankScore,
              daysAgo: entry.daysAgo,
              minAgeDays,
              signalScore: entry.record.score,
            })
            const signalText =
              typeof entry.record.score === 'number'
                ? ` · Signal ${entry.record.score}/100`
                : ''
            const topicText =
              fallbackTopics.length > 0
                ? ` · shared: ${fallbackTopics.join(', ')}`
                : ''
            collected.push({
              item: entry.record,
              score: finalScore,
              matchKind: 'semantic',
              sharedTopics:
                fallbackTopics.length > 0
                  ? fallbackTopics
                  : ['Vectorize semantic match'],
              interactedAt: entry.interactedAt,
              daysAgo: entry.daysAgo,
              rerankScore: entry.rerankScore,
              vectorScore: entry.vectorScore,
              ...(topStoryRef ? { matchedTopStory: topStoryRef } : {}),
              why: `Vectorize top-10 → bge-reranker (${entry.rerankScore.toFixed(2)})${topicText}${signalText}`,
            })
          }
        }
      }
    } catch {
      usedLiveVectorize = false
    }
  }

  // Hybrid keyword/topic-overlap fallback (also runs standalone when offline/no bindings)
  for (const record of normalizedCandidates) {
    if (!markSeen(record)) continue
    const interactedAt = record.savedAt ?? record.readAt ?? record.pubDate
    const ageMs = nowMs - Date.parse(interactedAt)
    if (!Number.isFinite(ageMs)) continue
    if (minAgeDays > 0 && ageMs <= minAgeDays * DAY_MS) continue
    const daysAgo = Math.floor(ageMs / DAY_MS)

    const overlap = computeTopicOverlapScore(queryTarget, record)
    if (overlap.sharedTopics.length === 0 || overlap.score < MIN_TOPIC_OVERLAP_SCORE) {
      continue
    }

    const finalScore = computeRecencyAndRadarBoost({
      baseScore: overlap.score,
      daysAgo,
      minAgeDays,
      signalScore: record.score,
    })
    const signalText =
      typeof record.score === 'number' ? ` · Signal ${record.score}/100` : ''
    collected.push({
      item: record,
      score: finalScore,
      matchKind: 'topic-overlap',
      sharedTopics: overlap.sharedTopics,
      interactedAt,
      daysAgo,
      ...(topStoryRef ? { matchedTopStory: topStoryRef } : {}),
      why: `Topic-overlap (${overlap.score.toFixed(2)}) on ${overlap.sharedTopics.join(', ')}${signalText}`,
    })
  }

  const matches = collected
    .sort((a, b) => b.score - a.score || b.daysAgo - a.daysAgo)
    .slice(0, limit)

  return {
    mode: usedLiveVectorize ? 'workers-ai-vectorize' : 'topic-overlap',
    model: usedLiveVectorize ? WORKERS_AI_EMBED_MODEL : 'deterministic',
    rerankerModel: usedLiveVectorize ? WORKERS_AI_RERANK_MODEL : null,
    vectorizeHits,
    rerankedCount,
    matches,
  }
}

export async function processEmbedQueueMessages(
  messages: ReadonlyArray<{ body?: { items?: EmbedIngestItem[]; embeddings?: Record<string, number[]> } }>,
  env: LiveAiEnv,
): Promise<number> {
  let totalUpserted = 0
  for (const msg of messages) {
    const items = Array.isArray(msg.body?.items) ? msg.body.items : []
    if (items.length === 0) continue
    totalUpserted += await upsertItemsToVectorize({
      items,
      precomputedEmbeddings: msg.body?.embeddings,
      env,
    })
  }
  return totalUpserted
}
