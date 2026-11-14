import { SUMMARY_JSON_SYSTEM_PROMPT } from '../../server/summaryPrompt.ts'

function extractSystemContent(prompt) {
  const raw = String(prompt ?? '')
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed
        .map((m) => (m && typeof m.content === 'string' ? m.content : ''))
        .join('\n')
    }
  } catch {
    // Plain string prompt fallback
  }
  return raw
}

export default class SummaryFixtureProvider {
  id() {
    return 'resurrected-reader-summary-fixture'
  }

  async callApi(prompt, context) {
    const vars = context?.vars ?? {}
    const promptText = extractSystemContent(prompt)
    if (!promptText.includes(SUMMARY_JSON_SYSTEM_PROMPT)) {
      return {
        error:
          'Prompt did not originate from shared server/summaryPrompt.ts SUMMARY_JSON_SYSTEM_PROMPT.',
      }
    }
    if (!vars.candidateSummary) {
      return { error: `Missing candidateSummary for fixture ${vars.id ?? 'unknown'}.` }
    }
    return {
      output: JSON.stringify(vars.candidateSummary),
    }
  }
}
