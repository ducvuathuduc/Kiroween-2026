import { safeHttpUrl } from './format'
import type { SignalDimensions } from './scoring'

export interface FeedItem {
  id: string
  /** FeedSource.id this item came from */
  feedId: string
  feedTitle: string
  title: string
  link: string
  /** ISO date string */
  pubDate: string
  description: string
  /** Raw feed HTML description, always sanitized via Sanitizer API / DOMPurify before rendering */
  descriptionHtml?: string
  /** Optional real image extracted from RSS media:content / media:thumbnail / enclosure / og:image / HTML */
  imageUrl?: string
  /** 0-100 deterministic signal score, set after scoring */
  score?: number
  /** Deterministic 4-dimension breakdown (0-100 each) */
  scoreDimensions?: SignalDimensions
  /** Text used to calculate score when it differs from the feed summary. */
  scoreText?: string
  /** True when this item comes from the bundled offline sample set */
  sample?: boolean
}

export interface FeedSource {
  id: string
  title: string
  url: string
}

export const DEFAULT_FEEDS: FeedSource[] = [
  {
    id: 'aws-news',
    title: 'AWS News Blog',
    url: 'https://aws.amazon.com/blogs/aws/feed/',
  },
  {
    id: 'aws-ml',
    title: 'AWS Machine Learning Blog',
    url: 'https://aws.amazon.com/blogs/machine-learning/feed/',
  },
  { id: 'hn', title: 'Hacker News', url: 'https://hnrss.org/frontpage' },
]

const RSS2JSON_ENDPOINT = 'https://api.rss2json.com/v1/api.json?rss_url='
const ALLORIGINS_ENDPOINT = 'https://api.allorigins.win/raw?url='

interface Rss2JsonEnclosure {
  link?: unknown
  url?: unknown
  thumbnail?: unknown
  type?: unknown
}

interface Rss2JsonItem {
  title?: unknown
  pubDate?: unknown
  link?: unknown
  guid?: unknown
  description?: unknown
  content?: unknown
  thumbnail?: unknown
  enclosure?: unknown
}

export interface Rss2JsonResponse {
  status?: unknown
  message?: unknown
  items?: unknown
}

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i
const TRACKER_IMG_RE = /(1x1|pixel|spacer|blank\.gif|gravatar\.com\/avatar\/000)/i

function validFeedImage(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const safe = safeHttpUrl(raw)
  if (!safe || TRACKER_IMG_RE.test(safe)) return undefined
  return safe
}

export function extractImageFromHtml(html: string): string | undefined {
  if (!html) return undefined
  const matches = html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)
  for (const match of matches) {
    const tag = match[0] ?? ''
    if (/\bwidth=["']?1["']?/i.test(tag) || /\bheight=["']?1["']?/i.test(tag)) {
      continue
    }
    const candidate = validFeedImage(match[1])
    if (candidate) return candidate
  }
  return undefined
}

function extractRss2JsonEnclosureImage(enclosure: unknown): string | undefined {
  if (!enclosure) return undefined
  if (Array.isArray(enclosure)) {
    for (const entry of enclosure) {
      const found = extractRss2JsonEnclosureImage(entry)
      if (found) return found
    }
    return undefined
  }
  if (typeof enclosure !== 'object') return undefined
  const enc = enclosure as Rss2JsonEnclosure
  const fromThumb = validFeedImage(enc.thumbnail)
  if (fromThumb) return fromThumb
  const type = typeof enc.type === 'string' ? enc.type.toLowerCase() : ''
  const rawUrl =
    typeof enc.link === 'string'
      ? enc.link
      : typeof enc.url === 'string'
        ? enc.url
        : ''
  if (type.startsWith('image/') || IMAGE_EXT_RE.test(rawUrl)) {
    return validFeedImage(rawUrl)
  }
  return undefined
}

function extractXmlElementImage(el: Element, rawHtml: string): string | undefined {
  // 1. media:content / media:thumbnail
  const mediaTags = [
    ...el.getElementsByTagName('media:content'),
    ...el.getElementsByTagName('media:thumbnail'),
  ]
  for (const tag of mediaTags) {
    const medium = (tag.getAttribute('medium') ?? '').toLowerCase()
    const type = (tag.getAttribute('type') ?? '').toLowerCase()
    const url = tag.getAttribute('url') ?? ''
    if (
      !medium ||
      medium === 'image' ||
      type.startsWith('image/') ||
      IMAGE_EXT_RE.test(url)
    ) {
      const candidate = validFeedImage(url)
      if (candidate) return candidate
    }
  }

  // 2. enclosure
  const enclosures = [...el.querySelectorAll('enclosure')]
  for (const enc of enclosures) {
    const type = (enc.getAttribute('type') ?? '').toLowerCase()
    const url = enc.getAttribute('url') ?? ''
    if (type.startsWith('image/') || IMAGE_EXT_RE.test(url)) {
      const candidate = validFeedImage(url)
      if (candidate) return candidate
    }
  }

  // 3. XML og:image / image tag if present
  const ogText =
    el.getElementsByTagName('og:image')[0]?.textContent ??
    el.querySelector('image > url')?.textContent ??
    ''
  const fromOg = validFeedImage(ogText)
  if (fromOg) return fromOg

  // 4. First real <img> inside description / content:encoded
  return extractImageFromHtml(rawHtml)
}

export function normalizeDate(rawDate: string): string {
  const trimmed = rawDate.trim()
  if (!trimmed) return new Date().toISOString()
  // rss2json returns UTC timestamps as "YYYY-MM-DD HH:mm:ss" without a Z suffix
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed.replace(' ', 'T')}Z`
    : trimmed
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString()
}

export function stripHtml(html: string): string {
  if (!html) return ''
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
  }
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function parseRss2Json(
  payload: Rss2JsonResponse,
  source: FeedSource,
): FeedItem[] {
  if (payload.status !== 'ok' || !Array.isArray(payload.items)) {
    const reason =
      typeof payload.message === 'string' && payload.message
        ? payload.message
        : 'Invalid feed payload'
    throw new Error(reason)
  }

  return (payload.items as Rss2JsonItem[]).slice(0, 50).map((entry, i) => {
    const rawTitle = typeof entry.title === 'string' ? entry.title : ''
    const rawLink =
      typeof entry.link === 'string'
        ? entry.link
        : typeof entry.guid === 'string'
          ? entry.guid
          : ''
    const guid = typeof entry.guid === 'string' ? entry.guid : ''
    const rawPubDate = typeof entry.pubDate === 'string' ? entry.pubDate : ''
    const rawDescription =
      typeof entry.description === 'string' ? entry.description : ''
    const rawContent = typeof entry.content === 'string' ? entry.content : ''
    const rawHtml = rawContent || rawDescription
    const link = safeHttpUrl(rawLink) ?? ''
    const imageUrl =
      validFeedImage(entry.thumbnail) ??
      extractRss2JsonEnclosureImage(entry.enclosure) ??
      extractImageFromHtml(rawHtml)

    return {
      id: `${source.id}-${i}-${link || guid || rawTitle}`,
      feedId: source.id,
      feedTitle: source.title,
      title: stripHtml(rawTitle) || '(untitled)',
      link,
      pubDate: normalizeDate(rawPubDate),
      description: stripHtml(rawDescription || rawContent),
      descriptionHtml: rawHtml || undefined,
      imageUrl,
    }
  })
}

export function parseFeed(xml: string, source: FeedSource): FeedItem[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const entries = [
    ...doc.querySelectorAll('item'),
    ...doc.querySelectorAll('entry'),
  ]
  if (entries.length === 0 && doc.querySelector('parsererror')) {
    throw new Error(`Invalid RSS/Atom XML from ${source.title}`)
  }

  return entries.slice(0, 50).map((el, i) => {
    const text = (tag: string) =>
      el.querySelector(tag)?.textContent?.trim() ?? ''
    const namespacedText = (tag: string) =>
      el.getElementsByTagName(tag)[0]?.textContent?.trim() ?? ''
    const linkEl = el.querySelector('link')
    const rawLink =
      linkEl?.getAttribute('href') || text('link') || text('guid') || ''
    const link = safeHttpUrl(rawLink) ?? ''
    const rawDate = text('pubDate') || text('updated') || text('published')
    const pubDate = normalizeDate(rawDate)
    const rawHtml =
      namespacedText('content:encoded') ||
      text('description') ||
      text('summary') ||
      text('content')
    const imageUrl = extractXmlElementImage(el, rawHtml)
    return {
      id: `${source.id}-${i}-${link || text('guid') || text('title')}`,
      feedId: source.id,
      feedTitle: source.title,
      title: stripHtml(text('title')) || '(untitled)',
      link,
      pubDate,
      description: stripHtml(rawHtml),
      descriptionHtml: rawHtml || undefined,
      imageUrl,
    }
  })
}

async function fetchViaRss2Json(source: FeedSource): Promise<FeedItem[]> {
  const res = await fetch(
    RSS2JSON_ENDPOINT + encodeURIComponent(source.url),
    { signal: AbortSignal.timeout(6000) },
  )
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${source.title}`)
  }
  const payload = (await res.json()) as Rss2JsonResponse
  const items = parseRss2Json(payload, source)
  if (items.length === 0) {
    throw new Error(`No items returned for ${source.title}`)
  }
  return items
}

async function fetchXmlViaUrl(
  url: string,
  source: FeedSource,
  timeoutMs: number,
): Promise<FeedItem[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${source.title}`)
  }
  const text = await res.text()
  return parseFeed(text, source)
}

/**
 * Fetch an RSS/Atom feed:
 * 1. Primary: same-origin Hono Worker proxy (/api/rss?url=...) for server-side XML fetch
 * 2. Fallback: api.rss2json.com (CORS-enabled JSON bridge)
 * 3. Fallback: api.allorigins.win raw XML proxy + DOMParser
 */
export async function fetchFeed(source: FeedSource): Promise<FeedItem[]> {
  let primaryError: unknown

  try {
    const items = await fetchXmlViaUrl(
      `/api/rss?url=${encodeURIComponent(source.url)}`,
      source,
      7000,
    )
    if (items.length > 0) return items
    primaryError = new Error(`No items returned for ${source.title}`)
  } catch (err) {
    primaryError = err
  }

  try {
    return await fetchViaRss2Json(source)
  } catch (err) {
    if (!primaryError) primaryError = err
  }

  try {
    return await fetchXmlViaUrl(
      ALLORIGINS_ENDPOINT + encodeURIComponent(source.url),
      source,
      4500,
    )
  } catch (fallbackErr) {
    if (primaryError instanceof Error) throw primaryError
    throw fallbackErr
  }
}
