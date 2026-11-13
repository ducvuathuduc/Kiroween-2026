import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import {
  getProvidersStatus,
  NoProvidersConfiguredError,
  semanticScoreWithFallback,
  summarizeWithFallback,
} from './server/ai.ts'
import { sanitizeProviderId } from './src/lib/providers.ts'
import { mcpHandler } from './server/mcp.ts'
import { a2aApp } from './server/a2a.ts'

interface SummarizeRequestBody {
  title?: unknown
  feedTitle?: unknown
  link?: unknown
  content?: unknown
  provider?: unknown
}

interface EmbedRequestBody {
  query?: unknown
  documents?: unknown
  provider?: unknown
}

interface OgImagesRequestBody {
  urls?: unknown
}

const ogImageCache = new Map<string, string | null>()
const rssCache = new Map<string, { xml: string; contentType: string; expiresAt: number }>()
const RSS_CACHE_TTL_MS = 5 * 60_000
const MAX_RSS_BYTES = 2 * 1024 * 1024

function isPublicHttpUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
    if (
      parsed.username || parsed.password ||
      !host.includes('.') || host.startsWith('[') ||
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return null
    }
    // URL canonicalizes shortened, integer, octal, and hexadecimal IPv4 forms.
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a, b, c] = host.split('.').map(Number)
      if (
        a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
        (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
        (a === 203 && b === 0 && c === 113)
      ) return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

async function fetchPublicUrl(rawUrl: string, init: RequestInit): Promise<Response> {
  let url = rawUrl
  for (let redirects = 0; ; redirects += 1) {
    const safeUrl = isPublicHttpUrl(url)
    if (!safeUrl) throw new Error('Upstream URL must be public HTTP(S).')
    const response = await fetch(safeUrl, { ...init, redirect: 'manual' })
    const location = response.headers.get('location')
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) return response
    await response.body?.cancel()
    if (redirects >= 5) throw new Error('Too many upstream redirects.')
    url = new URL(location, safeUrl).toString()
  }
}

function extractMetaImage(html: string, baseUrl: string): string | null {
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image|twitter:image:src)["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image|twitter:image:src)["']/i,
  ]
  for (const re of patterns) {
    const match = html.match(re)
    if (!match?.[1]) continue
    try {
      const resolved = new URL(match[1].trim(), baseUrl)
      if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
        return resolved.toString()
      }
    } catch {
      // ignore malformed meta URL
    }
  }
  return null
}

async function resolveOgImage(rawUrl: string): Promise<string | null> {
  const safeUrl = isPublicHttpUrl(rawUrl)
  if (!safeUrl) return null
  if (ogImageCache.has(safeUrl)) {
    return ogImageCache.get(safeUrl) ?? null
  }

  let found: string | null = null
  try {
    const res = await fetchPublicUrl(safeUrl, {
      signal: AbortSignal.timeout(3500),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; ResurrectedReaderBot/1.0; +https://github.com/ducvuathuduc/Kiroween-2026)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
    if (res.ok && contentType.includes('text/html')) {
      const reader = res.body?.getReader()
      if (reader) {
        const decoder = new TextDecoder()
        let html = ''
        while (html.length < 75_000) {
          const { done, value } = await reader.read()
          if (done) break
          html += decoder.decode(value, { stream: true })
          if (html.includes('</head>')) break
        }
        void reader.cancel()
        found = extractMetaImage(html, res.url || safeUrl)
      } else {
        const text = (await res.text()).slice(0, 75_000)
        found = extractMetaImage(text, res.url || safeUrl)
      }
    }
  } catch {
    found = null
  }

  if (ogImageCache.size >= 400) {
    const firstKey = ogImageCache.keys().next().value
    if (firstKey) ogImageCache.delete(firstKey)
  }
  ogImageCache.set(safeUrl, found)
  return found
}

const app = new Hono<{
  Bindings: { ASSETS?: { fetch(request: Request): Promise<Response> } }
  Variables: { body: unknown }
}>()

// Keep JSON-RPC parse errors independent of the existing API/MCP body contract.
app.route('/', a2aApp)

const limitJsonBody = bodyLimit({ maxSize: 192 * 1024 })
app.use('*', async (c, next) => {
  if (!/^application\/json(?:;|$)/i.test(c.req.header('content-type') ?? '')) {
    c.set('body', {})
    return next()
  }
  return limitJsonBody(c, async () => {
    const text = await c.req.text()
    try {
      const body: unknown = text.trim() ? JSON.parse(text) : {}
      if (!body || typeof body !== 'object') throw new SyntaxError('Expected a JSON object or array.')
      c.set('body', body)
    } catch {
      c.res = c.json({ error: 'Invalid JSON body.' }, 400)
      return
    }
    await next()
  })
})

app.all('/mcp', (c) => mcpHandler.fetch(c.req.raw, { parsedBody: c.get('body') }))

app.get('/api/health', (c) => {
  const providers = getProvidersStatus()
  return c.json({
    ok: true,
    geminiConfigured: Boolean(
      providers.find((p) => p.id === 'gemini')?.available,
    ),
    providers,
  })
})

app.get('/api/providers', (c) => {
  return c.json({
    defaultProvider: 'gemini',
    providers: getProvidersStatus(),
  })
})

app.get('/api/rss', async (c) => {
  const urls = c.req.queries('url') ?? []
  const rawUrl = urls.length === 1 ? urls[0] : ''
  const safeUrl = isPublicHttpUrl(rawUrl)
  if (!safeUrl) {
    return c.json({ error: 'A valid public http(s) feed URL is required.' }, 400)
  }

  const cached = rssCache.get(safeUrl)
  if (cached && cached.expiresAt > Date.now()) {
    return c.body(cached.xml, 200, { 'Content-Type': cached.contentType })
  }

  try {
    const upstream = await fetchPublicUrl(safeUrl, {
      signal: AbortSignal.timeout(6500),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; ResurrectedReaderBot/1.0; +https://github.com/ducvuathuduc/Kiroween-2026)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
      },
    })
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: `Upstream HTTP ${upstream.status}` }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      })
    }
    let bytes = 0
    const limitedBody = upstream.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength
        if (bytes > MAX_RSS_BYTES) throw new Error('RSS response exceeds the 2 MiB limit.')
        controller.enqueue(chunk)
      },
    }))
    const xml = await new Response(limitedBody).text()
    const contentType = 'application/xml; charset=utf-8'
    if (rssCache.size >= 100) {
      const firstKey = rssCache.keys().next().value
      if (firstKey) rssCache.delete(firstKey)
    }
    rssCache.set(safeUrl, { xml, contentType, expiresAt: Date.now() + RSS_CACHE_TTL_MS })
    return c.body(xml, 200, { 'Content-Type': contentType })
  } catch (err) {
    return c.json({
      error: err instanceof Error ? err.message : 'Failed to fetch RSS feed.',
    }, 502)
  }
})

app.post('/api/og-images', async (c) => {
  const body = (c.get('body') ?? {}) as OgImagesRequestBody
  const rawUrls = Array.isArray(body.urls)
    ? body.urls.filter((u): u is string => typeof u === 'string').slice(0, 12)
    : []

  const entries = await Promise.all(
    rawUrls.map(async (u) => [u, await resolveOgImage(u)] as const),
  )
  return c.json({ images: Object.fromEntries(entries) })
})

app.post('/api/summarize', async (c) => {
  const body = (c.get('body') ?? {}) as SummarizeRequestBody
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const feedTitle =
    typeof body.feedTitle === 'string' ? body.feedTitle.trim() : ''
  const link = typeof body.link === 'string' ? body.link.trim() : ''
  const content =
    typeof body.content === 'string' ? body.content.trim().slice(0, 5000) : ''
  const preferredProvider = sanitizeProviderId(body.provider)

  if (!title || !content) {
    return c.json({ error: 'Article title and content are required.' }, 400)
  }

  try {
    const result = await summarizeWithFallback({
      title,
      feedTitle,
      link,
      content,
      preferredProvider,
    })
    return c.json(result)
  } catch (err) {
    if (err instanceof NoProvidersConfiguredError) {
      return c.json({ error: err.message }, 503)
    }
    const raw =
      err instanceof Error ? err.message : 'Failed to summarize article.'
    let friendly = raw
    if (/429|RESOURCE_EXHAUSTED|quota/i.test(raw)) {
      friendly = 'AI provider quota reached — retry later.'
    } else if (/^\{/.test(raw.trim())) {
      try {
        const parsed = JSON.parse(raw) as { error?: { message?: string } }
        if (parsed.error?.message) {
          friendly = parsed.error.message.split('\n')[0].slice(0, 140)
        }
      } catch {
        friendly = 'AI summary service unavailable.'
      }
    }
    const status = /429|RESOURCE_EXHAUSTED|quota/i.test(raw) ? 429 : 502
    return c.json({ error: friendly }, status)
  }
})

app.post('/api/embed', async (c) => {
  const body = (c.get('body') ?? {}) as EmbedRequestBody
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  const preferredProvider = sanitizeProviderId(body.provider)
  const rawDocs = Array.isArray(body.documents) ? body.documents : []
  const documents = rawDocs
    .filter(
      (d): d is { id: string; text: string } =>
        Boolean(d) &&
        typeof d === 'object' &&
        typeof (d as { id?: unknown }).id === 'string' &&
        typeof (d as { text?: unknown }).text === 'string',
    )
    .slice(0, 60)

  if (!query || documents.length === 0) {
    return c.json({ available: false, provider: null, scores: {} })
  }

  const result = await semanticScoreWithFallback({
    query,
    documents,
    preferredProvider,
  })
  return c.json(result)
})

app.all('*', (c) => c.env?.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.notFound())

export default app
