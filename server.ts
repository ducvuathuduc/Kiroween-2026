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

const app = express()
app.use(express.json({ limit: '64kb' }))

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  })
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
    typeof body.content === 'string' ? body.content.trim().slice(0, 12000) : ''

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
