import type { FeedItem, FeedSource } from './feeds'
import { safeHttpUrl, summarize } from './format'
import type { GeminiSummary } from './kiroTask'
import type { NewsletterFeedRecord } from './newsletter'
import type { ReaderSettings } from './storage'

export interface FullDataExport {
  app: 'Resurrected Reader'
  schemaVersion: 1
  exportedAt: string
  lastVisitIso: string | null
  settings: ReaderSettings
  feeds: FeedSource[]
  newsletters?: NewsletterFeedRecord[]
  readIds: string[]
  savedIds: string[]
  summaries: Record<string, GeminiSummary>
}

export function formatItemAsMarkdown(
  item: FeedItem,
  geminiSummary?: GeminiSummary,
): string {
  const safeUrl = safeHttpUrl(item.link)
  const lines: string[] = [
    `# ${item.title}`,
    '',
    `- **Feed:** ${item.feedTitle}`,
    `- **Signal score:** ${item.score ?? '—'}/100 (deterministic 4D model)`,
    `- **Published:** ${item.pubDate}`,
    `- **URL:** ${safeUrl ?? 'N/A'}`,
    '',
  ]

  if (geminiSummary?.tldr) {
    lines.push('## Gemini TL;DR', '', geminiSummary.tldr, '')
    if (geminiSummary.takeaways.length > 0) {
      lines.push('### Key takeaways')
      for (const point of geminiSummary.takeaways) {
        lines.push(`- ${point}`)
      }
      lines.push('')
    }
    if (geminiSummary.whyMatters) {
      lines.push(`**Why it matters:** ${geminiSummary.whyMatters}`, '')
    }
  }

  lines.push('## Summary', '', summarize(item.description, 4), '')
  return lines.join('\n')
}

export function buildFullDataExport(params: {
  feeds: FeedSource[]
  newsletters?: NewsletterFeedRecord[]
  readIds: string[]
  savedIds: string[]
  summaries: Record<string, GeminiSummary>
  settings: ReaderSettings
  lastVisitIso: string | null
  exportedAt?: string
}): FullDataExport {
  return {
    app: 'Resurrected Reader',
    schemaVersion: 1,
    exportedAt: params.exportedAt ?? new Date().toISOString(),
    lastVisitIso: params.lastVisitIso,
    settings: params.settings,
    feeds: params.feeds,
    ...(params.newsletters && params.newsletters.length > 0
      ? { newsletters: params.newsletters }
      : {}),
    readIds: params.readIds,
    savedIds: params.savedIds,
    summaries: params.summaries,
  }
}

export function downloadJsonExport(payload: FullDataExport): string {
  const dateStamp = payload.exportedAt.slice(0, 10)
  const fileName = `resurrected-reader-export-${dateStamp}.json`
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return fileName
}

export function openExternalUrl(rawUrl: string): boolean {
  const safeUrl = safeHttpUrl(rawUrl)
  if (!safeUrl) return false
  const a = document.createElement('a')
  a.href = safeUrl
  a.target = '_blank'
  a.rel = 'noreferrer noopener'
  document.body.append(a)
  a.click()
  a.remove()
  return true
}

export async function copyPlainText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const field = Object.assign(document.createElement('textarea'), {
      value: text,
    })
    field.setAttribute('readonly', '')
    field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0'
    document.body.append(field)
    field.select()
    try {
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      field.remove()
    }
  }
}
