import { fuzzyMatchScore } from './briefing'
import type { FeedItem } from './feeds'
import {
  loadSemanticVectors,
  saveSemanticVectors,
  type SemanticVectorRecord,
} from './storage'

export const SEMANTIC_MODEL_ID = 'Xenova/all-MiniLM-L6-v2'
export const SEMANTIC_MODEL_CACHE_KEY = 'Xenova/all-MiniLM-L6-v2#q8'
export const SEMANTIC_WEIGHT = 0.6
export const KEYWORD_WEIGHT = 0.4
export const DEFAULT_MIN_SIMILARITY = 0.25

export type SemanticWorkerStatus =
  | 'idle'
  | 'downloading'
  | 'embedding'
  | 'ready'
  | 'unavailable'
  | 'error'

export interface SemanticProgressState {
  status: SemanticWorkerStatus
  progress: number
  file: string
  error: string | null
  modelReady: boolean
}

export interface RankedSemanticItem<T> {
  item: T
  similarity: number
  keywordScore: number
  combinedScore: number
  isSemanticMatch: boolean
}

export interface SemanticSearchResponse {
  scores: Record<string, number>
  source: 'local'
}

export interface HybridRankOptions {
  minSimilarity?: number
  semanticWeight?: number
  keywordWeight?: number
}

export interface EmbedWorkerOutbound {
  type: 'progress' | 'result' | 'error'
  requestId: number
  status?: string
  file?: string
  progress?: number
  loaded?: number
  total?: number
  queryVec?: number[] | null
  docVecs?: Record<string, number[]>
  model?: string
  error?: string
}

export function cosineSimilarity(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i += 1) {
    const va = a[i] ?? 0
    const vb = b[i] ?? 0
    if (!Number.isFinite(va) || !Number.isFinite(vb)) return 0
    dot += va * vb
    normA += va * va
    normB += vb * vb
  }
  if (normA <= 0 || normB <= 0) return 0
  const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB))
  return Number.isFinite(sim) ? Math.max(-1, Math.min(1, sim)) : 0
}

export function normalizeKeywordScore(
  query: string,
  item: Pick<FeedItem, 'title' | 'description' | 'feedTitle'>,
): number {
  const clean = query.trim()
  if (!clean) return 0
  const titleMatch = fuzzyMatchScore(clean, item.title)
  const fullMatch = fuzzyMatchScore(
    clean,
    `${item.title} ${item.description} ${item.feedTitle}`,
  )
  const best = Math.max(titleMatch, fullMatch * 0.9)
  if (best <= 0) return 0
  return Math.max(0.15, Math.min(1, best / 960))
}

export function rankItemsHybrid<
  T extends Pick<FeedItem, 'id' | 'title' | 'description' | 'feedTitle'>,
>(
  items: readonly T[],
  semanticScores: Record<string, number>,
  query: string,
  options: HybridRankOptions = {},
): RankedSemanticItem<T>[] {
  const minSimilarity = options.minSimilarity ?? DEFAULT_MIN_SIMILARITY
  const semanticWeight = options.semanticWeight ?? SEMANTIC_WEIGHT
  const keywordWeight = options.keywordWeight ?? KEYWORD_WEIGHT

  const ranked: RankedSemanticItem<T>[] = []
  for (const item of items) {
    const rawSim = semanticScores[item.id] ?? 0
    const similarity = Number.isFinite(rawSim)
      ? Math.max(0, Math.min(1, rawSim))
      : 0
    const keywordScore = normalizeKeywordScore(query, item)
    const isSemanticMatch = similarity >= minSimilarity
    if (!isSemanticMatch && keywordScore <= 0) continue

    const combinedScore =
      semanticWeight * similarity + keywordWeight * keywordScore

    ranked.push({
      item,
      similarity,
      keywordScore,
      combinedScore,
      isSemanticMatch,
    })
  }

  return ranked.sort(
    (a, b) =>
      b.combinedScore - a.combinedScore || b.similarity - a.similarity,
  )
}

export type SemanticBackendChoice =
  | 'keyword-only'
  | 'local-primary'
  | 'local-with-server-fallback'
  | 'server-fallback'

export function selectSemanticBackend(params: {
  enabled: boolean
  query: string
  workerSupported: boolean
  localReady: boolean
  localFailed: boolean
  hasServerEmbedProvider: boolean
  online: boolean
}): SemanticBackendChoice {
  if (!params.enabled || params.query.trim().length < 2) {
    return 'keyword-only'
  }
  if (!params.workerSupported || params.localFailed) {
    return params.online && params.hasServerEmbedProvider
      ? 'server-fallback'
      : 'keyword-only'
  }
  if (!params.localReady && params.online && params.hasServerEmbedProvider) {
    return 'local-with-server-fallback'
  }
  return 'local-primary'
}

export function isLocalSemanticSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined'
}

export function formatItemEmbeddingText(
  item: Pick<FeedItem, 'title' | 'description' | 'feedTitle'>,
): string {
  const cleanDesc = item.description.replace(/\s+/g, ' ').trim().slice(0, 500)
  return `${item.title}\n${item.feedTitle}\n${cleanDesc}`.trim()
}

export interface SemanticSearchClient {
  getState: () => SemanticProgressState
  subscribe: (listener: (state: SemanticProgressState) => void) => () => void
  search: (
    query: string,
    items: readonly Pick<FeedItem, 'id' | 'title' | 'description' | 'feedTitle'>[],
    signal?: AbortSignal,
  ) => Promise<SemanticSearchResponse>
  resetMemoryCache: () => void
  dispose: () => void
}

const INITIAL_PROGRESS_STATE: SemanticProgressState = {
  status: 'idle',
  progress: 0,
  file: '',
  error: null,
  modelReady: false,
}

export function createSemanticSearchClient(
  workerFactory?: () => Worker,
): SemanticSearchClient {
  let worker: Worker | null = null
  let nextRequestId = 1
  let state: SemanticProgressState = { ...INITIAL_PROGRESS_STATE }
  const listeners = new Set<(next: SemanticProgressState) => void>()
  const memoryItemVectors = new Map<string, number[]>()
  const memoryQueryVectors = new Map<string, number[]>()
  const fileTotals = new Map<string, { loaded: number; total: number }>()

  interface PendingRequest {
    resolve: (value: { queryVec: number[] | null; docVecs: Record<string, number[]> }) => void
    reject: (err: Error) => void
  }
  const pending = new Map<number, PendingRequest>()

  const notify = (patch: Partial<SemanticProgressState>) => {
    state = { ...state, ...patch }
    for (const listener of listeners) {
      listener(state)
    }
  }

  const handleWorkerMessage = (event: MessageEvent<EmbedWorkerOutbound>) => {
    const msg = event.data
    if (!msg || typeof msg !== 'object') return

    if (msg.type === 'progress') {
      const file = msg.file ?? ''
      if (msg.status === 'progress_total' && typeof msg.progress === 'number') {
        notify({
          status: 'downloading',
          progress: Math.round(msg.progress),
          file: file || state.file,
          error: null,
        })
        return
      }
      if (file && typeof msg.loaded === 'number' && typeof msg.total === 'number' && msg.total > 0) {
        fileTotals.set(file, { loaded: msg.loaded, total: msg.total })
        let sumLoaded = 0
        let sumTotal = 0
        for (const entry of fileTotals.values()) {
          sumLoaded += entry.loaded
          sumTotal += entry.total
        }
        const pct = sumTotal > 0 ? Math.round((sumLoaded / sumTotal) * 100) : Math.round(msg.progress ?? 0)
        notify({
          status: 'downloading',
          progress: Math.max(0, Math.min(100, pct)),
          file,
          error: null,
        })
        return
      }
      if (msg.status === 'initiate' || msg.status === 'download') {
        notify({
          status: 'downloading',
          file: file || state.file,
          error: null,
        })
      } else if (msg.status === 'ready') {
        notify({
          status: 'embedding',
          progress: 100,
          modelReady: true,
          error: null,
        })
      }
      return
    }

    const req = pending.get(msg.requestId)
    if (!req) return
    pending.delete(msg.requestId)

    if (msg.type === 'result') {
      notify({
        status: 'ready',
        progress: 100,
        file: '',
        error: null,
        modelReady: true,
      })
      req.resolve({
        queryVec: Array.isArray(msg.queryVec) ? msg.queryVec : null,
        docVecs: msg.docVecs ?? {},
      })
    } else if (msg.type === 'error') {
      const message = msg.error || 'Local semantic search unavailable.'
      notify({
        status: 'error',
        error: message,
      })
      req.reject(new Error(message))
    }
  }

  const ensureWorker = async (): Promise<Worker> => {
    if (!isLocalSemanticSupported()) {
      notify({ status: 'unavailable', error: 'Web Workers or WebAssembly unavailable.' })
      throw new Error('Web Workers or WebAssembly unavailable.')
    }
    if (worker) return worker

    if (workerFactory) {
      worker = workerFactory()
    } else {
      const mod = await import('../workers/embed.worker.ts?worker')
      const WorkerCtor = mod.default
      worker = new WorkerCtor()
    }

    worker.addEventListener('message', handleWorkerMessage)
    worker.addEventListener('error', (err) => {
      const msg = err.message || 'Embedding worker failed.'
      notify({ status: 'error', error: msg })
      for (const [, p] of pending) {
        p.reject(new Error(msg))
      }
      pending.clear()
    })
    return worker
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      listener(state)
      return () => {
        listeners.delete(listener)
      }
    },
    resetMemoryCache: () => {
      memoryItemVectors.clear()
      memoryQueryVectors.clear()
      fileTotals.clear()
      notify({ ...INITIAL_PROGRESS_STATE })
    },
    dispose: () => {
      if (worker) {
        worker.terminate()
        worker = null
      }
      for (const [, p] of pending) {
        p.reject(new Error('Semantic search worker disposed.'))
      }
      pending.clear()
    },
    search: async (query, items, signal) => {
      const normalizedQuery = query.trim().toLowerCase()
      if (normalizedQuery.length < 2 || items.length === 0) {
        return { scores: {}, source: 'local' }
      }
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }

      const candidateItems = items.slice(0, 80)
      const itemIds = candidateItems.map((it) => it.id)

      const uncachedIds = itemIds.filter((id) => !memoryItemVectors.has(id))
      if (uncachedIds.length > 0) {
        const stored = await loadSemanticVectors(uncachedIds, SEMANTIC_MODEL_CACHE_KEY)
        for (const [id, rec] of Object.entries(stored)) {
          memoryItemVectors.set(id, rec.vec)
        }
      }

      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }

      const cachedQueryVec = memoryQueryVectors.get(normalizedQuery) ?? null
      const missingDocs = candidateItems
        .filter((it) => !memoryItemVectors.has(it.id))
        .map((it) => ({
          id: it.id,
          text: formatItemEmbeddingText(it),
        }))

      let queryVec = cachedQueryVec

      if (!queryVec || missingDocs.length > 0) {
        if (!state.modelReady && state.status === 'idle') {
          notify({ status: 'downloading', progress: 0, file: '', error: null })
        } else if (state.modelReady) {
          notify({ status: 'embedding', error: null })
        }

        const activeWorker = await ensureWorker()
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }

        const requestId = nextRequestId++
        const result = await new Promise<{
          queryVec: number[] | null
          docVecs: Record<string, number[]>
        }>((resolve, reject) => {
          const onAbort = () => {
            pending.delete(requestId)
            reject(new DOMException('Aborted', 'AbortError'))
          }
          if (signal) {
            if (signal.aborted) {
              onAbort()
              return
            }
            signal.addEventListener('abort', onAbort, { once: true })
          }
          pending.set(requestId, {
            resolve: (val) => {
              signal?.removeEventListener('abort', onAbort)
              resolve(val)
            },
            reject: (err) => {
              signal?.removeEventListener('abort', onAbort)
              reject(err)
            },
          })
          activeWorker.postMessage({
            type: 'embed',
            requestId,
            query: normalizedQuery,
            docs: missingDocs,
            skipQuery: Boolean(cachedQueryVec),
          })
        })

        if (result.queryVec && result.queryVec.length === 384) {
          queryVec = result.queryVec
          memoryQueryVectors.set(normalizedQuery, queryVec)
          if (memoryQueryVectors.size > 40) {
            const firstKey = memoryQueryVectors.keys().next().value
            if (firstKey) memoryQueryVectors.delete(firstKey)
          }
        }

        const now = Date.now()
        const newRecords: SemanticVectorRecord[] = []
        for (const [id, vec] of Object.entries(result.docVecs)) {
          if (vec.length === 384) {
            memoryItemVectors.set(id, vec)
            newRecords.push({
              itemId: id,
              vec,
              model: SEMANTIC_MODEL_CACHE_KEY,
              updatedAt: now,
            })
          }
        }
        if (newRecords.length > 0) {
          void saveSemanticVectors(newRecords)
        }
      }

      if (!queryVec) {
        return { scores: {}, source: 'local' }
      }

      const scores: Record<string, number> = {}
      for (const item of candidateItems) {
        const docVec = memoryItemVectors.get(item.id)
        if (docVec) {
          scores[item.id] = cosineSimilarity(queryVec, docVec)
        }
      }

      return { scores, source: 'local' }
    },
  }
}
