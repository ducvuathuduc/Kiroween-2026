/**
 * Deterministic signal score (0-100). No LLM involved — this is a
 * keyword + recency formula, and must never be labeled "AI".
 * See .kiro/specs/resurrected-reader-v1/design.md for the formula.
 */
export interface ScoreReason {
  label: string
  points: number
}

export interface ScoreBreakdown {
  score: number
  reasons: ScoreReason[]
}

export function explainScore(
  title: string,
  description: string,
  pubDate: string,
): ScoreBreakdown {
  const hay = `${title} ${description}`.toLowerCase()
  const reasons: ScoreReason[] = []
  let score = 0

  if (hay.includes('kiro')) {
    score += 25
    reasons.push({ label: 'Mentions Kiro', points: 25 })
  }
  if (hay.includes('aws')) {
    score += 15
    reasons.push({ label: 'Mentions AWS', points: 15 })
  }
  if (hay.includes('agent') || hay.includes('agentic')) {
    score += 20
    reasons.push({ label: 'Agent / agentic topic', points: 20 })
  }
  if (hay.includes('llm') || hay.includes('ai coding')) {
    score += 15
    reasons.push({ label: 'LLM / AI coding topic', points: 15 })
  }
  if (hay.includes('startup')) {
    score += 10
    reasons.push({ label: 'Startup context', points: 10 })
  }
  if (hay.includes('security')) {
    score += 10
    reasons.push({ label: 'Security relevance', points: 10 })
  }

  const pubMs = new Date(pubDate).getTime()
  if (Number.isFinite(pubMs)) {
    const ageMs = Date.now() - pubMs
    const day = 86_400_000
    if (ageMs < day) {
      score += 15
      reasons.push({ label: 'Published within 24h', points: 15 })
    } else if (ageMs < 7 * day) {
      score += 8
      reasons.push({ label: 'Published within 7d', points: 8 })
    }
  }

  return {
    score: Math.min(100, score),
    reasons,
  }
}

export function scoreItem(
  title: string,
  description: string,
  pubDate: string,
): number {
  return explainScore(title, description, pubDate).score
}
