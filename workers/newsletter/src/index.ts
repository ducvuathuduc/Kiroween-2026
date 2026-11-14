import { Hono } from 'hono'
import {
  addEntryToFeed,
  computeFeedEtag,
  createMemoryNewsletterStore,
  createNewsletterFeedRecord,
  isValidFeedId,
  MAX_RAW_EMAIL_BYTES,
  normalizeMailboxLocalPart,
  parseRawEmail,
  renderAtomFeed,
  renderJsonFeed,
  renderRssFeed,
  type ImportEmailResult,
  type NewsletterFeedRecord,
  type NewsletterStore,
} from '../../../src/lib/newsletter.ts'

export interface KvNamespaceLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  list?(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }>
}

export interface ForwardableEmailMessageLike {
  readonly from: string
  readonly to: string
  readonly raw: ReadableStream<Uint8Array> | ArrayBuffer | string
  readonly rawSize?: number
  setReject(reason: string): void
}

export interface NewsletterWorkerEnv {
  NEWSLETTER_KV?: KvNamespaceLike
  INBOUND_DOMAIN?: string
}

const FEED_INDEX_KEY = 'index:feeds'
const FEED_PREFIX = 'feed:'
const MAILBOX_PREFIX = 'mailbox:'

export function createKvNewsletterStore(kv: KvNamespaceLike): NewsletterStore {
  const readIndex = async (): Promise<string[]> => {
    const raw = await kv.get(FEED_INDEX_KEY)
    if (!raw) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : []
    } catch {
      return []
    }
  }

  const writeIndex = async (ids: readonly string[]): Promise<void> => {
    await kv.put(FEED_INDEX_KEY, JSON.stringify([...new Set(ids)]))
  }

  const readFeed = async (feedId: string): Promise<NewsletterFeedRecord | null> => {
    if (!isValidFeedId(feedId)) return null
    const raw = await kv.get(`${FEED_PREFIX}${feedId}`)
    if (!raw) return null
    try {
      return JSON.parse(raw) as NewsletterFeedRecord
    } catch {
      return null
    }
  }

  const saveFeedRecord = async (feed: NewsletterFeedRecord): Promise<void> => {
    await kv.put(`${FEED_PREFIX}${feed.id}`, JSON.stringify(feed))
    await kv.put(`${MAILBOX_PREFIX}${feed.mailboxId.toLowerCase()}`, feed.id)
    const ids = await readIndex()
    if (!ids.includes(feed.id)) {
      await writeIndex([feed.id, ...ids])
    }
  }

  return {
    async listFeeds() {
      const ids = await readIndex()
      const loaded = await Promise.all(ids.map((id) => readFeed(id)))
      return loaded
        .filter((f): f is NewsletterFeedRecord => Boolean(f))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    },
    async createFeed(input) {
      const record = createNewsletterFeedRecord(input)
      await saveFeedRecord(record)
      return record
    },
    async getFeed(feedId) {
      return readFeed(feedId)
    },
    async getFeedByMailbox(mailboxId) {
      const normalized = normalizeMailboxLocalPart(mailboxId)
      if (!normalized) return null
      const feedId = await kv.get(`${MAILBOX_PREFIX}${normalized}`)
      return feedId ? readFeed(feedId) : null
    },
    async deleteFeed(feedId) {
      const existing = await readFeed(feedId)
      if (!existing) return false
      await kv.delete(`${FEED_PREFIX}${feedId}`)
      await kv.delete(`${MAILBOX_PREFIX}${existing.mailboxId.toLowerCase()}`)
      const ids = await readIndex()
      await writeIndex(ids.filter((id) => id !== feedId))
      return true
    },
    async importEmail(feedId, raw, options): Promise<ImportEmailResult | null> {
      const feed = await readFeed(feedId)
      if (!feed) return null
      const entry = await parseRawEmail(raw, {
        ...options,
        defaultTitle: feed.title,
      })
      const result = addEntryToFeed(feed, entry)
      await saveFeedRecord(result.feed)
      return result
    },
    async syncFeed(feed) {
      await saveFeedRecord(feed)
      return feed
    },
  }
}

const fallbackMemoryStore = createMemoryNewsletterStore()

function resolveEnvStore(env?: NewsletterWorkerEnv): NewsletterStore {
  return env?.NEWSLETTER_KV
    ? createKvNewsletterStore(env.NEWSLETTER_KV)
    : fallbackMemoryStore
}

async function readRawBody(
  req: Request,
): Promise<{ raw: string | ArrayBuffer; errorStatus?: 400 | 413; error?: string }> {
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase()
  const buf = await req.arrayBuffer()
  if (buf.byteLength === 0) {
    return { raw: '', errorStatus: 400, error: 'Raw email payload is empty.' }
  }
  if (buf.byteLength > MAX_RAW_EMAIL_BYTES) {
    return {
      raw: '',
      errorStatus: 413,
      error: 'Raw email exceeds the 1 MiB limit.',
    }
  }
  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(buf)) as {
        raw?: unknown
      }
      if (typeof parsed.raw !== 'string' || !parsed.raw.trim()) {
        return {
          raw: '',
          errorStatus: 400,
          error: 'JSON payload must include a non-empty raw email string.',
        }
      }
      return { raw: parsed.raw }
    } catch {
      return { raw: '', errorStatus: 400, error: 'Invalid JSON body.' }
    }
  }
  return { raw: buf }
}

export function createNewsletterWorkerApp(
  getStore: (env?: NewsletterWorkerEnv) => NewsletterStore = resolveEnvStore,
) {
  const app = new Hono<{ Bindings: NewsletterWorkerEnv }>()

  app.get('/', (c) =>
    c.json({
      service: 'resurrected-reader-newsletter',
      status: 'ok',
      routes: [
        'GET /api/v1/feeds',
        'POST /api/v1/feeds',
        'DELETE /api/v1/feeds/:feedId',
        'POST /api/v1/feeds/:feedId/import',
        'GET /rss/:feedId',
        'GET /atom/:feedId',
        'GET /json/:feedId',
      ],
    }),
  )

  app.get('/api/v1/feeds', async (c) => {
    const store = getStore(c.env)
    const feeds = await store.listFeeds()
    return c.json({ feeds })
  })

  app.post('/api/v1/feeds', async (c) => {
    let body: { title?: unknown; domain?: unknown } = {}
    try {
      body = (await c.req.json()) as { title?: unknown; domain?: unknown }
    } catch {
      return c.json({ error: 'Invalid JSON body.' }, 400)
    }
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) {
      return c.json({ error: 'Feed title is required.' }, 400)
    }
    const store = getStore(c.env)
    const domain =
      typeof body.domain === 'string' && body.domain.trim()
        ? body.domain.trim()
        : c.env?.INBOUND_DOMAIN
    const feed = await store.createFeed({ title, domain })
    return c.json({ feed }, 201)
  })

  app.delete('/api/v1/feeds/:feedId', async (c) => {
    const feedId = c.req.param('feedId')
    if (!isValidFeedId(feedId)) {
      return c.json({ error: 'Feed not found.' }, 404)
    }
    const deleted = await getStore(c.env).deleteFeed(feedId)
    if (!deleted) return c.json({ error: 'Feed not found.' }, 404)
    return c.json({ ok: true, feedId })
  })

  app.post('/api/v1/feeds/:feedId/import', async (c) => {
    const feedId = c.req.param('feedId')
    if (!isValidFeedId(feedId)) {
      return c.json({ error: 'Feed not found.' }, 404)
    }
    const payload = await readRawBody(c.req.raw)
    if (payload.errorStatus) {
      return c.json({ error: payload.error }, payload.errorStatus)
    }
    try {
      const result = await getStore(c.env).importEmail(feedId, payload.raw)
      if (!result) return c.json({ error: 'Feed not found.' }, 404)
      return c.json(result, result.duplicate ? 200 : 201)
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Invalid email format.' },
        400,
      )
    }
  })

  const serveFeed = async (
    c: { req: { param: (name: string) => string; header: (name: string) => string | undefined; url: string }; env?: NewsletterWorkerEnv },
    format: 'rss' | 'atom' | 'json',
  ): Promise<Response> => {
    const feedId = c.req.param('feedId')
    if (!isValidFeedId(feedId)) {
      return new Response('Feed not found', { status: 404 })
    }
    const feed = await getStore(c.env).getFeed(feedId)
    if (!feed) {
      return new Response('Feed not found', { status: 404 })
    }
    const etag = computeFeedEtag(feed)
    if (c.req.header('if-none-match') === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } })
    }
    const origin = new URL(c.req.url).origin
    if (format === 'rss') {
      return new Response(renderRssFeed(feed, origin), {
        status: 200,
        headers: {
          'Content-Type': 'application/rss+xml; charset=utf-8',
          ETag: etag,
          'Cache-Control': 'no-cache',
        },
      })
    }
    if (format === 'atom') {
      return new Response(renderAtomFeed(feed, origin), {
        status: 200,
        headers: {
          'Content-Type': 'application/atom+xml; charset=utf-8',
          ETag: etag,
          'Cache-Control': 'no-cache',
        },
      })
    }
    return new Response(renderJsonFeed(feed, origin), {
      status: 200,
      headers: {
        'Content-Type': 'application/feed+json; charset=utf-8',
        ETag: etag,
        'Cache-Control': 'no-cache',
      },
    })
  }

  app.get('/rss/:feedId', (c) => serveFeed(c, 'rss'))
  app.get('/atom/:feedId', (c) => serveFeed(c, 'atom'))
  app.get('/json/:feedId', (c) => serveFeed(c, 'json'))

  return app
}

const workerApp = createNewsletterWorkerApp()

export async function handleInboundEmail(
  message: ForwardableEmailMessageLike,
  store: NewsletterStore,
): Promise<{ accepted: boolean; reason?: string; entryId?: string }> {
  if (
    typeof message.rawSize === 'number' &&
    message.rawSize > MAX_RAW_EMAIL_BYTES
  ) {
    message.setReject('Message exceeds 1 MiB size limit')
    return { accepted: false, reason: 'size-limit' }
  }

  const mailboxId = normalizeMailboxLocalPart(message.to)
  const feed = mailboxId ? await store.getFeedByMailbox(mailboxId) : null
  if (!feed) {
    message.setReject('Unknown newsletter recipient')
    return { accepted: false, reason: 'unknown-recipient' }
  }

  const rawBuffer =
    typeof message.raw === 'string' || message.raw instanceof ArrayBuffer
      ? message.raw
      : await new Response(message.raw).arrayBuffer()
  const result = await store.importEmail(feed.id, rawBuffer)
  return {
    accepted: Boolean(result),
    entryId: result?.entry.id,
  }
}

export default {
  fetch(request: Request, env: NewsletterWorkerEnv) {
    return workerApp.fetch(request, env)
  },
  async email(message: ForwardableEmailMessageLike, env: NewsletterWorkerEnv) {
    await handleInboundEmail(message, resolveEnvStore(env))
  },
}
