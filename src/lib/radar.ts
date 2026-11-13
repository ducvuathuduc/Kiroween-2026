import type { FeedItem } from './feeds'
import { explainScore, type SignalDimensions } from './scoring'

export interface HistogramBucket {
  bucket: string
  min: number
  max: number
  count: number
  isHigh: boolean
}

export interface FeedActivityDatum {
  feed: string
  fullTitle: string
  total: number
  high: number
  avgScore: number
}

export interface RadarAxisDatum {
  dimension: string
  value: number
  fullMark: 100
}

export interface RadarSummary {
  total: number
  highCount: number
  highShare: number
  avgScore: number
  topScore: number
}

const BUCKET_DEFS: { bucket: string; min: number; max: number }[] = [
  { bucket: '0–19', min: 0, max: 19 },
  { bucket: '20–39', min: 20, max: 39 },
  { bucket: '40–59', min: 40, max: 59 },
  { bucket: '60–69', min: 60, max: 69 },
  { bucket: '70–84', min: 70, max: 84 },
  { bucket: '85–100', min: 85, max: 100 },
]

export function getItemDimensions(item: FeedItem): SignalDimensions {
  if (item.scoreDimensions) return item.scoreDimensions
  return explainScore(item.title, item.description, item.pubDate, {
    feedId: item.feedId,
    feedTitle: item.feedTitle,
    link: item.link,
  }).dimensions
}

export function buildScoreHistogram(items: FeedItem[]): HistogramBucket[] {
  const counts = BUCKET_DEFS.map((def) => ({
    ...def,
    count: 0,
    isHigh: def.min >= 70,
  }))
  for (const item of items) {
    const score = item.score ?? 0
    const bucket = counts.find((b) => score >= b.min && score <= b.max)
    if (bucket) bucket.count += 1
  }
  return counts
}

export function buildFeedActivity(items: FeedItem[]): FeedActivityDatum[] {
  const map = new Map<
    string,
    { fullTitle: string; total: number; high: number; scoreSum: number }
  >()
  for (const item of items) {
    const score = item.score ?? 0
    const curr = map.get(item.feedTitle) ?? {
      fullTitle: item.feedTitle,
      total: 0,
      high: 0,
      scoreSum: 0,
    }
    curr.total += 1
    if (score >= 70) curr.high += 1
    curr.scoreSum += score
    map.set(item.feedTitle, curr)
  }

  return [...map.values()]
    .map((entry) => {
      const compact = entry.fullTitle
        .replace('AWS Machine Learning Blog', 'AWS ML Blog')
        .replace('AWS News Blog', 'AWS News')
        .replace('HN Top Stories', 'HN Top')
      return {
        feed:
          compact.length > 14 ? `${compact.slice(0, 12).trimEnd()}…` : compact,
        fullTitle: entry.fullTitle,
        total: entry.total,
        high: entry.high,
        avgScore: entry.total > 0 ? Math.round(entry.scoreSum / entry.total) : 0,
      }
    })
    .sort((a, b) => b.high - a.high || b.avgScore - a.avgScore)
}

export function buildItemRadarData(item: FeedItem): RadarAxisDatum[] {
  const d = getItemDimensions(item)
  return [
    { dimension: 'Relevance', value: d.relevance, fullMark: 100 },
    { dimension: 'Recency', value: d.recency, fullMark: 100 },
    { dimension: 'Authority', value: d.authority, fullMark: 100 },
    { dimension: 'Novelty', value: d.novelty, fullMark: 100 },
  ]
}

export function computeRadarSummary(items: FeedItem[]): RadarSummary {
  const total = items.length
  if (total === 0) {
    return { total: 0, highCount: 0, highShare: 0, avgScore: 0, topScore: 0 }
  }
  let highCount = 0
  let sum = 0
  let topScore = 0
  for (const it of items) {
    const s = it.score ?? 0
    sum += s
    if (s >= 70) highCount += 1
    if (s > topScore) topScore = s
  }
  return {
    total,
    highCount,
    highShare: Math.round((highCount / total) * 100),
    avgScore: Math.round(sum / total),
    topScore,
  }
}
