import path from 'node:path'
import express, { type Request, type Response } from 'express'
import {
  getProvidersStatus,
  NoProvidersConfiguredError,
  semanticScoreWithFallback,
  summarizeWithFallback,
} from './server/ai.ts'
import { sanitizeProviderId } from './src/lib/providers.ts'
import { mcpHandler } from './server/mcp.ts'

const PORT = Number(process.env.PORT) || 3000
const IS_PROD = process.env.NODE_ENV === 'production'

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
    const host = parsed.hostname.toLowerCase()
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === '::1' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return null
    }
    return parsed.toString()
  } catch {
    return null
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
    const res = await fetch(safeUrl, {
      redirect: 'follow',
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

const app = express()
app.use(express.json({ limit: '192kb' }))

app.all('/mcp', async (req: Request, res: Response) => {
  const headers = new Headers()
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    headers.append(req.rawHeaders[index], req.rawHeaders[index + 1])
  }
  const response = await mcpHandler.fetch(new globalThis.Request(`${req.protocol}://${req.get('host')}${req.originalUrl}`, {
    method: req.method,
    headers,
    body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
  }))
  response.headers.forEach((value, name) => res.setHeader(name, value))
  res.status(response.status).send(Buffer.from(await response.arrayBuffer()))
})

app.get('/api/health', (_req: Request, res: Response) => {
  const providers = getProvidersStatus()
  res.json({
    ok: true,
    geminiConfigured: Boolean(
      providers.find((p) => p.id === 'gemini')?.available,
    ),
    providers,
  })
})

app.get('/api/providers', (_req: Request, res: Response) => {
  res.json({
    defaultProvider: 'gemini',
    providers: getProvidersStatus(),
  })
})

app.get('/api/rss', async (req: Request, res: Response) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url : ''
  const safeUrl = isPublicHttpUrl(rawUrl)
  if (!safeUrl) {
    res.status(400).json({ error: 'A valid public http(s) feed URL is required.' })
    return
  }

  const cached = rssCache.get(safeUrl)
  if (cached && cached.expiresAt > Date.now()) {
    res.type(cached.contentType).send(cached.xml)
    return
  }

  try {
    const upstream = await fetch(safeUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(6500),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; ResurrectedReaderBot/1.0; +https://github.com/ducvuathuduc/Kiroween-2026)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
      },
    })
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Upstream HTTP ${upstream.status}` })
      return
    }
    const xml = (await upstream.text()).slice(0, MAX_RSS_BYTES)
    const contentType = 'application/xml; charset=utf-8'
    if (rssCache.size >= 100) {
      const firstKey = rssCache.keys().next().value
      if (firstKey) rssCache.delete(firstKey)
    }
    rssCache.set(safeUrl, { xml, contentType, expiresAt: Date.now() + RSS_CACHE_TTL_MS })
    res.type(contentType).send(xml)
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to fetch RSS feed.',
    })
  }
})

app.post('/api/og-images', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as OgImagesRequestBody
  const rawUrls = Array.isArray(body.urls)
    ? body.urls.filter((u): u is string => typeof u === 'string').slice(0, 12)
    : []

  const entries = await Promise.all(
    rawUrls.map(async (u) => [u, await resolveOgImage(u)] as const),
  )
  res.json({ images: Object.fromEntries(entries) })
})

app.post('/api/summarize', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as SummarizeRequestBody
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const feedTitle =
    typeof body.feedTitle === 'string' ? body.feedTitle.trim() : ''
  const link = typeof body.link === 'string' ? body.link.trim() : ''
  const content =
    typeof body.content === 'string' ? body.content.trim().slice(0, 5000) : ''
  const preferredProvider = sanitizeProviderId(body.provider)

  if (!title || !content) {
    res.status(400).json({ error: 'Article title and content are required.' })
    return
  }

  try {
    const result = await summarizeWithFallback({
      title,
      feedTitle,
      link,
      content,
      preferredProvider,
    })
    res.json(result)
  } catch (err) {
    if (err instanceof NoProvidersConfiguredError) {
      res.status(503).json({ error: err.message })
      return
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
    res.status(status).json({ error: friendly })
  }
})

app.post('/api/embed', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as EmbedRequestBody
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
    res.json({ available: false, provider: null, scores: {} })
    return
  }

  const result = await semanticScoreWithFallback({
    query,
    documents,
    preferredProvider,
  })
  res.json(result)
})

async function startServer() {
  if (IS_PROD) {
    const distDir = path.resolve(process.cwd(), 'dist')
    app.use(express.static(distDir))
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'))
    })
  } else {
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    })
    app.use(vite.middlewares)
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Resurrected Reader listening on http://0.0.0.0:${PORT}`)
  })
}

void startServer()
