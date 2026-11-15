import { selectDailyBriefingItems } from './briefing'
import type { FeedItem } from './feeds'
import type { SignalDimensions } from './scoring'
import { cosineSimilarity, DEFAULT_MIN_SIMILARITY } from './vectorMath'

export const MIN_TOPIC_OVERLAP_SCORE = 0.12
export const RESURFACE_MIN_AGE_DAYS = 30
const DAY_MS = 86_400_000

export type SecondBrainMatchKind = 'semantic' | 'topic-overlap'

export interface PastReadRecord {
  id: string
  feedId: string
  feedTitle: string
  title: string
  link: string
  description: string
  pubDate: string
  score?: number
  scoreDimensions?: SignalDimensions
  readAt?: string
  savedAt?: string
}

export type SecondBrainArticle = Pick<
  FeedItem,
  'id' | 'feedId' | 'feedTitle' | 'title' | 'link' | 'description' | 'pubDate'
>

export interface SecondBrainMatch {
  item: PastReadRecord
  score: number
  matchKind: SecondBrainMatchKind
  sharedTopics: string[]
  interactedAt: string
  why?: string
}

export interface ResurfacedMatch extends SecondBrainMatch {
  matchedTopStory: {
    id: string
    title: string
  }
  daysAgo: number
}

const CURATED_TOPICS: ReadonlyArray<[string, RegExp]> = [
  ['Kiro', /\bkiro\b/i],
  ['Amazon Bedrock', /\b(bedrock|agentcore)\b/i],
  ['AWS', /\b(aws|amazon|lambda|s3|dynamodb|ecs|eks|ec2|step functions|cloudfront|cloudwatch)\b/i],
  ['AI Agents', /\b(agent|agents|agentic|multi-agent|tool[- ]calling)\b/i],
  ['MCP / A2A', /\b(mcp|a2a|model context protocol|agent2agent)\b/i],
  ['LLM & Inference', /\b(llm|llms|inference|model|models|sagemaker|trainium|claude|gemini|gpt|openai|anthropic|rag|embedding|embeddings)\b/i],
  ['Security & IAM', /\b(security|iam|guardrail|guardrails|vulnerabilit\w*|least-privilege|oauth|oidc)\b/i],
  ['Serverless & Workers', /\b(serverless|lambda|worker|workers|cloudflare|edge|hono|durable)\b/i],
  ['Data & Analytics', /\b(iceberg|parquet|duckdb|postgres|sql|vector|lakehouse|s3 tables)\b/i],
  ['Frontend & Web', /\b(react|vite|typescript|tailwind|pwa|wasm|webgpu|css|browser)\b/i],
  ['Cost & Ops', /\b(cost|roi|finops|cur 2\.0|observability|telemetry|latency|evals|benchmark)\b/i],
  ['Open Source', /\b(open[- ]source|github|rfc|spec|sdk|cli)\b/i],
]

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'your', 'about',
  'using', 'how', 'new', 'now', 'via', 'are', 'was', 'were', 'has', 'have',
  'had', 'will', 'can', 'not', 'all', 'more', 'than', 'over', 'when', 'what',
  'why', 'who', 'you', 'our', 'out', 'one', 'two', 'use', 'used', 'uses',
  'build', 'building', 'built', 'read', 'post', 'blog', 'news', 'week', 'today',
  'here', 'their', 'they', 'them', 'also', 'just', 'like', 'make', 'makes',
  'made', 'get', 'gets', 'getting', 'most', 'some', 'many', 'such', 'only',
  'very', 'much', 'even', 'first', 'next', 'last', 'each', 'well', 'work',
  'works', 'working', 'show', 'introducing', 'announcing', 'available', 'generally',
  'release', 'released', 'support', 'supports', 'guide', 'overview', 'article',
  'system', 'systems', 'app', 'apps', 'application', 'applications', 'tool',
  'tools', 'data', 'code', 'way', 'ways', 'step', 'steps', 'best', 'real',
  'time', 'based', 'without', 'between', 'across', 'under', 'after', 'before',
  'http', 'https', 'www', 'com', 'org', 'html',
])

export interface ExtractedTopics {
  curated: string[]
  tokenWeights: Map<string, number>
}

function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9][a-z0-9-]{1,}/g) ?? []
  const tokens: string[] = []
  for (const raw of matches) {
    const clean = raw.replace(/^-+|-+$/g, '')
    if (clean.length < 3) continue
    if (/^\d+$/.test(clean)) continue
    if (STOPWORDS.has(clean)) continue
    tokens.push(clean)
  }
  return tokens
}

export function extractItemTopics(
  item: Pick<FeedItem, 'title' | 'description'>,
): ExtractedTopics {
  const fullText = `${item.title} ${item.description}`
  const curated = CURATED_TOPICS
    .filter(([, pattern]) => pattern.test(fullText))
    .map(([label]) => label)

  const tokenWeights = new Map<string, number>()
  const titleTokens = new Set(tokenize(item.title))
  const descTokens = new Set(tokenize(item.description))

  for (const tok of titleTokens) {
    tokenWeights.set(tok, (tokenWeights.get(tok) ?? 0) + 2)
  }
  for (const tok of descTokens) {
    tokenWeights.set(tok, (tokenWeights.get(tok) ?? 0) + 1)
  }

  return { curated, tokenWeights }
}

export function findSharedTopics(
  a: Pick<FeedItem, 'title' | 'description'>,
  b: Pick<FeedItem, 'title' | 'description'>,
  limit = 4,
): string[] {
  const topicsA = extractItemTopics(a)
  const topicsB = extractItemTopics(b)
  const curatedBSet = new Set(topicsB.curated)

  const sharedCurated = topicsA.curated.filter((label) => curatedBSet.has(label))
  const coveredLower = new Set(
    sharedCurated.flatMap((label) => label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)),
  )

  const sharedTokens: Array<{ token: string; weight: number }> = []
  for (const [token, weightA] of topicsA.tokenWeights) {
    const weightB = topicsB.tokenWeights.get(token)
    if (!weightB) continue
    if (coveredLower.has(token)) continue
    sharedTokens.push({ token, weight: weightA + weightB })
  }

  sharedTokens.sort(
    (x, y) =>
      y.weight - x.weight ||
      y.token.length - x.token.length ||
      x.token.localeCompare(y.token),
  )

  const result: string[] = [...sharedCurated]
  for (const entry of sharedTokens) {
    if (result.length >= limit) break
    result.push(entry.token)
  }
  return result.slice(0, limit)
}

export function computeTopicOverlapScore(
  a: Pick<FeedItem, 'title' | 'description'>,
  b: Pick<FeedItem, 'title' | 'description'>,
): { score: number; sharedTopics: string[] } {
  const topicsA = extractItemTopics(a)
  const topicsB = extractItemTopics(b)
  const sharedTopics = findSharedTopics(a, b, 4)

  if (sharedTopics.length === 0) {
    return { score: 0, sharedTopics: [] }
  }

  let sharedWeight = 0
  let totalWeightA = 0
  let totalWeightB = 0

  for (const [tok, wA] of topicsA.tokenWeights) {
    totalWeightA += wA
    const wB = topicsB.tokenWeights.get(tok)
    if (wB) sharedWeight += Math.min(wA, wB)
  }
  for (const wB of topicsB.tokenWeights.values()) {
    totalWeightB += wB
  }

  const tokenDice =
    totalWeightA + totalWeightB > 0
      ? (2 * sharedWeight) / (totalWeightA + totalWeightB)
      : 0

  const curatedBSet = new Set(topicsB.curated)
  const sharedCuratedCount = topicsA.curated.filter((t) => curatedBSet.has(t)).length
  const unionCuratedCount = new Set([...topicsA.curated, ...topicsB.curated]).size
  const topicJaccard =
    unionCuratedCount > 0 ? sharedCuratedCount / unionCuratedCount : 0

  const rawScore =
    unionCuratedCount > 0
      ? 0.45 * topicJaccard + 0.55 * tokenDice
      : tokenDice

  const score = Math.max(0, Math.min(1, Math.round(rawScore * 1000) / 1000))
  return { score, sharedTopics }
}

export function getInteractionIso(record: Pick<PastReadRecord, 'readAt' | 'savedAt'>): string | null {
  const readMs = record.readAt ? Date.parse(record.readAt) : Number.NaN
  const savedMs = record.savedAt ? Date.parse(record.savedAt) : Number.NaN
  const validRead = Number.isFinite(readMs) ? readMs : -1
  const validSaved = Number.isFinite(savedMs) ? savedMs : -1
  const best = Math.max(validRead, validSaved)
  return best >= 0 ? new Date(best).toISOString() : null
}

export function pastReadToFeedItem(record: PastReadRecord): FeedItem {
  return {
    id: record.id,
    feedId: record.feedId,
    feedTitle: record.feedTitle,
    title: record.title,
    link: record.link,
    pubDate: record.pubDate,
    description: record.description,
    score: record.score,
    scoreDimensions: record.scoreDimensions,
  }
}

export interface RankPastReadsOptions {
  limit?: number
  allowSemantic?: boolean
  vectors?: Record<string, number[]>
  semanticScores?: Record<string, number>
  minSemanticSimilarity?: number
  minTopicOverlapScore?: number
}

function isSameItem(
  a: Pick<FeedItem, 'id' | 'title'>,
  b: Pick<FeedItem, 'id' | 'title'>,
): boolean {
  if (a.id === b.id) return true
  const titleA = a.title.trim().toLowerCase()
  const titleB = b.title.trim().toLowerCase()
  return Boolean(titleA && titleA === titleB)
}

function scorePair(
  target: Pick<FeedItem, 'id' | 'title' | 'description'>,
  candidate: PastReadRecord,
  options: {
    allowSemantic: boolean
    vectors?: Record<string, number[]>
    semanticScores?: Record<string, number>
    minSemanticSimilarity: number
    minTopicOverlapScore: number
  },
): { score: number; matchKind: SecondBrainMatchKind; sharedTopics: string[] } | null {
  const {
    allowSemantic,
    vectors,
    semanticScores,
    minSemanticSimilarity,
    minTopicOverlapScore,
  } = options

  if (allowSemantic) {
    let sim: number | null = null
    if (semanticScores && typeof semanticScores[candidate.id] === 'number') {
      sim = semanticScores[candidate.id]
    } else if (vectors && vectors[target.id] && vectors[candidate.id]) {
      sim = cosineSimilarity(vectors[target.id], vectors[candidate.id])
    }

    if (sim !== null && Number.isFinite(sim)) {
      const clampedSim = Math.max(0, Math.min(1, sim))
      if (clampedSim >= minSemanticSimilarity) {
        const shared = findSharedTopics(target, candidate, 4)
        const fallbackTopics =
          shared.length > 0
            ? shared
            : extractItemTopics(candidate).curated.slice(0, 2)
        return {
          score: clampedSim,
          matchKind: 'semantic',
          sharedTopics:
            fallbackTopics.length > 0 ? fallbackTopics : ['Semantic similarity'],
        }
      }
      return null
    }
  }

  const overlap = computeTopicOverlapScore(target, candidate)
  if (overlap.sharedTopics.length === 0 || overlap.score < minTopicOverlapScore) {
    return null
  }
  return {
    score: overlap.score,
    matchKind: 'topic-overlap',
    sharedTopics: overlap.sharedTopics,
  }
}

export function rankRelatedPastReads(
  target: Pick<FeedItem, 'id' | 'title' | 'description'>,
  pastReads: readonly PastReadRecord[],
  options: RankPastReadsOptions = {},
): SecondBrainMatch[] {
  const limit = options.limit ?? 3
  const allowSemantic = Boolean(options.allowSemantic)
  const minSemanticSimilarity =
    options.minSemanticSimilarity ?? DEFAULT_MIN_SIMILARITY
  const minTopicOverlapScore =
    options.minTopicOverlapScore ?? MIN_TOPIC_OVERLAP_SCORE

  const matches: SecondBrainMatch[] = []
  for (const record of pastReads) {
    if (isSameItem(target, record)) continue
    const interactedAt = getInteractionIso(record)
    if (!interactedAt) continue

    const scored = scorePair(target, record, {
      allowSemantic,
      vectors: options.vectors,
      semanticScores: options.semanticScores,
      minSemanticSimilarity,
      minTopicOverlapScore,
    })
    if (!scored) continue

    matches.push({
      item: record,
      score: scored.score,
      matchKind: scored.matchKind,
      sharedTopics: scored.sharedTopics,
      interactedAt,
    })
  }

  return matches
    .sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(b.interactedAt) - Date.parse(a.interactedAt),
    )
    .slice(0, limit)
}

export interface FindResurfacedOptions {
  nowMs?: number
  minAgeDays?: number
  topStoriesLimit?: number
  limit?: number
  allowSemantic?: boolean
  vectors?: Record<string, number[]>
  semanticScoresByTopStory?: Record<string, Record<string, number>>
  minSemanticSimilarity?: number
  minTopicOverlapScore?: number
}

export function findResurfacedReads(
  pastReads: readonly PastReadRecord[],
  currentItems: readonly FeedItem[],
  options: FindResurfacedOptions = {},
): ResurfacedMatch[] {
  const nowMs = options.nowMs ?? Date.now()
  const minAgeDays = options.minAgeDays ?? RESURFACE_MIN_AGE_DAYS
  const minAgeMs = minAgeDays * DAY_MS
  const topStories = selectDailyBriefingItems(
    currentItems,
    options.topStoriesLimit ?? 5,
  )
  if (topStories.length === 0 || pastReads.length === 0) return []

  const allowSemantic = Boolean(options.allowSemantic)
  const minSemanticSimilarity =
    options.minSemanticSimilarity ?? DEFAULT_MIN_SIMILARITY
  const minTopicOverlapScore =
    options.minTopicOverlapScore ?? MIN_TOPIC_OVERLAP_SCORE

  const resurfaced: ResurfacedMatch[] = []

  for (const record of pastReads) {
    const interactedAt = getInteractionIso(record)
    if (!interactedAt) continue
    const ageMs = nowMs - Date.parse(interactedAt)
    if (!Number.isFinite(ageMs) || ageMs <= minAgeMs) continue
    if (topStories.some((top) => isSameItem(top, record))) continue

    let bestForRecord: ResurfacedMatch | null = null
    for (const story of topStories) {
      const scored = scorePair(story, record, {
        allowSemantic,
        vectors: options.vectors,
        semanticScores: options.semanticScoresByTopStory?.[story.id],
        minSemanticSimilarity,
        minTopicOverlapScore,
      })
      if (!scored) continue

      if (!bestForRecord || scored.score > bestForRecord.score) {
        bestForRecord = {
          item: record,
          score: scored.score,
          matchKind: scored.matchKind,
          sharedTopics: scored.sharedTopics,
          interactedAt,
          matchedTopStory: {
            id: story.id,
            title: story.title,
          },
          daysAgo: Math.floor(ageMs / DAY_MS),
        }
      }
    }

    if (bestForRecord) {
      resurfaced.push(bestForRecord)
    }
  }

  return resurfaced
    .sort((a, b) => b.score - a.score || b.daysAgo - a.daysAgo)
    .slice(0, options.limit ?? 3)
}
