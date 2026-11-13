import path from 'node:path'
import express, { type Request, type Response } from 'express'
import { GoogleGenAI, Type } from '@google/genai'

const PORT = Number(process.env.PORT) || 3000
const IS_PROD = process.env.NODE_ENV === 'production'

interface SummarizeRequestBody {
  title?: unknown
  feedTitle?: unknown
  link?: unknown
  content?: unknown
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
app.use(express.json({ limit: '64kb' }))

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
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
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.status(503).json({
      error:
        'Gemini API key is not configured on the server. Set it in Settings > Secrets.',
    })
    return
  }

  const body = (req.body ?? {}) as SummarizeRequestBody
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const feedTitle =
    typeof body.feedTitle === 'string' ? body.feedTitle.trim() : ''
  const link = typeof body.link === 'string' ? body.link.trim() : ''
  const content =
    typeof body.content === 'string' ? body.content.trim().slice(0, 5000) : ''

  if (!title || !content) {
    res.status(400).json({ error: 'Article title and content are required.' })
    return
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Summarize this builder article accurately without inventing facts.\n\nTitle: ${title}\nSource: ${feedTitle}\nURL: ${link}\n\nArticle text:\n${content}`,
      config: {
        systemInstruction:
          'You summarize technical cloud, AWS, and software engineering posts concisely for busy builders. Return a 2-sentence TL;DR, 3 crisp bullet takeaways, and 1 sentence explaining why an AWS/Kiro builder should care.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tldr: {
              type: Type.STRING,
              description: 'Concise 1-2 sentence TL;DR summary of the post.',
            },
            takeaways: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Three short, concrete technical takeaways.',
            },
            whyMatters: {
              type: Type.STRING,
              description:
                'One sentence explaining the practical takeaway for AWS/Kiro builders.',
            },
          },
          required: ['tldr', 'takeaways', 'whyMatters'],
        },
      },
    })

    const rawJson = (response.text ?? '{}').trim()
    const parsed = JSON.parse(rawJson) as {
      tldr?: unknown
      takeaways?: unknown
      whyMatters?: unknown
    }

    res.json({
      tldr: typeof parsed.tldr === 'string' ? parsed.tldr : '',
      takeaways: Array.isArray(parsed.takeaways)
        ? parsed.takeaways.filter((t): t is string => typeof t === 'string').slice(0, 4)
        : [],
      whyMatters: typeof parsed.whyMatters === 'string' ? parsed.whyMatters : '',
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to summarize with Gemini.'
    res.status(502).json({ error: message })
  }
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
