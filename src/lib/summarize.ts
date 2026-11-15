import type { GeminiSummary } from './kiroTask'
import { sanitizeProviderId } from './providers'

export function isJsonResponse(res: Pick<Response, 'headers'>): boolean {
  const ct = res.headers.get('content-type') ?? ''
  return ct.toLowerCase().includes('application/json')
}

function looksLikeHtml(text: string, contentType: string): boolean {
  if (contentType.toLowerCase().includes('text/html')) return true
  const trimmed = text.trimStart().slice(0, 64).toLowerCase()
  return (
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<head') ||
    trimmed.startsWith('<body') ||
    trimmed.startsWith('<')
  )
}

export async function parseSummarizeResponse(
  res: Response,
): Promise<GeminiSummary> {
  const contentType = res.headers.get('content-type') ?? ''
  const rawText = await res.text()

  if (!rawText.trim()) {
    throw new Error(`HTTP ${res.status} summarizing item`)
  }

  if (looksLikeHtml(rawText, contentType)) {
    throw new Error(
      res.ok
        ? 'AI summary API unavailable in this preview (received HTML instead of JSON).'
        : `HTTP ${res.status} — AI summary API returned HTML instead of JSON.`,
    )
  }

  let parsed: (Partial<GeminiSummary> & { error?: string }) | null = null
  try {
    const value: unknown = JSON.parse(rawText)
    if (value && typeof value === 'object') {
      parsed = value as Partial<GeminiSummary> & { error?: string }
    }
  } catch {
    throw new Error(
      res.ok
        ? 'AI summary API returned an invalid non-JSON response.'
        : `HTTP ${res.status} summarizing item`,
    )
  }

  if (!res.ok || !parsed?.tldr) {
    throw new Error(parsed?.error || `HTTP ${res.status} summarizing item`)
  }

  const rawRecord = parsed as Partial<GeminiSummary> & { error?: string }
  const mode =
    rawRecord.mode === 'workers-ai' ||
    rawRecord.mode === 'provider' ||
    rawRecord.mode === 'extractive'
      ? rawRecord.mode
      : undefined

  return {
    tldr: parsed.tldr,
    takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways : [],
    whyMatters: typeof parsed.whyMatters === 'string' ? parsed.whyMatters : '',
    provider: parsed.provider ? sanitizeProviderId(parsed.provider) : undefined,
    ...(typeof rawRecord.model === 'string' && rawRecord.model
      ? { model: rawRecord.model }
      : {}),
    ...(mode ? { mode } : {}),
    ...(typeof rawRecord.fallbackReason === 'string' && rawRecord.fallbackReason
      ? { fallbackReason: rawRecord.fallbackReason }
      : {}),
  }
}
