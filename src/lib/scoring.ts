/**
 * Deterministic signal score (0-100). No LLM involved — this is a
 * keyword + recency formula, and must never be labeled "AI" in the UI.
 * See .kiro/specs/resurrected-reader-v1/design.md for the formula.
 */
export function scoreItem(
  title: string,
  description: string,
  pubDate: string,
): number {
  const hay = `${title} ${description}`.toLowerCase()
  let score = 0
  if (hay.includes('kiro')) score += 25
  if (hay.includes('aws')) score += 15
  if (hay.includes('agent') || hay.includes('agentic')) score += 20
  if (hay.includes('llm') || hay.includes('ai coding')) score += 15
  if (hay.includes('startup')) score += 10
  if (hay.includes('security')) score += 10
  const ageMs = Date.now() - new Date(pubDate).getTime()
  const day = 86_400_000
  if (ageMs < day) score += 15
  else if (ageMs < 7 * day) score += 8
  return Math.min(100, score)
}
