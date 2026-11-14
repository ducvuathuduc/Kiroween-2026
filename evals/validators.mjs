/**
 * Deterministic eval validators shared by promptfoo configs and node:test suites.
 */

export const MAX_SUMMARY_WORDS = 100

const URL_REGEX = /\bhttps?:\/\/[^\s"'<>)\]]+/gi

export function countWords(text) {
  if (typeof text !== 'string') return 0
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

export function parseSummaryOutput(outputText) {
  if (typeof outputText === 'object' && outputText !== null) {
    return validateSummaryObject(outputText)
  }
  if (typeof outputText !== 'string') return null
  const cleaned = outputText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1))
    return validateSummaryObject(parsed)
  } catch {
    return null
  }
}

function validateSummaryObject(raw) {
  if (!raw || typeof raw !== 'object') return null
  const tldr = typeof raw.tldr === 'string' ? raw.tldr.trim() : ''
  const whyMatters =
    typeof raw.whyMatters === 'string' ? raw.whyMatters.trim() : ''
  const takeaways = Array.isArray(raw.takeaways)
    ? raw.takeaways
        .filter((item) => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
    : []

  if (!tldr || !whyMatters || takeaways.length === 0) {
    return null
  }
  return { tldr, takeaways, whyMatters }
}

export function countSummaryWords(summary) {
  if (!summary) return 0
  const parts = [summary.tldr, ...summary.takeaways, summary.whyMatters]
  return parts.reduce((acc, part) => acc + countWords(part), 0)
}

export function extractUrls(text) {
  if (typeof text !== 'string') return []
  const matches = text.match(URL_REGEX) ?? []
  return matches.map((u) => u.replace(/[.,;:!?]+$/, ''))
}

export function normalizeUrlForCompare(raw) {
  try {
    const u = new URL(raw)
    const host = u.hostname.toLowerCase().replace(/\.$/, '')
    const path = u.pathname.replace(/\/+$/, '') || '/'
    return `${u.protocol.toLowerCase()}//${host}${path}${u.search}`
  } catch {
    return String(raw).trim().toLowerCase().replace(/\/+$/, '')
  }
}

export function findInventedUrls(outputText, allowedSources) {
  const allowedText = Array.isArray(allowedSources)
    ? allowedSources.filter((s) => typeof s === 'string').join('\n')
    : String(allowedSources ?? '')

  const allowedSet = new Set(
    extractUrls(allowedText).map((url) => normalizeUrlForCompare(url)),
  )

  const outputUrls = extractUrls(
    typeof outputText === 'string'
      ? outputText
      : JSON.stringify(outputText ?? ''),
  )

  const invented = []
  for (const url of outputUrls) {
    const norm = normalizeUrlForCompare(url)
    if (!allowedSet.has(norm)) {
      invented.push(url)
    }
  }
  return invented
}

export function validateDeterministicSummary(outputText, context) {
  const vars = context?.vars ?? context ?? {}
  const parsed = parseSummaryOutput(outputText)
  if (!parsed) {
    return {
      pass: false,
      score: 0,
      reason: 'Summary output is not valid JSON with non-empty tldr, takeaways, and whyMatters.',
    }
  }

  const wordCount = countSummaryWords(parsed)
  if (wordCount > MAX_SUMMARY_WORDS) {
    return {
      pass: false,
      score: 0,
      reason: `Summary exceeds ${MAX_SUMMARY_WORDS}-word ceiling (${wordCount} words).`,
    }
  }

  const invented = findInventedUrls(outputText, [vars.link, vars.content])
  if (invented.length > 0) {
    return {
      pass: false,
      score: 0,
      reason: `Summary invented URL(s) not in source article: ${invented.join(', ')}`,
    }
  }

  return {
    pass: true,
    score: 1,
    reason: `Valid summary JSON (${wordCount}/${MAX_SUMMARY_WORDS} words, 0 invented URLs).`,
  }
}

export function validateGoldenScoreOutput(outputText, expected = {}) {
  let breakdown
  try {
    breakdown =
      typeof outputText === 'string' ? JSON.parse(outputText) : outputText
  } catch {
    return {
      pass: false,
      score: 0,
      reason: 'Scoring provider output is not valid JSON.',
    }
  }

  if (
    !breakdown ||
    typeof breakdown.score !== 'number' ||
    !Number.isFinite(breakdown.score) ||
    !breakdown.dimensions ||
    !Array.isArray(breakdown.reasons)
  ) {
    return {
      pass: false,
      score: 0,
      reason: 'Missing score, dimensions, or reasons in ScoreBreakdown.',
    }
  }

  const { score, dimensions, reasons } = breakdown

  if (
    typeof expected.exactScore === 'number' &&
    score !== expected.exactScore
  ) {
    return {
      pass: false,
      score: 0,
      reason: `Expected score ${expected.exactScore}, got ${score}.`,
    }
  }
  if (typeof expected.minScore === 'number' && score < expected.minScore) {
    return {
      pass: false,
      score: 0,
      reason: `Expected score >= ${expected.minScore}, got ${score}.`,
    }
  }
  if (typeof expected.maxScore === 'number' && score > expected.maxScore) {
    return {
      pass: false,
      score: 0,
      reason: `Expected score <= ${expected.maxScore}, got ${score}.`,
    }
  }

  for (const dim of ['relevance', 'recency', 'authority', 'novelty']) {
    const val = dimensions[dim]
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      return {
        pass: false,
        score: 0,
        reason: `Dimension ${dim} is not finite: ${val}`,
      }
    }
    const exactKey = `exact${dim[0].toUpperCase()}${dim.slice(1)}`
    const minKey = `min${dim[0].toUpperCase()}${dim.slice(1)}`
    if (typeof expected[exactKey] === 'number' && val !== expected[exactKey]) {
      return {
        pass: false,
        score: 0,
        reason: `Expected ${dim}=${expected[exactKey]}, got ${val}.`,
      }
    }
    if (typeof expected[minKey] === 'number' && val < expected[minKey]) {
      return {
        pass: false,
        score: 0,
        reason: `Expected ${dim}>=${expected[minKey]}, got ${val}.`,
      }
    }
  }

  if (
    typeof expected.minReasons === 'number' &&
    reasons.length < expected.minReasons
  ) {
    return {
      pass: false,
      score: 0,
      reason: `Expected >= ${expected.minReasons} reasons, got ${reasons.length}.`,
    }
  }

  if (typeof expected.officialSource === 'boolean') {
    const hasOfficialReason = reasons.some(
      (r) => r.label === 'Official AWS engineering source',
    )
    if (hasOfficialReason !== expected.officialSource) {
      return {
        pass: false,
        score: 0,
        reason: `Expected officialSource=${expected.officialSource}, got ${hasOfficialReason}.`,
      }
    }
  }

  if (expected.requireFreshGtStale && typeof breakdown.staleScore === 'number') {
    if (
      !(
        score > breakdown.staleScore &&
        dimensions.recency > breakdown.staleRecency
      )
    ) {
      return {
        pass: false,
        score: 0,
        reason: `Expected fresh (${score}, recency ${dimensions.recency}) > stale (${breakdown.staleScore}, recency ${breakdown.staleRecency}).`,
      }
    }
  }

  return {
    pass: true,
    score: 1,
    reason: `Deterministic score=${score} matches expected constraints.`,
  }
}

export function assertGoldenScore(outputText, context) {
  const vars = context?.vars ?? context ?? {}
  return validateGoldenScoreOutput(outputText, vars.expected ?? {})
}

