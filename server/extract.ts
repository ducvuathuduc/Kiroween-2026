import { Defuddle } from 'defuddle/node'
import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import TurndownService from 'turndown'
import type { ExtractedArticle } from '../src/lib/extract.ts'

/** Parse inert HTML; third-party extraction requests are explicitly disabled. */
export async function extractArticle(html: string, url: string, primary: typeof Defuddle = Defuddle): Promise<ExtractedArticle | null> {
  try {
    const { document } = parseHTML(html)
    const result = await primary(document, url, { separateMarkdown: true, useAsync: false })
    if (result.title?.trim() && result.contentMarkdown?.trim() && result.content?.trim()) {
      return { title: result.title, markdown: result.contentMarkdown, html: result.content, author: result.author ?? '' }
    }
  } catch { /* Try Readability on an untouched document. */ }
  try {
    const { document } = parseHTML(html)
    const article = new Readability(document, { maxElemsToParse: 40_000 }).parse()
    if (!article?.title?.trim() || !article.content?.trim()) return null
    const markdown = new TurndownService().turndown(article.content)
    if (!markdown.trim()) return null
    return { title: article.title, markdown, html: article.content, author: article.byline ?? '' }
  } catch { return null }
}
