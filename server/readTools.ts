import { selectDailyBriefingItems } from '../src/lib/briefing.ts'
import { DEFAULT_FEEDS } from '../src/lib/feeds.ts'
import { buildKiroSpecBundle } from '../src/lib/kiroTask.ts'
import {
  isValidFeedId,
  newsletterFeedToFeedSource,
  type NewsletterFeedRecord,
  type NewsletterStore,
} from '../src/lib/newsletter.ts'
import {
  buildFeedActivity,
  buildItemRadarData,
  buildScoreHistogram,
  computeRadarSummary,
  getItemDimensions,
} from '../src/lib/radar.ts'
import { explainScore } from '../src/lib/scoring.ts'
import { getItem, loadItems } from './items.ts'
import {
  resurfaceSecondBrain,
  type LiveAiEnv,
  type ResurfaceCandidateInput,
} from './liveAi.ts'

export const SIGNAL_WEIGHTS = {
  relevance: 0.42,
  recency: 0.24,
  authority: 0.18,
  novelty: 0.16,
} as const

/** Shared read-only capabilities; neither protocol adapter calls paid AI. */
export async function searchItems({
  query = '',
  feedId,
  limit = 20,
  minScore = 0,
}: {
  query?: string
  feedId?: string
  limit?: number
  minScore?: number
} = {}) {
  const { items, errors } = await loadItems()
  const needle = query.trim().toLowerCase()
  return {
    items: items
      .filter((item) => {
        if (feedId && item.feedId !== feedId) return false
        if ((item.score ?? 0) < minScore) return false
        if (!needle) return true
        return `${item.title} ${item.description}`.toLowerCase().includes(needle)
      })
      .slice(0, limit),
    errors,
  }
}

export async function dailyBriefing(limit = 5) {
  const { items, errors } = await loadItems()
  return { items: selectDailyBriefingItems(items, limit), errors }
}

export async function exportKiroTask(id: string) {
  return buildKiroSpecBundle(await getItem(id))
}

export async function getSignalScores({
  itemId,
  feedId,
  limit = 10,
}: {
  itemId?: string
  feedId?: string
  limit?: number
} = {}) {
  const { items, errors } = await loadItems()

  if (itemId) {
    const item = items.find((entry) => entry.id === itemId)
    if (!item) {
      throw new Error(
        'Item not found in the current live feeds. Call get_feed_items or get_daily_briefing for a current item ID.',
      )
    }
    const explained = explainScore(item.title, item.description, item.pubDate, item)
    return {
      scoringMethod: 'deterministic-4d' as const,
      weights: SIGNAL_WEIGHTS,
      item: {
        id: item.id,
        feedId: item.feedId,
        feedTitle: item.feedTitle,
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        score: item.score ?? explained.score,
        dimensions: getItemDimensions(item),
        axes: buildItemRadarData(item),
        reasons: explained.reasons,
      },
      errors,
    }
  }

  const pool = feedId ? items.filter((entry) => entry.feedId === feedId) : items
  return {
    scoringMethod: 'deterministic-4d' as const,
    weights: SIGNAL_WEIGHTS,
    feeds: DEFAULT_FEEDS,
    summary: computeRadarSummary(pool),
    histogram: buildScoreHistogram(pool),
    feedActivity: buildFeedActivity(pool),
    items: pool.slice(0, limit).map((item) => ({
      id: item.id,
      feedId: item.feedId,
      feedTitle: item.feedTitle,
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      score: item.score ?? 0,
      dimensions: getItemDimensions(item),
      axes: buildItemRadarData(item),
    })),
    errors,
  }
}

export async function resurfacePastRead({
  query,
  itemId,
  pastReads = [],
  minAgeDays = 0,
  limit = 5,
  env,
}: {
  query?: string
  itemId?: string
  pastReads?: ResurfaceCandidateInput[]
  minAgeDays?: number
  limit?: number
  env?: LiveAiEnv
} = {}) {
  let topStory:
    | { id: string; title: string; description?: string; feedTitle?: string }
    | undefined
  let resolvedQuery = query?.trim() ?? ''

  if (itemId) {
    const story = await getItem(itemId)
    topStory = {
      id: story.id,
      title: story.title,
      description: story.description,
      feedTitle: story.feedTitle,
    }
    if (!resolvedQuery) {
      resolvedQuery = `${story.title} ${story.description}`.trim()
    }
  } else if (!resolvedQuery) {
    const { items } = await loadItems()
    const [lead] = selectDailyBriefingItems(items, 1)
    if (lead) {
      topStory = {
        id: lead.id,
        title: lead.title,
        description: lead.description,
        feedTitle: lead.feedTitle,
      }
      resolvedQuery = `${lead.title} ${lead.description}`.trim()
    }
  }

  const result = await resurfaceSecondBrain(
    {
      query: resolvedQuery,
      topStory,
      candidates: pastReads,
      minAgeDays,
      limit,
    },
    env,
  )

  return {
    ...result,
    ...(topStory
      ? {
          anchorStory: {
            id: topStory.id,
            title: topStory.title,
            feedTitle: topStory.feedTitle,
          },
        }
      : {}),
    ...(pastReads.length === 0 && result.mode !== 'workers-ai-vectorize'
      ? {
          note: 'MCP is stateless and has no browser localStorage; pass read/saved records in pastReads or query a Worker bound to Vectorize.',
        }
      : {}),
  }
}

function formatNewsletterSummary(
  feed: NewsletterFeedRecord,
  includeEntries: boolean,
  entryLimit: number,
) {
  const source = newsletterFeedToFeedSource(feed)
  return {
    ...source,
    atomUrl: `/atom/${feed.id}`,
    jsonUrl: `/json/${feed.id}`,
    entryCount: feed.entries.length,
    latestReceivedAt: feed.entries[0]?.receivedAt ?? null,
    ...(includeEntries
      ? {
          entries: feed.entries.slice(0, entryLimit).map((entry) => ({
            id: entry.id,
            subject: entry.subject,
            from: entry.from,
            receivedAt: entry.receivedAt,
            link: entry.link,
            preview: entry.text.slice(0, 280),
          })),
        }
      : {}),
  }
}

export async function listNewsletters(
  store: NewsletterStore,
  {
    feedId,
    includeEntries = false,
    entryLimit = 5,
  }: {
    feedId?: string
    includeEntries?: boolean
    entryLimit?: number
  } = {},
) {
  if (feedId) {
    if (!isValidFeedId(feedId)) {
      throw new Error('Newsletter feed not found.')
    }
    const feed = await store.getFeed(feedId)
    if (!feed) {
      throw new Error('Newsletter feed not found.')
    }
    return {
      newsletters: [formatNewsletterSummary(feed, includeEntries, entryLimit)],
      count: 1,
    }
  }

  const feeds = await store.listFeeds()
  return {
    newsletters: feeds.map((feed) =>
      formatNewsletterSummary(feed, includeEntries, entryLimit),
    ),
    count: feeds.length,
    ...(feeds.length === 0
      ? {
          note: 'No newsletter feeds are currently registered on this Worker instance.',
        }
      : {}),
  }
}
