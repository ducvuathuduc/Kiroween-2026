import { sanitizeProviderId, type AIProviderId } from './providers'

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

