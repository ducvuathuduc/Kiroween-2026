import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'

/** UI formatting and validation helpers shared by components. */

export function scoreBadgeClass(score: number): string {
  if (score >= 70) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (score >= 40) return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-zinc-200 bg-zinc-100 text-zinc-600'
}

export function feedMonogram(title: string): string {
  const words = title
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w))
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase()
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase()
  }
  return 'FD'
}

function parseDateSafe(iso: string): Date | null {
  if (!iso) return null
  const parsed = parseISO(iso)
  if (isValid(parsed)) return parsed
  const fallback = new Date(iso)
  return isValid(fallback) ? fallback : null
}

export function timeAgo(iso: string): string {
  const date = parseDateSafe(iso)
  if (!date) return 'Unknown date'
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 60_000) return 'just now'
  return formatDistanceToNowStrict(date, { addSuffix: true })
}

export function formatRefreshTime(iso: string): string {
  const date = parseDateSafe(iso)
  return date ? format(date, 'HH:mm:ss') : ''
}

/** Extractive summary: first N sentences of plain text. */
export function summarize(text: string, maxSentences = 3): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return 'No summary available for this item.'
  const parts = clean.match(/[^.!?]+[.!?]+["')\]]?\s*/g) ?? [clean]
  return parts
    .slice(0, maxSentences)
    .map((p) => p.trim())
    .join(' ')
    .trim()
}

/** Allow only http(s) URLs to prevent javascript: or data: links. */
export function safeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString()
    }
    return null
  } catch {
    return null
  }
}
