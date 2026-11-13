/**
 * Deterministic 4-dimension signal score (0-100). No LLM involved — this is a
 * pure deterministic rubric across Relevance, Recency, Authority, and Novelty,
 * and must never be labeled "AI".
 * See .kiro/specs/resurrected-reader-v1/design.md for weights and formulas.
 */

export interface SignalDimensions {
  relevance: number
  recency: number
  authority: number
  novelty: number
}

export interface ScoreReason {
  label: string
  dimension: keyof SignalDimensions
  points: number
}

export interface ScoreBreakdown {
  score: number
  dimensions: SignalDimensions
  reasons: ScoreReason[]
}

export interface ScoreContext {
  feedId?: string
  feedTitle?: string
  link?: string
}

export const SIGNAL_DIMENSION_META: ReadonlyArray<{
  key: keyof SignalDimensions
  label: string
  weight: number
}> = [
  { key: 'relevance', label: 'Relevance', weight: 42 },
  { key: 'recency', label: 'Recency', weight: 24 },
  { key: 'authority', label: 'Authority', weight: 18 },
  { key: 'novelty', label: 'Novelty', weight: 16 },
]

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function explainScore(
  title: string,
  description: string,
  pubDate: string,
  context: ScoreContext = {},
): ScoreBreakdown {
  const hay = `${title} ${description}`.toLowerCase()
  const titleLow = title.toLowerCase()
  const reasons: ScoreReason[] = []

  // 1. Relevance (0-100, weight 42%): AWS, Kiro, agents, LLMs, security, builder infra
  let relevance = 0
  if (/\bkiro\b/.test(hay)) {
    relevance += 45
    reasons.push({ label: 'Mentions Kiro', dimension: 'relevance', points: 45 })
  }
  if (
    /\b(aws|amazon bedrock|amazon s3|dynamodb|lambda|ecs|trainium|sagemaker|step functions)\b/.test(
      hay,
    )
  ) {
    relevance += 35
    reasons.push({ label: 'AWS cloud / services', dimension: 'relevance', points: 35 })
  }
  if (/\b(agent|agentic|agentcore|mcp|a2a|multi-agent)\b/.test(hay)) {
    relevance += 30
    reasons.push({ label: 'Agent / MCP / A2A topic', dimension: 'relevance', points: 30 })
  }
  if (
    /\b(llm|ai coding|coding agent|frontier ai|inference|bedrock|claude|gpt|generative|rag|knowledge base)\b/.test(
      hay,
    )
  ) {
    relevance += 25
    reasons.push({ label: 'LLM / AI coding topic', dimension: 'relevance', points: 25 })
  }
  if (/\b(security|iam|vulnerabilit|least-privilege|guardrail|access control)\b/.test(hay)) {
    relevance += 20
    reasons.push({ label: 'Security / IAM baseline', dimension: 'relevance', points: 20 })
  }
  if (
    /\b(startup|roi|cost|migration|serverless|gateway|emulator|vercel|open[- ]source)\b/.test(
      hay,
    )
  ) {
    relevance += 15
    reasons.push({ label: 'Builder ops / cost / OSS', dimension: 'relevance', points: 15 })
  }
  relevance = clamp100(relevance)

  // 2. Recency (0-100, weight 24%): smooth deterministic decay curve
  let recency = 14
  const pubMs = new Date(pubDate).getTime()
  if (Number.isFinite(pubMs)) {
    const hours = Math.max(0, (Date.now() - pubMs) / 3_600_000)
    if (hours <= 6) {
      recency = 100
      reasons.push({ label: 'Published ≤6h ago', dimension: 'recency', points: 100 })
    } else if (hours <= 24) {
      recency = 88
      reasons.push({ label: 'Published within 24h', dimension: 'recency', points: 88 })
    } else if (hours <= 48) {
      recency = 74
      reasons.push({ label: 'Published within 48h', dimension: 'recency', points: 74 })
    } else if (hours <= 72) {
      recency = 62
      reasons.push({ label: 'Published within 3d', dimension: 'recency', points: 62 })
    } else if (hours <= 168) {
      recency = 46
      reasons.push({ label: 'Published within 7d', dimension: 'recency', points: 46 })
    } else if (hours <= 336) {
      recency = 28
      reasons.push({ label: 'Published within 14d', dimension: 'recency', points: 28 })
    }
  }

  // 3. Authority (0-100, weight 18%): source origin + technical specification depth
  const feedId = context.feedId ?? ''
  const link = context.link ?? ''
  const isAwsOfficial =
    feedId.startsWith('aws') || /aws\.amazon\.com/i.test(link)
  let authority = isAwsOfficial ? 72 : 44
  if (isAwsOfficial) {
    reasons.push({ label: 'Official AWS engineering source', dimension: 'authority', points: 72 })
  }
  if (
    /\b(api|sdk|iam|cur 2\.0|architecture|runtime|protocol|benchmark|iceberg|open[- ]source|github)\b/.test(
      hay,
    )
  ) {
    authority += 14
    reasons.push({ label: 'Technical depth cues (API/SDK/arch)', dimension: 'authority', points: 14 })
  }
  if (description.trim().length >= 220) {
    authority += 10
    reasons.push({ label: 'Substantive article summary', dimension: 'authority', points: 10 })
  }
  if (/\b(show hn|ask hn|rfc|spec|documentation)\b/.test(hay)) {
    authority += 12
    reasons.push({ label: 'Builder discussion / spec link', dimension: 'authority', points: 12 })
  }
  authority = clamp100(authority)

  // 4. Novelty (0-100, weight 16%): releases, hands-on builds, emerging tooling
  let novelty = 25
  if (
    /\b(introducing|now available|now offer|generally available|announcing|launch|release|v2|next generation|now accepts)\b/.test(
      hay,
    )
  ) {
    novelty += 30
    reasons.push({ label: 'New release / GA announcement', dimension: 'novelty', points: 30 })
  }
  if (
    /\b(how |build |deploy |migrate|test your|optimizing|track and cap|fine-grained)\b/.test(
      titleLow,
    )
  ) {
    novelty += 25
    reasons.push({ label: 'Hands-on implementation guide', dimension: 'novelty', points: 25 })
  }
  if (
    /\b(kiro|agentcore|a2a|mcp|x402|sglang|trainium|iceberg|litellm|emulator)\b/.test(
      hay,
    )
  ) {
    novelty += 25
    reasons.push({ label: 'Emerging builder stack', dimension: 'novelty', points: 25 })
  }
  novelty = clamp100(novelty)

  const score = clamp100(
    relevance * 0.42 + recency * 0.24 + authority * 0.18 + novelty * 0.16,
  )

  return {
    score,
    dimensions: {
      relevance,
      recency,
      authority,
      novelty,
    },
    reasons,
  }
}

export function scoreItem(
  title: string,
  description: string,
  pubDate: string,
  context: ScoreContext = {},
): number {
  return explainScore(title, description, pubDate, context).score
}
