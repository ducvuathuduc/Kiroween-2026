/** UI formatting helpers shared by components. */

export function scoreBadgeClass(score: number): string {
  if (score >= 70) return 'bg-lime-glow text-black'
  if (score >= 40) return 'bg-amber-400 text-black'
  return 'bg-zinc-700 text-zinc-200'
}

export function timeAgo(iso: string): string {
  const mins = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 60000),
  )
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/** Extractive summary: first N sentences of plain text. */
export function summarize(text: string, maxSentences = 3): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return 'No summary available for this item.'
  const parts = clean.match(/[^.!?]+[.!?]+["')\]]?\s*/g) ?? [clean]
  return parts.slice(0, maxSentences).join(' ').trim()
}
