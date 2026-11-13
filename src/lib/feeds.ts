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
  const res = await fetch(PROXY + encodeURIComponent(source.url))
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${source.title}`)
  const text = await res.text()
  return parseFeed(text, source)
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
    const link =
      linkEl?.getAttribute('href') || text('link') || text('guid') || ''
    const rawDate = text('pubDate') || text('updated') || text('published')
    const pubDate = rawDate
      ? new Date(rawDate).toISOString()
      : new Date().toISOString()
    return {
      id: `${source.id}-${i}-${link}`,
      feedId: source.id,
      feedTitle: source.title,
      title: stripHtml(text('title')) || '(untitled)',
      link,
      pubDate,
      description: stripHtml(
        text('description') || text('summary') || text('content'),
      ),
    }
  })
}

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}
