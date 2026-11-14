import type { FeedItem } from './feeds'

export type Feedback = 'read' | 'skip' | 'star'
type Article = Pick<FeedItem, 'id' | 'title' | 'description'>

const TOPICS: ReadonlyArray<[string, RegExp]> = [
  ['Bedrock', /\b(bedrock|agentcore)\b/i],
  ['AWS', /\b(aws|amazon|lambda|s3|dynamodb)\b/i],
  ['Agents', /\b(agent|agents|agentic|mcp|a2a)\b/i],
  ['Machine learning', /\b(model|models|inference|llm|sagemaker)\b/i],
  ['Security', /\b(security|iam|vulnerability|guardrail)\b/i],
  ['Development', /\b(code|coding|developer|api|sdk|software)\b/i],
]
const VECTOR_SIZE = 128

export interface TasteProfile {
  topicWeights: Record<string, number>
  likedCentroid: number[]
  dislikedCentroid: number[]
  counts: { liked: number; disliked: number }
}

export function emptyProfile(): TasteProfile {
  return { topicWeights: {}, likedCentroid: [], dislikedCentroid: [], counts: { liked: 0, disliked: 0 } }
}

/** Synthetic examples for the explicitly labeled demo, not actual feed history. */
export function demoProfile(): TasteProfile {
  const examples: Array<[Article, Feedback]> = [
    [{ id: 'demo-1', title: 'AWS Bedrock agents', description: 'Build Bedrock AgentCore applications on AWS' }, 'read'],
    [{ id: 'demo-2', title: 'Amazon Bedrock models', description: 'AWS Bedrock inference and machine learning' }, 'read'],
    [{ id: 'demo-3', title: 'AWS developer tools', description: 'Develop and deploy cloud agents' }, 'star'],
    [{ id: 'demo-4', title: 'Gardening', description: 'Garden flowers' }, 'skip'],
    [{ id: 'demo-5', title: 'Cooking', description: 'Recipes for dinner' }, 'skip'],
  ]
  return examples.reduce((profile, [item, feedback]) => recordFeedback(item.id, feedback, item, profile), emptyProfile())
}

function topics(item: Article): string[] {
  const text = `${item.title} ${item.description}`
  return TOPICS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
}

function vector(item: Article): number[] {
  const values = Array<number>(VECTOR_SIZE).fill(0)
  const words = `${item.title} ${item.description}`.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []
  for (const word of words.slice(0, 1000)) {
    let hash = 2166136261
    for (const char of word) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
    values[(hash >>> 0) % VECTOR_SIZE] += 1
  }
  const norm = Math.hypot(...values)
  return norm ? values.map((value) => value / norm) : values
}

function cosine(a: number[], b: number[]): number {
  const normA = Math.hypot(...a)
  const normB = Math.hypot(...b)
  if (!normA || !normB) return 0
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0) / (normA * normB)
}

/** The caller supplies the matching article; an ID alone has no text to learn from. */
export function recordFeedback(itemId: string, feedback: Feedback, item: Article, profile: TasteProfile): TasteProfile {
  if (item.id !== itemId) throw new Error('Feedback article does not match its ID.')
  const positive = feedback !== 'skip'
  const count = positive ? profile.counts.liked : profile.counts.disliked
  const old = positive ? profile.likedCentroid : profile.dislikedCentroid
  const next = vector(item).map((value, index) => ((old[index] ?? 0) * count + value) / (count + 1))
  const weights = { ...profile.topicWeights }
  for (const topic of topics(item)) weights[topic] = Math.max(-8, Math.min(8, (weights[topic] ?? 0) + (positive ? 1 : -1)))
  return {
    topicWeights: weights,
    likedCentroid: positive ? next : profile.likedCentroid,
    dislikedCentroid: positive ? profile.dislikedCentroid : next,
    counts: { liked: profile.counts.liked + Number(positive), disliked: profile.counts.disliked + Number(!positive) },
  }
}

export function personalBoost(item: Article, profile: TasteProfile): number {
  if (!profile.counts.liked && !profile.counts.disliked) return 0
  const itemVector = vector(item)
  const centroid = cosine(itemVector, profile.likedCentroid) - cosine(itemVector, profile.dislikedCentroid)
  const affinities = topics(item).map((topic) => 2 / (1 + Math.exp(-(profile.topicWeights[topic] ?? 0))) - 1)
  const affinity = affinities.length ? affinities.reduce((sum, value) => sum + value, 0) / affinities.length : 0
  return Math.max(-10, Math.min(10, Math.round(6 * centroid + 4 * affinity)))
}

export function explainBoost(item: Article, profile: TasteProfile): string {
  const boost = personalBoost(item, profile)
  if (!boost) return 'No personal adjustment for this item.'
  const topic = topics(item).sort((a, b) => Math.abs(profile.topicWeights[b] ?? 0) - Math.abs(profile.topicWeights[a] ?? 0))[0]
  return topic && profile.topicWeights[topic]
    ? `Based on your feedback about ${topic} and similar articles.`
    : 'Based on your feedback on similar articles.'
}
