import type { FeedItem } from './feeds'
import { safeHttpUrl } from './format'
import { explainScore } from './scoring'

export type PulseChannel = 'hn' | 'github'

export interface PulseItem extends FeedItem {
  pulseChannel: PulseChannel
  metricLabel: string
  metaNote?: string
}

export interface PulseSnapshot {
  hn: PulseItem[]
  github: PulseItem[]
  fetchedAt: string
  cached: boolean
  errors: {
    hn?: string
    github?: string
  }
}

const PULSE_STORAGE_KEY = 'rr.pulse.v2'
const PULSE_TTL_MS = 30 * 60_000
let sessionFetched = false

interface CachedPulse {
  hn: PulseItem[]
  github: PulseItem[]
  fetchedAt: string
}

function readCachedPulse(): CachedPulse | null {
  try {
    const raw = localStorage.getItem(PULSE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CachedPulse>
    if (
      !Array.isArray(parsed.hn) ||
      !Array.isArray(parsed.github) ||
      typeof parsed.fetchedAt !== 'string'
    ) {
      return null
    }
    return {
      hn: parsed.hn,
      github: parsed.github,
      fetchedAt: parsed.fetchedAt,
    }
  } catch {
    return null
  }
}

function writeCachedPulse(data: CachedPulse): void {
  try {
    localStorage.setItem(PULSE_STORAGE_KEY, JSON.stringify(data))
  } catch {
    // storage full or unavailable
  }
}

interface HnStoryRaw {
  id: number
  type?: string
  title?: string
  url?: string
  by?: string
  score?: number
  descendants?: number
  time?: number
}

interface GithubRepoRaw {
  id: number
  full_name: string
  html_url: string
  description: string | null
  stargazers_count: number
  language: string | null
  created_at: string
  topics?: string[]
  owner?: {
    avatar_url?: string
  }
}

export function mapHnStory(story: HnStoryRaw): PulseItem | null {
  if (!story || !story.title || story.type !== 'story') return null
  const pubDate = story.time
    ? new Date(story.time * 1000).toISOString()
    : new Date().toISOString()
  const points = story.score ?? 0
  const comments = story.descendants ?? 0
  const link =
    story.url || `https://news.ycombinator.com/item?id=${story.id}`
  const discussionUrl = `https://news.ycombinator.com/item?id=${story.id}`
  const description = `Hacker News story by ${story.by ?? 'builder'} with ${points} points and ${comments} comments. Discussion: ${discussionUrl}`
  const breakdown = explainScore(story.title, description, pubDate, {
    feedId: 'pulse-hn',
    feedTitle: 'HN Top Stories',
    link,
  })
  return {
    id: `pulse-hn-${story.id}`,
    feedId: 'pulse-hn',
    feedTitle: 'HN Top Stories',
    title: story.title,
    link,
    pubDate,
    description,
    score: breakdown.score,
    scoreDimensions: breakdown.dimensions,
    pulseChannel: 'hn',
    metricLabel: `${points} pts · ${comments} cmt`,
    metaNote: story.by ? `by ${story.by}` : undefined,
  }
}

export function mapGithubRepo(repo: GithubRepoRaw): PulseItem {
  const pubDate = repo.created_at || new Date().toISOString()
  const desc = repo.description?.trim() || 'Open-source AWS repository on GitHub.'
  const topics = Array.isArray(repo.topics) ? repo.topics.slice(0, 6).join(', ') : 'aws'
  const fullDesc = `${desc} (Topics: ${topics}. Language: ${repo.language ?? 'Multi-language'}. ${repo.stargazers_count} stars on GitHub.)`
  const breakdown = explainScore(`${repo.full_name} aws`, fullDesc, pubDate, {
    feedId: 'pulse-github',
    feedTitle: 'GitHub AWS',
    link: repo.html_url,
  })
  const imageUrl = repo.owner?.avatar_url
    ? safeHttpUrl(repo.owner.avatar_url) ?? undefined
    : undefined

  return {
    id: `pulse-gh-${repo.id}`,
    feedId: 'pulse-github',
    feedTitle: 'GitHub AWS',
    title: repo.full_name,
    link: repo.html_url,
    pubDate,
    description: fullDesc,
    imageUrl,
    score: breakdown.score,
    scoreDimensions: breakdown.dimensions,
    pulseChannel: 'github',
    metricLabel: `★ ${repo.stargazers_count.toLocaleString()}`,
    metaNote: repo.language ?? undefined,
  }
}

async function fetchHnTopStories(): Promise<PulseItem[]> {
  const topRes = await fetch(
    'https://hacker-news.firebaseio.com/v0/topstories.json',
    { signal: AbortSignal.timeout(6000) },
  )
  if (!topRes.ok) throw new Error(`HN HTTP ${topRes.status}`)
  const ids = ((await topRes.json()) as number[]).slice(0, 18)
  const rawItems = await Promise.all(
    ids.map(async (id) => {
      const res = await fetch(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        { signal: AbortSignal.timeout(5000) },
      )
      if (!res.ok) return null
      return (await res.json()) as HnStoryRaw
    }),
  )
  return rawItems
    .map((story) => (story ? mapHnStory(story) : null))
    .filter((item): item is PulseItem => item !== null)
}

async function fetchGithubAwsTrending(): Promise<PulseItem[]> {
  const since = new Date(Date.now() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const query = encodeURIComponent(`topic:aws created:>${since}`)
  const res = await fetch(
    `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=15`,
    {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(6000),
    },
  )
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`)
  const payload = (await res.json()) as { items?: GithubRepoRaw[] }
  return (payload.items ?? []).map(mapGithubRepo)
}

/**
 * Fetch live Community Pulse (HN Firebase top stories + GitHub topic:aws repos).
 * Cached in localStorage with a 30-min TTL + one-call-per-session guard unless forced.
 */
export async function fetchCommunityPulse(
  force = false,
): Promise<PulseSnapshot> {
  const cached = readCachedPulse()
  if (!force && cached) {
    const ageMs = Date.now() - new Date(cached.fetchedAt).getTime()
    const fresh = Number.isFinite(ageMs) && ageMs < PULSE_TTL_MS
    if (sessionFetched || fresh) {
      return { ...cached, cached: true, errors: {} }
    }
  }

  sessionFetched = true
  const [hnResult, ghResult] = await Promise.allSettled([
    fetchHnTopStories(),
    fetchGithubAwsTrending(),
  ])

  const errors: PulseSnapshot['errors'] = {}
  const hn =
    hnResult.status === 'fulfilled'
      ? hnResult.value
      : ((errors.hn =
          hnResult.reason instanceof Error
            ? hnResult.reason.message
            : 'HN unavailable'),
        cached?.hn ?? [])

  const github =
    ghResult.status === 'fulfilled'
      ? ghResult.value
      : ((errors.github =
          ghResult.reason instanceof Error
            ? ghResult.reason.message
            : 'GitHub unavailable'),
        cached?.github ?? [])

  const fetchedAt = new Date().toISOString()
  if (hn.length > 0 || github.length > 0) {
    writeCachedPulse({ hn, github, fetchedAt })
  }

  return {
    hn,
    github,
    fetchedAt,
    cached: false,
    errors,
  }
}
