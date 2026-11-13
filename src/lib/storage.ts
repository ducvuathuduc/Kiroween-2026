import { sanitizeProviderId, type AIProviderId } from './providers'
import type { FeedItem } from './feeds'
import { selectDailyBriefingItems, type FeedHealth } from './briefing'
import type { PulseSnapshot } from './pulse'

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
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  density: 'comfortable',
  defaultFilter: 'all',
  reducedMotion: 'system',
  aiProvider: 'gemini',
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
  return { density, defaultFilter, reducedMotion, aiProvider }
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
  const newest = [...real].sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate))
  const highest = selectDailyBriefingItems(real)
  const selected = real.filter((item) => item.id === snapshot.selectedId)
  const items = [...new Map([...newest.slice(0, 200), ...highest.slice(0, 5), ...selected]
    .map((item) => [item.id, item])).values()]
  return { ...snapshot, items }
}

export function saveReaderSnapshot(snapshot: ReaderSnapshot): Promise<boolean> {
  const prepared = prepareSnapshot(snapshot)
  const write = snapshotWrites.then(async () => {
    try {
      if (!prepared.items.length || !Number.isFinite(Date.parse(prepared.fetchedAt))) return false
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
    const data = await response.json() as ReaderSnapshot
    if (!Array.isArray(data.items) || !Number.isFinite(Date.parse(data.fetchedAt)) ||
      !data.pulse || !Array.isArray(data.pulse.hn) || !Array.isArray(data.pulse.github) ||
      !data.feedHealth || typeof data.selectedFeed !== 'string' ||
      (data.selectedId !== null && typeof data.selectedId !== 'string') ||
      ![...data.items, ...data.pulse.hn, ...data.pulse.github].every((item) =>
        item && typeof item.id === 'string' && typeof item.title === 'string' &&
        typeof item.link === 'string' && typeof item.description === 'string' &&
        typeof item.feedId === 'string' && typeof item.feedTitle === 'string' &&
        typeof item.pubDate === 'string')) return null
    return prepareSnapshot(data)
  } catch {
    return null
  }
}

export async function clearOfflineStorage(): Promise<void> {
  const pending = snapshotWrites
  const clear = pending.then(async () => {
    try {
      await Promise.all([OFFLINE_CACHE, COVER_CACHE, 'rr-rss-v1', 'rr-pages-v1']
        .map((name) => caches.delete(name)))
    } catch { /* Cache API unavailable */ }
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
  urls: string[], onFresh: (images: CoverImages) => void,
): Promise<CoverImages> {
  const key = `/__rr-cache/covers?urls=${encodeURIComponent(JSON.stringify([...urls].sort()))}`
  let cache: Cache | undefined
  let stale: CoverImages | undefined
  try {
    cache = await caches.open(COVER_CACHE)
    const response = await cache.match(key)
    if (response) stale = await response.json() as CoverImages
  } catch { /* network-only fallback */ }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return stale ?? {}
  const revalidate = async (): Promise<CoverImages> => {
    try {
      const response = await fetch('/api/og-images', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }), signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) return stale ?? {}
      const data = await response.json() as { images?: CoverImages }
      const images = Object.fromEntries(Object.entries(data.images ?? {})
        .filter(([url, image]) => urls.includes(url) && (image === null || typeof image === 'string')))
      if (cache) {
        try {
          await cache.put(key, Response.json(images))
          const keys = await cache.keys()
          await Promise.all(keys.slice(0, Math.max(0, keys.length - 40)).map((old) => cache!.delete(old)))
        } catch { /* quota failure does not discard fresh metadata */ }
      }
      onFresh(images)
      return images
    } catch { return stale ?? {} }
  }
  if (stale) { void revalidate(); return stale }
  return revalidate()
}
