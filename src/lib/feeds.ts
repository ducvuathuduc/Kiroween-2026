import { safeHttpUrl } from './format'

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
  /** 0-100 deterministic signal score, set after scoring */
  score?: number
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

const PROXY = 'https://api.allorigins.win/raw?url='

export async function fetchFeed(source: FeedSource): Promise<FeedItem[]> {
  const res = await fetch(PROXY + encodeURIComponent(source.url), {
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${source.title}`)
  const text = await res.text()
  return parseFeed(text, source)
}

function normalizeDate(rawDate: string): string {
  if (!rawDate) return new Date().toISOString()
  const parsed = new Date(rawDate)
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString()
}

export function parseFeed(xml: string, source: FeedSource): FeedItem[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const entries = [
    ...doc.querySelectorAll('item'),
    ...doc.querySelectorAll('entry'),
  ]
  return entries.slice(0, 50).map((el, i) => {
    const text = (tag: string) =>
      el.querySelector(tag)?.textContent?.trim() ?? ''
    const linkEl = el.querySelector('link')
    const rawLink =
      linkEl?.getAttribute('href') || text('link') || text('guid') || ''
    const link = safeHttpUrl(rawLink) ?? ''
    const rawDate = text('pubDate') || text('updated') || text('published')
    const pubDate = normalizeDate(rawDate)
    const rawHtml =
      text('content\\:encoded') ||
      text('description') ||
      text('summary') ||
      text('content')
    return {
      id: `${source.id}-${i}-${link || text('guid') || text('title')}`,
      feedId: source.id,
      feedTitle: source.title,
      title: stripHtml(text('title')) || '(untitled)',
      link,
      pubDate,
      description: stripHtml(rawHtml),
      descriptionHtml: rawHtml || undefined,
    }
  })
}

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}
