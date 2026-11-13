import type { FeedItem } from '../src/lib/feeds.ts'
import { askGeneratedAnswerSchema, MIN_ASK_SIMILARITY, type AskSource } from '../src/lib/ask.ts'

export function selectTodayItems(items: readonly FeedItem[], now: Date): FeedItem[] {
  const end = now.getTime()
  if (!Number.isFinite(end)) throw new Error('Invalid Ask clock.')
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const seen = new Set<string>()
  return items.filter((item) => {
    const published = Date.parse(item.pubDate)
    let safeLink = false
    try {
      const url = new URL(item.link)
      safeLink = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
    } catch { /* Invalid source URLs cannot become citations. */ }
    return !item.sample && safeLink && item.title.trim().length > 0 &&
      typeof item.score === 'number' && Number.isFinite(item.score) &&
      item.score >= 0 && item.score <= 100 && published >= start && published <= end
  }).sort((a, b) => (b.score! - a.score!) || Date.parse(b.pubDate) - Date.parse(a.pubDate) || a.id.localeCompare(b.id))
    .filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    }).slice(0, 60)
}

/** Missing/invalid vectors must not masquerade as below-threshold retrieval. */
export function selectAskSources(items: readonly FeedItem[], scores: Record<string, number>): FeedItem[] {
  if (items.some((item) => !Object.hasOwn(scores, item.id) || !Number.isFinite(scores[item.id]) || scores[item.id] < -1 || scores[item.id] > 1)) {
    throw new Error('Ask retrieval did not score every candidate.')
  }
  const seenLinks = new Set<string>()
  return [...items].filter((item) => scores[item.id] >= MIN_ASK_SIMILARITY)
    .sort((a, b) => scores[b.id] - scores[a.id] || (b.score! - a.score!) || Date.parse(b.pubDate) - Date.parse(a.pubDate) || a.id.localeCompare(b.id))
    .filter((item) => {
      const link = new URL(item.link).href
      if (seenLinks.has(link)) return false
      seenLinks.add(link)
      return true
    }).slice(0, 5)
}

export function buildAskSources(items: readonly FeedItem[]): AskSource[] {
  return items.map((item, index) => ({ label: index + 1, id: item.id, title: item.title.slice(0, 1000), link: item.link }))
}

export function validateAskAnswer(raw: string, sources: readonly AskSource[]) {
  if (raw.length > 16_000) throw new Error('Ask answer exceeds its size limit.')
  const answer = askGeneratedAnswerSchema.parse(JSON.parse(raw))
  for (const statement of answer.statements) {
    if (statement.citations.some((label) => !sources.some((source) => source.label === label))) throw new Error('Unknown Ask citation.')
    statement.citations = [...new Set(statement.citations)]
  }
  return answer.statements
}
