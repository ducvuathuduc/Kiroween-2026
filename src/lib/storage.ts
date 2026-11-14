import { sanitizeProviderId, type AIProviderId } from './providers'
import type { FeedItem } from './feeds'
import { selectDailyBriefingItems, type FeedHealth } from './briefing'
import type { PulseSnapshot } from './pulse'
import { emptyProfile, type TasteProfile } from './personalize'

export const LAST_VISIT_STORAGE_KEY = 'rr.lastVisit.v1'
export const SETTINGS_STORAGE_KEY = 'rr.settings.v1'

export type ReaderDensity = 'comfortable' | 'compact'
export type DefaultFilter = 'all' | 'high' | 'unread' | 'saved'
export type MotionPreference = 'system' | 'reduce'

export interface ReaderSettings {
  density: ReaderDensity
  defaultFilter: DefaultFilter
  reducedMotion: MotionPreference
  aiProvider: AIProviderId
  personalBoostEnabled: boolean
  semanticSearchEnabled: boolean
  audioVoiceURI: string | null
  audioRate: number
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  density: 'comfortable',
  defaultFilter: 'all',
  reducedMotion: 'system',
  aiProvider: 'gemini',
  personalBoostEnabled: true,
  semanticSearchEnabled: true,
  audioVoiceURI: null,
  audioRate: 1,
}

export function sanitizeSettings(raw: unknown): ReaderSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS
  const obj = raw as Record<string, unknown>
  const density: ReaderDensity =
    obj.density === 'compact' ? 'compact' : 'comfortable'
  const defaultFilter: DefaultFilter =
    obj.defaultFilter === 'high' ||
    obj.defaultFilter === 'unread' ||
    obj.defaultFilter === 'saved'
      ? obj.defaultFilter
      : 'all'
  const reducedMotion: MotionPreference =
    obj.reducedMotion === 'reduce' ? 'reduce' : 'system'
  const aiProvider = sanitizeProviderId(obj.aiProvider)
  const personalBoostEnabled = obj.personalBoostEnabled !== false
  const semanticSearchEnabled = obj.semanticSearchEnabled !== false
  const audioVoiceURI =
    typeof obj.audioVoiceURI === 'string' && obj.audioVoiceURI.trim().length > 0
      ? obj.audioVoiceURI
      : null
  const rawRate =
    typeof obj.audioRate === 'number' && Number.isFinite(obj.audioRate)
      ? obj.audioRate
      : 1
  const audioRate = Math.min(2, Math.max(0.5, Math.round(rawRate * 100) / 100))
  return {
    density,
    defaultFilter,
    reducedMotion,
    aiProvider,
    personalBoostEnabled,
    semanticSearchEnabled,
    audioVoiceURI,
    audioRate,
  }
}

export function loadStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function saveStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage full or unavailable — app keeps working in-memory
  }
}

export function loadSettings(): ReaderSettings {
  return sanitizeSettings(loadStorage<unknown>(SETTINGS_STORAGE_KEY, null))
}

function openTasteDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('rr-personalization', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('taste')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function loadTasteProfile(): Promise<TasteProfile> {
  try {
    const db = await openTasteDatabase()
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction('taste').objectStore('taste').get('profile')
        request.onsuccess = () => {
          const value: unknown = request.result
          if (!value || typeof value !== 'object') return resolve(emptyProfile())
          const candidate = value as Partial<TasteProfile>
          const validVector = (v: unknown) =>
            Array.isArray(v) &&
            (v.length === 0 || v.length === 128) &&
            v.every((n) => typeof n === 'number' && Number.isFinite(n))
          if (
            !candidate.counts ||
            !Number.isSafeInteger(candidate.counts.liked) ||
            candidate.counts.liked < 0 ||
            !Number.isSafeInteger(candidate.counts.disliked) ||
            candidate.counts.disliked < 0 ||
            !candidate.topicWeights ||
            typeof candidate.topicWeights !== 'object' ||
            !Object.values(candidate.topicWeights).every(
              (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 8,
            ) ||
            !validVector(candidate.likedCentroid) ||
            !validVector(candidate.dislikedCentroid)
          ) {
            return resolve(emptyProfile())
          }
          resolve(candidate as TasteProfile)
        }
        request.onerror = () => reject(request.error)
      })
    } finally {
      db.close()
    }
  } catch {
    return emptyProfile()
  }
}

export async function saveTasteProfile(profile: TasteProfile): Promise<boolean> {
  try {
    const db = await openTasteDatabase()
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction('taste', 'readwrite')
        transaction.objectStore('taste').put(profile, 'profile')
        transaction.oncomplete = () => resolve(true)
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
    } finally {
      db.close()
    }
  } catch {
    return false
  }
}

export interface SemanticVectorRecord {
  itemId: string
  vec: number[]
  model: string
  updatedAt: number
}

const SEMANTIC_DB_NAME = 'rr-semantic'
const SEMANTIC_STORE_NAME = 'vectors'
const MAX_STORED_VECTORS = 600

function openSemanticDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const request = indexedDB.open(SEMANTIC_DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SEMANTIC_STORE_NAME)) {
        db.createObjectStore(SEMANTIC_STORE_NAME, { keyPath: 'itemId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function isValidSemanticRecord(
  value: unknown,
  expectedModel?: string,
): value is SemanticVectorRecord {
  if (!value || typeof value !== 'object') return false
  const rec = value as Partial<SemanticVectorRecord>
  if (typeof rec.itemId !== 'string' || !rec.itemId) return false
  if (typeof rec.model !== 'string' || !rec.model) return false
  if (expectedModel && rec.model !== expectedModel) return false
  if (typeof rec.updatedAt !== 'number' || !Number.isFinite(rec.updatedAt)) return false
  return (
    Array.isArray(rec.vec) &&
    rec.vec.length === 384 &&
    rec.vec.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}

export async function loadSemanticVectors(
  itemIds: readonly string[],
  model: string,
): Promise<Record<string, SemanticVectorRecord>> {
  if (itemIds.length === 0) return {}
  try {
    const db = await openSemanticDatabase()
    try {
      const wanted = new Set(itemIds)
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(SEMANTIC_STORE_NAME, 'readonly')
        const store = tx.objectStore(SEMANTIC_STORE_NAME)
        const req = store.getAll()
        req.onsuccess = () => {
          const rows = Array.isArray(req.result) ? req.result : []
          const out: Record<string, SemanticVectorRecord> = {}
          for (const row of rows) {
            if (isValidSemanticRecord(row, model) && wanted.has(row.itemId)) {
              out[row.itemId] = row
            }
          }
          resolve(out)
        }
        req.onerror = () => reject(req.error)
      })
    } finally {
      db.close()
    }
  } catch {
    return {}
  }
}

export async function saveSemanticVectors(
  records: readonly SemanticVectorRecord[],
): Promise<boolean> {
  if (records.length === 0) return true
  try {
    const db = await openSemanticDatabase()
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(SEMANTIC_STORE_NAME, 'readwrite')
        const store = tx.objectStore(SEMANTIC_STORE_NAME)
        for (const record of records) {
          if (isValidSemanticRecord(record)) {
            store.put(record)
          }
        }
        const getAllReq = store.getAll()
        getAllReq.onsuccess = () => {
          const rows = Array.isArray(getAllReq.result)
            ? (getAllReq.result as SemanticVectorRecord[])
            : []
          if (rows.length > MAX_STORED_VECTORS) {
            const oldest = [...rows]
              .sort((a, b) => a.updatedAt - b.updatedAt)
              .slice(0, rows.length - MAX_STORED_VECTORS)
            for (const stale of oldest) {
              store.delete(stale.itemId)
            }
          }
        }
        tx.oncomplete = () => resolve(true)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  } catch {
    return false
  }
}

export async function clearSemanticVectors(): Promise<void> {
  try {
    const db = await openSemanticDatabase()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SEMANTIC_STORE_NAME, 'readwrite')
        tx.objectStore(SEMANTIC_STORE_NAME).clear()
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  } catch {
    // ignore storage failures
  }
}

export function clearReaderStorage(): void {
  const keys = [
    'rr.feeds',
    'rr.read',
    'rr.saved',
    'rr.summaries.v1',
    'rr.notify',
    'rr.notified',
    LAST_VISIT_STORAGE_KEY,
    SETTINGS_STORAGE_KEY,
  ]
  try {
    for (const k of keys) localStorage.removeItem(k)
  } catch {
    // ignore storage failures
  }
  void clearSemanticVectors()
  void clearOfflineStorage()
}

/**
 * Read the previous visit ISO timestamp from localStorage (if any), then
 * persist the current visit timestamp so the next session sees new items.
 */
export function initSessionVisitTimestamp(
  key = LAST_VISIT_STORAGE_KEY,
  nowIso = new Date().toISOString(),
): string | null {
  let previous: string | null = null
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = new Date(raw).getTime()
      if (Number.isFinite(parsed)) {
        previous = new Date(parsed).toISOString()
      }
    }
    localStorage.setItem(key, nowIso)
  } catch {
    return null
  }
  return previous
}

export function recordVisitTimestamp(
  key = LAST_VISIT_STORAGE_KEY,
  nowIso = new Date().toISOString(),
): string {
  try {
    localStorage.setItem(key, nowIso)
  } catch {
    // ignore storage failures
  }
  return nowIso
}

export const OFFLINE_CACHE = 'rr-reader-v1'
export const COVER_CACHE = 'rr-covers-v1'
const SNAPSHOT_URL = '/__rr-cache/reader.json'
let snapshotWrites: Promise<unknown> = Promise.resolve()

export interface ReaderSnapshot {
  items: FeedItem[]
  pulse: PulseSnapshot
  feedHealth: Record<string, FeedHealth>
  fetchedAt: string
  selectedId: string | null
  selectedFeed: string
}

/** Preserve real briefing inputs and newest items, not bundled SAMPLE fallback. */
export function prepareSnapshot(snapshot: ReaderSnapshot): ReaderSnapshot {
  const real = snapshot.items.filter((item) => !item.sample)
  const newest = [...real].sort(
    (a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate),
  )
  const highest = selectDailyBriefingItems(real)
  const selected = real.filter((item) => item.id === snapshot.selectedId)
  const items = [
    ...new Map(
      [...newest.slice(0, 200), ...highest.slice(0, 5), ...selected].map(
        (item) => [item.id, item],
      ),
    ).values(),
  ]
  return { ...snapshot, items }
}

export function saveReaderSnapshot(snapshot: ReaderSnapshot): Promise<boolean> {
  const prepared = prepareSnapshot(snapshot)
  const write = snapshotWrites.then(async () => {
    try {
      if (!prepared.items.length || !Number.isFinite(Date.parse(prepared.fetchedAt))) {
        return false
      }
      const cache = await caches.open(OFFLINE_CACHE)
      await cache.put(SNAPSHOT_URL, Response.json(prepared))
      return true
    } catch {
      return false // quota/private-mode restrictions must not break reading
    }
  })
  snapshotWrites = write
  return write
}

export async function loadReaderSnapshot(): Promise<ReaderSnapshot | null> {
  try {
    const response = await (await caches.open(OFFLINE_CACHE)).match(SNAPSHOT_URL)
    if (!response) return null
    const data = (await response.json()) as ReaderSnapshot
    if (
      !Array.isArray(data.items) ||
      !Number.isFinite(Date.parse(data.fetchedAt)) ||
      !data.pulse ||
      !Array.isArray(data.pulse.hn) ||
      !Array.isArray(data.pulse.github) ||
      !data.feedHealth ||
      typeof data.selectedFeed !== 'string' ||
      (data.selectedId !== null && typeof data.selectedId !== 'string') ||
      ![...data.items, ...data.pulse.hn, ...data.pulse.github].every(
        (item) =>
          item &&
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          typeof item.link === 'string' &&
          typeof item.description === 'string' &&
          typeof item.feedId === 'string' &&
          typeof item.feedTitle === 'string' &&
          typeof item.pubDate === 'string',
      )
    ) {
      return null
    }
    return prepareSnapshot(data)
  } catch {
    return null
  }
}

export async function clearOfflineStorage(): Promise<void> {
  const pending = snapshotWrites
  const clear = pending.then(async () => {
    try {
      await Promise.all(
        [
          OFFLINE_CACHE,
          COVER_CACHE,
          'rr-rss-v1',
          'rr-pages-v1',
          'transformers-cache',
        ].map((name) => caches.delete(name)),
      )
    } catch {
      /* Cache API unavailable */
    }
  })
  snapshotWrites = clear
  await clear
}

export type CoverImages = Record<string, string | null>

/** POST cannot enter Cache Storage. Store its result under a synthetic GET key.
 * Return stale metadata immediately; apply revalidated metadata via onFresh.
 * This helper never intercepts requests and never caches any other API.
 */
export async function cachedCoverImages(
  urls: string[],
  onFresh: (images: CoverImages) => void,
): Promise<CoverImages> {
  const key = `/__rr-cache/covers?urls=${encodeURIComponent(JSON.stringify([...urls].sort()))}`
  let cache: Cache | undefined
  let stale: CoverImages | undefined
  try {
    cache = await caches.open(COVER_CACHE)
    const response = await cache.match(key)
    if (response) stale = (await response.json()) as CoverImages
  } catch {
    /* network-only fallback */
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return stale ?? {}
  const revalidate = async (): Promise<CoverImages> => {
    try {
      const response = await fetch('/api/og-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) return stale ?? {}
      const data = (await response.json()) as { images?: CoverImages }
      const images = Object.fromEntries(
        Object.entries(data.images ?? {}).filter(
          ([url, image]) =>
            urls.includes(url) && (image === null || typeof image === 'string'),
        ),
      )
      if (cache) {
        try {
          await cache.put(key, Response.json(images))
          const keys = await cache.keys()
          await Promise.all(
            keys
              .slice(0, Math.max(0, keys.length - 40))
              .map((old) => cache!.delete(old)),
          )
        } catch {
          /* quota failure does not discard fresh metadata */
        }
      }
      onFresh(images)
      return images
    } catch {
      return stale ?? {}
    }
  }
  if (stale) {
    void revalidate()
    return stale
  }
  return revalidate()
}