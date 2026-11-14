import PostalMime from 'postal-mime'
import {
  extractImageFromHtml,
  normalizeDate,
  type FeedItem,
  type FeedSource,
} from './feeds'
import { safeHttpUrl } from './format'

export const DEFAULT_NEWSLETTER_DOMAIN = 'newsletter.resurrected-reader.invalid'
export const MAX_RAW_EMAIL_BYTES = 1024 * 1024 // 1 MiB
export const MAX_NEWSLETTER_FEEDS = 50
export const MAX_NEWSLETTER_ENTRIES = 50

export interface NewsletterEntry {
  id: string
  messageId?: string
  contentHash: string
  subject: string
  from: string
  fromName?: string
  fromAddress?: string
  receivedAt: string
  html?: string
  text: string
  link: string
}

export interface NewsletterFeedRecord {
  id: string
  mailboxId: string
  title: string
  inboundAddress: string
  createdAt: string
  entries: NewsletterEntry[]
}

export interface CreateNewsletterFeedInput {
  title: string
  domain?: string
  id?: string
  mailboxId?: string
  createdAt?: string
}

export interface ParseRawEmailOptions {
  receivedAt?: string
  defaultTitle?: string
}

export interface ImportEmailResult {
  feed: NewsletterFeedRecord
  entry: NewsletterEntry
  duplicate: boolean
}

export interface NewsletterStore {
  listFeeds(): Promise<NewsletterFeedRecord[]>
  createFeed(input: CreateNewsletterFeedInput): Promise<NewsletterFeedRecord>
  getFeed(feedId: string): Promise<NewsletterFeedRecord | null>
  getFeedByMailbox(mailboxId: string): Promise<NewsletterFeedRecord | null>
  deleteFeed(feedId: string): Promise<boolean>
  importEmail(
    feedId: string,
    raw: string | ArrayBuffer | Uint8Array,
    options?: ParseRawEmailOptions,
  ): Promise<ImportEmailResult | null>
  syncFeed(feed: NewsletterFeedRecord): Promise<NewsletterFeedRecord>
}

const MAILBOX_NOUNS = [
  'amber',
  'atlas',
  'beacon',
  'cedar',
  'cobalt',
  'delta',
  'echo',
  'ember',
  'falcon',
  'fjord',
  'granite',
  'harbor',
  'indigo',
  'kestrel',
  'lambda',
  'lantern',
  'lumen',
  'meridian',
  'nebula',
  'nova',
  'obsidian',
  'orion',
  'pulse',
  'quartz',
  'relay',
  'river',
  'saffron',
  'signal',
  'slate',
  'solar',
  'spruce',
  'stratus',
  'summit',
  'vector',
] as const

const FEED_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/

/**
 * Generate a 128-bit cryptographically random unpadded base64url feed ID
 * (22 URL-safe chars), decoupled from the inbound mailbox local part.
 */
export function generateFeedId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function isValidFeedId(id: string): boolean {
  return FEED_ID_PATTERN.test(id)
}

/** Generate a human-readable inbound mailbox local-part (`noun.noun.NN`). */
export function generateMailboxId(): string {
  const random = new Uint32Array(3)
  crypto.getRandomValues(random)
  const first = MAILBOX_NOUNS[random[0] % MAILBOX_NOUNS.length]
  const second = MAILBOX_NOUNS[random[1] % MAILBOX_NOUNS.length]
  const suffix = 10 + (random[2] % 90)
  return `${first}.${second}.${suffix}`
}

export function normalizeMailboxLocalPart(rawRecipient: string): string {
  const addressPart = rawRecipient.includes('<')
    ? rawRecipient.replace(/^.*<([^>]+)>.*$/, '$1')
    : rawRecipient
  const local = addressPart.split('@')[0]?.trim().toLowerCase() ?? ''
  return local.split('+')[0]?.trim() ?? ''
}

export function createNewsletterFeedRecord(
  input: CreateNewsletterFeedInput,
): NewsletterFeedRecord {
  const cleanTitle = input.title.trim().slice(0, 120)
  if (!cleanTitle) {
    throw new Error('Newsletter feed title is required.')
  }
  const id =
    input.id && isValidFeedId(input.id) ? input.id : generateFeedId()
  const mailboxId =
    input.mailboxId && /^[a-z0-9._-]{3,64}$/i.test(input.mailboxId)
      ? input.mailboxId.toLowerCase()
      : generateMailboxId()
  const domain = (input.domain?.trim() || DEFAULT_NEWSLETTER_DOMAIN).replace(
    /^@+/,
    '',
  )
  return {
    id,
    mailboxId,
    title: cleanTitle,
    inboundAddress: `${mailboxId}@${domain}`,
    createdAt: normalizeDate(input.createdAt ?? new Date().toISOString()),
    entries: [],
  }
}

export function stripIllegalXmlChars(input: string): string {
  let out = ''
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i)
    const isIllegal =
      code === 0x7f || (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d)
    if (!isIllegal) out += input[i]
  }
  return out
}

export function escapeXml(input: string): string {
  return stripIllegalXmlChars(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const code = Number.parseInt(dec, 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : ''
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : ''
    })
}

export function htmlToPlainText(html: string): string {
  if (!html) return ''
  const withoutHiddenBlocks = html
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')

  const withLineBreaks = withoutHiddenBlocks
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article|blockquote)>/gi, '\n')

  const stripped = decodeHtmlEntities(withLineBreaks.replace(/<[^>]+>/g, ' '))
  return stripIllegalXmlChars(stripped)
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function extractFirstSafeLink(html?: string, text?: string): string {
  const candidates: string[] = []
  if (html) {
    const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi
    for (const match of html.matchAll(anchorRe)) {
      const safe = safeHttpUrl(decodeHtmlEntities(match[1] ?? ''))
      if (safe) candidates.push(safe)
    }
  }
  if (text) {
    const urlRe = /\bhttps?:\/\/[^\s<>"')\]}]+/gi
    for (const match of text.matchAll(urlRe)) {
      const safe = safeHttpUrl(match[0].replace(/[.,;:!?]+$/, ''))
      if (safe) candidates.push(safe)
    }
  }

  const preferred = candidates.find(
    (url) =>
      !/unsubscribe|manage-preferences|opt-?out|tracking|pixel/i.test(url),
  )
  return preferred ?? candidates[0] ?? ''
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function byteLengthOfRaw(raw: string | ArrayBuffer | Uint8Array): number {
  if (typeof raw === 'string') return new TextEncoder().encode(raw).byteLength
  if (raw instanceof Uint8Array) return raw.byteLength
  return raw.byteLength
}

function formatFromAddress(from?: {
  name?: string
  address?: string
}): { display: string; name?: string; address?: string } {
  const name = from?.name?.trim() || undefined
  const address = from?.address?.trim() || undefined
  if (name && address) {
    return { display: `${name} <${address}>`, name, address }
  }
  if (address) return { display: address, address }
  if (name) return { display: name, name }
  return { display: 'Unknown sender' }
}

/**
 * Parse a raw RFC 822 / MIME email into a normalized NewsletterEntry using
 * `postal-mime` so UTF-8 RFC 2047 headers, quoted-printable, and multipart
 * HTML/text decode cleanly across Node, Cloudflare Workers, and browsers.
 */
export async function parseRawEmail(
  raw: string | ArrayBuffer | Uint8Array,
  options: ParseRawEmailOptions = {},
): Promise<NewsletterEntry> {
  const bytes = byteLengthOfRaw(raw)
  if (bytes === 0 || (typeof raw === 'string' && !raw.trim())) {
    throw new Error('Raw email input cannot be empty.')
  }
  if (bytes > MAX_RAW_EMAIL_BYTES) {
    throw new Error('Raw email exceeds the 1 MiB size limit.')
  }

  const email = await PostalMime.parse(raw)
  const subject = stripIllegalXmlChars(email.subject ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  const html = email.html ? stripIllegalXmlChars(email.html).trim() : ''
  const rawText = email.text
    ? stripIllegalXmlChars(email.text).replace(/\r\n/g, '\n').trim()
    : ''
  const text = rawText || (html ? htmlToPlainText(html) : '')

  if (!subject && !text && !html) {
    throw new Error('Raw email must include a subject or body content.')
  }

  const sender = formatFromAddress(
    email.from && 'address' in email.from
      ? email.from
      : email.sender && 'address' in email.sender
        ? email.sender
        : undefined,
  )

  const receivedAt = normalizeDate(
    email.date || options.receivedAt || new Date().toISOString(),
  )
  const messageId = email.messageId?.trim() || undefined
  const finalSubject =
    subject || options.defaultTitle?.trim() || '(untitled newsletter)'
  const contentHash = await sha256Hex(
    `${messageId ?? ''}\n${sender.address ?? sender.display}\n${finalSubject}\n${text.slice(0, 1200)}`,
  )
  const link = extractFirstSafeLink(html || undefined, text || undefined)

  return {
    id: `nl-${contentHash.slice(0, 20)}`,
    messageId,
    contentHash,
    subject: finalSubject,
    from: sender.display,
    fromName: sender.name,
    fromAddress: sender.address,
    receivedAt,
    html: html || undefined,
    text: text || finalSubject,
    link,
  }
}

export function addEntryToFeed(
  feed: NewsletterFeedRecord,
  entry: NewsletterEntry,
): ImportEmailResult {
  const existing = feed.entries.find(
    (item) =>
      (entry.messageId &&
        item.messageId &&
        item.messageId === entry.messageId) ||
      item.contentHash === entry.contentHash,
  )
  if (existing) {
    return { feed, entry: existing, duplicate: true }
  }

  const nextEntries = [entry, ...feed.entries]
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
    .slice(0, MAX_NEWSLETTER_ENTRIES)

  const updatedFeed: NewsletterFeedRecord = {
    ...feed,
    entries: nextEntries,
  }
  return { feed: updatedFeed, entry, duplicate: false }
}

export function newsletterFeedToFeedSource(
  feed: Pick<NewsletterFeedRecord, 'id' | 'title' | 'inboundAddress' | 'createdAt'>,
): FeedSource {
  return {
    id: feed.id,
    title: feed.title,
    url: `/rss/${feed.id}`,
    kind: 'newsletter',
    inboundAddress: feed.inboundAddress,
    createdAt: feed.createdAt,
  }
}

export function newsletterEntryToFeedItem(
  entry: NewsletterEntry,
  feed: Pick<NewsletterFeedRecord, 'id' | 'title'>,
  origin = '',
): FeedItem {
  const cleanOrigin = origin.replace(/\/$/, '')
  const fallbackLink = cleanOrigin
    ? `${cleanOrigin}/rss/${feed.id}#${entry.id}`
    : ''
  return {
    id: `${feed.id}-${entry.id}`,
    feedId: feed.id,
    feedTitle: feed.title,
    title: entry.subject,
    link: safeHttpUrl(entry.link) ?? fallbackLink,
    pubDate: normalizeDate(entry.receivedAt),
    description: entry.text || entry.subject,
    descriptionHtml: entry.html,
    imageUrl: extractImageFromHtml(entry.html ?? ''),
  }
}

function escapeCdata(value: string): string {
  return stripIllegalXmlChars(value).replace(/\]\]>/g, ']]]]><![CDATA[>')
}

export function renderRssFeed(
  feed: NewsletterFeedRecord,
  origin: string,
): string {
  const cleanOrigin = origin.replace(/\/$/, '')
  const selfUrl = `${cleanOrigin}/rss/${feed.id}`
  const updated = feed.entries[0]?.receivedAt ?? feed.createdAt
  const itemsXml = feed.entries
    .map((entry) => {
      const entryLink = entry.link || `${selfUrl}#${entry.id}`
      const descriptionBody = entry.html || entry.text
      return [
        '    <item>',
        `      <title>${escapeXml(entry.subject)}</title>`,
        `      <link>${escapeXml(entryLink)}</link>`,
        `      <guid isPermaLink="false">${escapeXml(entry.id)}</guid>`,
        `      <pubDate>${new Date(normalizeDate(entry.receivedAt)).toUTCString()}</pubDate>`,
        `      <author>${escapeXml(entry.from)}</author>`,
        `      <description><![CDATA[${escapeCdata(descriptionBody)}]]></description>`,
        '    </item>',
      ].join('\n')
    })
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(feed.title)}</title>`,
    `    <link>${escapeXml(selfUrl)}</link>`,
    `    <description>${escapeXml(`Newsletter bridge feed for ${feed.title}`)}</description>`,
    `    <lastBuildDate>${new Date(normalizeDate(updated)).toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml" />`,
    itemsXml,
    '  </channel>',
    '</rss>',
  ]
    .filter(Boolean)
    .join('\n')
}

export function renderAtomFeed(
  feed: NewsletterFeedRecord,
  origin: string,
): string {
  const cleanOrigin = origin.replace(/\/$/, '')
  const selfUrl = `${cleanOrigin}/atom/${feed.id}`
  const updated = normalizeDate(feed.entries[0]?.receivedAt ?? feed.createdAt)
  const entriesXml = feed.entries
    .map((entry) => {
      const entryLink = entry.link || `${cleanOrigin}/rss/${feed.id}#${entry.id}`
      const hasHtml = Boolean(entry.html)
      const contentType = hasHtml ? 'html' : 'text'
      const contentValue = hasHtml ? entry.html! : entry.text
      return [
        '  <entry>',
        `    <id>urn:resurrected-reader:newsletter:${escapeXml(feed.id)}:${escapeXml(entry.id)}</id>`,
        `    <title>${escapeXml(entry.subject)}</title>`,
        `    <updated>${escapeXml(normalizeDate(entry.receivedAt))}</updated>`,
        `    <author><name>${escapeXml(entry.fromName || entry.from)}</name>${
          entry.fromAddress
            ? `<email>${escapeXml(entry.fromAddress)}</email>`
            : ''
        }</author>`,
        `    <link rel="alternate" href="${escapeXml(entryLink)}" />`,
        `    <content type="${contentType}"><![CDATA[${escapeCdata(contentValue)}]]></content>`,
        '  </entry>',
      ].join('\n')
    })
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>urn:resurrected-reader:newsletter:${escapeXml(feed.id)}</id>`,
    `  <title>${escapeXml(feed.title)}</title>`,
    `  <updated>${escapeXml(updated)}</updated>`,
    `  <link rel="self" type="application/atom+xml" href="${escapeXml(selfUrl)}" />`,
    entriesXml,
    '</feed>',
  ]
    .filter(Boolean)
    .join('\n')
}

export function renderJsonFeed(
  feed: NewsletterFeedRecord,
  origin: string,
): string {
  const cleanOrigin = origin.replace(/\/$/, '')
  const selfUrl = `${cleanOrigin}/json/${feed.id}`
  return JSON.stringify(
    {
      version: 'https://jsonfeed.org/version/1.1',
      title: feed.title,
      home_page_url: `${cleanOrigin}/rss/${feed.id}`,
      feed_url: selfUrl,
      items: feed.entries.map((entry) => ({
        id: entry.id,
        url: entry.link || `${cleanOrigin}/rss/${feed.id}#${entry.id}`,
        title: entry.subject,
        content_text: entry.text,
        ...(entry.html ? { content_html: entry.html } : {}),
        date_published: normalizeDate(entry.receivedAt),
        authors: [
          {
            name: entry.fromName || entry.from,
          },
        ],
      })),
    },
    null,
    2,
  )
}

export function computeFeedEtag(feed: NewsletterFeedRecord): string {
  const seed = `${feed.id}:${feed.title}:${feed.createdAt}:${feed.entries
    .map((e) => `${e.id}:${e.receivedAt}`)
    .join(',')}`
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `"nl-${(hash >>> 0).toString(16)}-${feed.entries.length}"`
}

export function createMemoryNewsletterStore(
  initialFeeds: ReadonlyArray<NewsletterFeedRecord> = [],
): NewsletterStore {
  const feeds = new Map<string, NewsletterFeedRecord>()
  const mailboxIndex = new Map<string, string>()

  const putFeed = (feed: NewsletterFeedRecord) => {
    if (!feeds.has(feed.id) && feeds.size >= MAX_NEWSLETTER_FEEDS) {
      const oldestKey = feeds.keys().next().value
      if (oldestKey) {
        const removed = feeds.get(oldestKey)
        if (removed) mailboxIndex.delete(removed.mailboxId)
        feeds.delete(oldestKey)
      }
    }
    feeds.set(feed.id, feed)
    mailboxIndex.set(feed.mailboxId.toLowerCase(), feed.id)
  }

  for (const feed of initialFeeds) {
    putFeed(feed)
  }

  return {
    async listFeeds() {
      return [...feeds.values()].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      )
    },
    async createFeed(input) {
      const record = createNewsletterFeedRecord(input)
      putFeed(record)
      return record
    },
    async getFeed(feedId) {
      return feeds.get(feedId) ?? null
    },
    async getFeedByMailbox(mailboxId) {
      const normalized = normalizeMailboxLocalPart(mailboxId)
      const id = mailboxIndex.get(normalized)
      return id ? feeds.get(id) ?? null : null
    },
    async deleteFeed(feedId) {
      const existing = feeds.get(feedId)
      if (!existing) return false
      feeds.delete(feedId)
      mailboxIndex.delete(existing.mailboxId.toLowerCase())
      return true
    },
    async importEmail(feedId, raw, options) {
      const feed = feeds.get(feedId)
      if (!feed) return null
      const entry = await parseRawEmail(raw, {
        ...options,
        defaultTitle: feed.title,
      })
      const result = addEntryToFeed(feed, entry)
      putFeed(result.feed)
      return result
    },
    async syncFeed(feed) {
      const cleanEntries = feed.entries
        .slice(0, MAX_NEWSLETTER_ENTRIES)
        .map((e) => ({ ...e }))
      const normalized: NewsletterFeedRecord = {
        ...feed,
        entries: cleanEntries,
      }
      putFeed(normalized)
      return normalized
    },
  }
}
