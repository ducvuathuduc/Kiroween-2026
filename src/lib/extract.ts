export interface ExtractedArticle {
  title: string
  markdown: string
  html: string
  author: string
}

/** Unsupported sources and transport or extraction errors retain the RSS summary. */
export async function extract(url: string): Promise<ExtractedArticle | null> {
  try {
    const response = await fetch(`/api/extract?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) return null
    const data: unknown = await response.json()
    if (!data || typeof data !== 'object') return null
    const value = data as Record<string, unknown>
    if (typeof value.title !== 'string' || typeof value.markdown !== 'string' || typeof value.html !== 'string' || typeof value.author !== 'string') return null
    if (!value.title.trim() || !value.markdown.trim() || value.markdown.length > 300_000 || value.html.length > 300_000) return null
    return { title: value.title, markdown: value.markdown, html: value.html, author: value.author }
  } catch { return null }
}
