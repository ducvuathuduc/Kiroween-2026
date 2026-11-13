import type { FeedItem, FeedSource } from './feeds'
import { ROUTES, type NavigableRoute } from './routes'

export type CommandViewId = NavigableRoute

export interface FeedHealth {
  lastFetchedAt: string
  itemCount: number
  ok: boolean
  error?: string
}

export interface CommandTarget {
  id: string
  kind: 'view' | 'feed' | 'item'
  label: string
  subtitle: string
  badge?: string
  viewId?: CommandViewId
  feedId?: string
  itemId?: string
  matchScore: number
}

/** Determine whether an item was published strictly after the previous visit timestamp. */
export function isNewSince(pubDate: string, lastVisitIso: string | null): boolean {
  if (!lastVisitIso) return false
  const pubMs = new Date(pubDate).getTime()
  const visitMs = new Date(lastVisitIso).getTime()
  if (!Number.isFinite(pubMs) || !Number.isFinite(visitMs)) return false
  return pubMs > visitMs
}

export function countNewSince(
  items: ReadonlyArray<FeedItem>,
  lastVisitIso: string | null,
): number {
  if (!lastVisitIso) return 0
  let count = 0
  for (const item of items) {
    if (isNewSince(item.pubDate, lastVisitIso)) count += 1
  }
  return count
}

/** Select the top N high-signal items for the Daily Briefing (deduped by id and link). */
export function selectDailyBriefingItems(
  items: ReadonlyArray<FeedItem>,
  limit = 5,
): FeedItem[] {
  const sorted = [...items].sort((a, b) => {
    const scoreDiff = (b.score ?? 0) - (a.score ?? 0)
    if (scoreDiff !== 0) return scoreDiff
    return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  })

  const seenIds = new Set<string>()
  const seenLinks = new Set<string>()
  const selected: FeedItem[] = []

  for (const item of sorted) {
    if (seenIds.has(item.id)) continue
    const normLink = item.link.trim()
    if (normLink && seenLinks.has(normLink)) continue
    seenIds.add(item.id)
    if (normLink) seenLinks.add(normLink)
    selected.push(item)
    if (selected.length >= limit) break
  }

  return selected
}

/** Deterministic fuzzy subsequence + prefix + token matcher (-1 if no match). */
export function fuzzyMatchScore(query: string, candidate: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const text = candidate.toLowerCase()

  const exactIdx = text.indexOf(q)
  if (exactIdx === 0) return 1000 - text.length * 0.05
  if (exactIdx > 0) return 750 - exactIdx - text.length * 0.02

  // Word-start subsequence or character subsequence
  const tokens = q.split(/\s+/).filter(Boolean)
  if (tokens.length > 1 && tokens.every((tok) => text.includes(tok))) {
    return 600 - text.length * 0.05
  }

  let qi = 0
  let streak = 0
  let bonus = 0
  let firstMatch = -1

  for (let ti = 0; ti < text.length && qi < q.length; ti += 1) {
    if (text[ti] === q[qi]) {
      if (firstMatch === -1) firstMatch = ti
      streak += 1
      const atBoundary =
        ti === 0 ||
        text[ti - 1] === ' ' ||
        text[ti - 1] === '-' ||
        text[ti - 1] === '/'
      bonus += streak * 8 + (atBoundary ? 18 : 0)
      qi += 1
    } else {
      streak = 0
    }
  }

  if (qi < q.length) return -1
  return 200 + bonus - firstMatch
}

export function searchCommandTargets(params: {
  feeds: ReadonlyArray<FeedSource>
  items: ReadonlyArray<FeedItem>
  query: string
  limit?: number
}): CommandTarget[] {
  const { feeds, items, query, limit = 14 } = params
  const q = query.trim()

  const viewTargets: CommandTarget[] = ROUTES.map((r, idx) => ({
    id: `cmd-view-${r.id}`,
    kind: 'view' as const,
    label: r.label,
    subtitle: `${r.path} · ${r.description}`,
    badge: idx < 4 ? 'View' : 'Page',
    viewId: r.id,
    matchScore: q
      ? fuzzyMatchScore(q, `${r.label} ${r.path} ${r.description}`)
      : 900 - idx * 10,
  })).filter((t) => t.matchScore >= 0)

  const feedEntries: Array<{ id: string; title: string; subtitle: string }> = [
    { id: 'all', title: 'All items', subtitle: 'Combined RSS feed stream' },
    {
      id: 'pulse:hn',
      title: 'HN Top Stories',
      subtitle: 'Live Hacker News builder pulse',
    },
    {
      id: 'pulse:github',
      title: 'GitHub AWS',
      subtitle: 'Trending topic:aws repositories',
    },
    ...feeds.map((f) => ({
      id: f.id,
      title: f.title,
      subtitle: f.url,
    })),
  ]

  const feedTargets: CommandTarget[] = feedEntries
    .map((f) => ({
      id: `cmd-feed-${f.id}`,
      kind: 'feed' as const,
      label: f.title,
      subtitle: f.subtitle,
      badge: 'Feed',
      feedId: f.id,
      matchScore: q ? fuzzyMatchScore(q, `${f.title} ${f.subtitle}`) : 700,
    }))
    .filter((t) => t.matchScore >= 0)

  const itemTargets: CommandTarget[] = items
    .map((it) => {
      const m = q
        ? fuzzyMatchScore(q, `${it.title} ${it.feedTitle}`)
        : 400 + (it.score ?? 0)
      return {
        id: `cmd-item-${it.id}`,
        kind: 'item' as const,
        label: it.title,
        subtitle: it.feedTitle,
        badge: `${it.score ?? 0}`,
        itemId: it.id,
        matchScore: m,
      }
    })
    .filter((t) => t.matchScore >= 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, q ? 10 : 6)

  return [...viewTargets, ...feedTargets, ...itemTargets]
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit)
}

/** Run async tasks over an array with bounded concurrency. */
export async function runWithConcurrency<T>(
  items: ReadonlyArray<T>,
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return
  const poolSize = Math.max(1, Math.min(limit, items.length))
  let index = 0
  await Promise.all(
    Array.from({ length: poolSize }, async () => {
      while (index < items.length) {
        const current = items[index]
        index += 1
        if (current !== undefined) {
          await worker(current)
        }
      }
    }),
  )
}

