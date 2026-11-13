import { DEFAULT_FEEDS, parseRss2Json, type FeedItem, type Rss2JsonResponse } from '../src/lib/feeds.ts'
import { explainScore } from '../src/lib/scoring.ts'

interface LiveItems {
  items: FeedItem[]
  errors: { feedId: string; error: string }[]
}

let cached: { data: LiveItems; expiresAt: number } | undefined
let pending: Promise<LiveItems> | undefined

/** Load only real default-feed items; never use the browser's offline samples. */
export async function loadItems(): Promise<LiveItems> {
  if (cached && cached.expiresAt > Date.now()) return cached.data
  if (pending) return pending

  pending = (async () => {
    const results = await Promise.allSettled(DEFAULT_FEEDS.map(async (source) => {
      const response = await fetch(
        `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}`,
        { signal: AbortSignal.timeout(6000) },
      )
      if (!response.ok) throw new Error(`Feed HTTP ${response.status}`)
      const payload = await response.json() as Rss2JsonResponse
      return parseRss2Json(payload, source).map((item) => {
        const scored = explainScore(item.title, item.description, item.pubDate, item)
        return { ...item, score: scored.score, scoreDimensions: scored.dimensions }
      })
    }))
    const data: LiveItems = { items: [], errors: [] }
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        data.items.push(...result.value)
      } else {
        data.errors.push({
          feedId: DEFAULT_FEEDS[index].id,
          error: result.reason instanceof Error ? result.reason.message : 'Feed unavailable',
        })
      }
    })
    if (data.items.length === 0) throw new Error('No live feed items are available. Retry later.')
    data.items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || Date.parse(b.pubDate) - Date.parse(a.pubDate))
    cached = { data, expiresAt: Date.now() + 5 * 60_000 }
    return data
  })()
  try {
    return await pending
  } finally {
    pending = undefined
  }
}

export async function getItem(id: string): Promise<FeedItem> {
  const { items } = await loadItems()
  const item = items.find((entry) => entry.id === id)
  if (!item) throw new Error('Item not found in the current live feeds. Search again for a current item ID.')
  return item
}
