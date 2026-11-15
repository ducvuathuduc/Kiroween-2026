import type { SignalDimensions } from './scoring'

export const SPOKEN_TARGET_MIN_WORDS = 900
export const SPOKEN_TARGET_MAX_WORDS = 1200
export const SPOKEN_WORDS_PER_MINUTE = 150

export interface SpokenBriefingInputItem {
  id: string
  title: string
  url?: string
  score: number
  source: string
  pubDate?: string
  tldr: string
  takeaways?: readonly string[]
  whyMatters?: string
  description?: string
  extractedText?: string
  scoreDimensions?: SignalDimensions
}

export interface SpokenBriefingSegment {
  itemId: string
  itemIndex: number
  title: string
  source: string
  text: string
  wordCount: number
}

export interface SpokenBriefingScript {
  script: string
  segments: SpokenBriefingSegment[]
  wordCount: number
  estimatedMinutes: number
  withinTargetRange: boolean
  dateSpoken: string
  singleNarrator: true
}

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
] as const

const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
] as const

const ORDINAL_DAYS = [
  '',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
  'thirteenth',
  'fourteenth',
  'fifteenth',
  'sixteenth',
  'seventeenth',
  'eighteenth',
  'nineteenth',
  'twentieth',
  'twenty-first',
  'twenty-second',
  'twenty-third',
  'twenty-fourth',
  'twenty-fifth',
  'twenty-sixth',
  'twenty-seventh',
  'twenty-eighth',
  'twenty-ninth',
  'thirtieth',
  'thirty-first',
] as const

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const STORY_ORDINALS = ['one', 'two', 'three', 'four', 'five'] as const

const UNIT_WORDS: Record<string, [string, string]> = {
  ms: ['millisecond', 'milliseconds'],
  s: ['second', 'seconds'],
  sec: ['second', 'seconds'],
  secs: ['second', 'seconds'],
  min: ['minute', 'minutes'],
  mins: ['minute', 'minutes'],
  hr: ['hour', 'hours'],
  hrs: ['hour', 'hours'],
  kb: ['kilobyte', 'kilobytes'],
  kib: ['kibibyte', 'kibibytes'],
  mb: ['megabyte', 'megabytes'],
  mib: ['mebibyte', 'mebibytes'],
  gb: ['gigabyte', 'gigabytes'],
  gib: ['gibibyte', 'gibibytes'],
  tb: ['terabyte', 'terabytes'],
  hz: ['hertz', 'hertz'],
  khz: ['kilohertz', 'kilohertz'],
  mhz: ['megahertz', 'megahertz'],
  ghz: ['gigahertz', 'gigahertz'],
  fps: ['frames per second', 'frames per second'],
  rps: ['requests per second', 'requests per second'],
  wpm: ['words per minute', 'words per minute'],
  tok: ['token', 'tokens'],
}

function underThousandToWords(n: number): string {
  const num = Math.floor(n)
  if (num < 20) return ONES[num] ?? String(num)
  if (num < 100) {
    const ten = Math.floor(num / 10)
    const rem = num % 10
    return rem === 0 ? TENS[ten]! : `${TENS[ten]}-${ONES[rem]}`
  }
  const hundred = Math.floor(num / 100)
  const rem = num % 100
  return rem === 0
    ? `${ONES[hundred]} hundred`
    : `${ONES[hundred]} hundred ${underThousandToWords(rem)}`
}

export function integerToSpokenWords(value: number): string {
  if (!Number.isFinite(value)) return 'zero'
  const rounded = Math.trunc(value)
  if (rounded === 0) return 'zero'
  if (rounded < 0) return `minus ${integerToSpokenWords(Math.abs(rounded))}`
  if (rounded > 999_999_999_999) return String(rounded)

  const scales: Array<[number, string]> = [
    [1_000_000_000, 'billion'],
    [1_000_000, 'million'],
    [1_000, 'thousand'],
  ]
  const parts: string[] = []
  let remainder = rounded

  for (const [unit, label] of scales) {
    if (remainder >= unit) {
      const chunk = Math.floor(remainder / unit)
      parts.push(`${underThousandToWords(chunk)} ${label}`)
      remainder %= unit
    }
  }
  if (remainder > 0) {
    parts.push(underThousandToWords(remainder))
  }
  return parts.join(' ')
}

export function numberStringToSpokenWords(raw: string): string {
  const cleaned = raw.replace(/,/g, '').trim()
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return raw
  const negative = cleaned.startsWith('-')
  const unsigned = negative ? cleaned.slice(1) : cleaned
  const [intPart, fracPart] = unsigned.split('.')
  const intVal = Number.parseInt(intPart || '0', 10)
  const spokenInt = integerToSpokenWords(intVal)
  const prefix = negative ? 'minus ' : ''
  if (!fracPart) return `${prefix}${spokenInt}`
  const spokenDigits = fracPart
    .split('')
    .map((digit) => ONES[Number.parseInt(digit, 10)] ?? digit)
    .join(' ')
  return `${prefix}${spokenInt} point ${spokenDigits}`
}

export function yearToSpokenWords(year: number): string {
  if (!Number.isInteger(year) || year < 1000 || year > 2999) {
    return integerToSpokenWords(year)
  }
  if (year >= 2000 && year <= 2009) {
    return year === 2000
      ? 'two thousand'
      : `two thousand ${ONES[year - 2000]}`
  }
  const hi = Math.floor(year / 100)
  const lo = year % 100
  if (lo === 0) return `${underThousandToWords(hi)} hundred`
  if (lo < 10) return `${underThousandToWords(hi)} oh ${ONES[lo]}`
  return `${underThousandToWords(hi)} ${underThousandToWords(lo)}`
}

export function dateToSpokenWords(input: string | Date): string {
  if (input instanceof Date) {
    if (!Number.isFinite(input.getTime())) return 'today'
    const month = MONTHS[input.getUTCMonth()] ?? 'January'
    const day = ORDINAL_DAYS[input.getUTCDate()] ?? integerToSpokenWords(input.getUTCDate())
    const year = yearToSpokenWords(input.getUTCFullYear())
    return `${month} ${day}, ${year}`
  }

  const trimmed = input.trim()
  if (!trimmed) return 'today'
  const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/)
  if (ymd) {
    const yearNum = Number.parseInt(ymd[1]!, 10)
    const monthNum = Number.parseInt(ymd[2]!, 10)
    const dayNum = Number.parseInt(ymd[3]!, 10)
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
      return `${MONTHS[monthNum - 1]} ${ORDINAL_DAYS[dayNum]}, ${yearToSpokenWords(yearNum)}`
    }
  }

  const parsed = Date.parse(trimmed)
  if (!Number.isFinite(parsed)) return 'today'
  return dateToSpokenWords(new Date(parsed))
}

export function stripUrlsAndLinks(raw: string): string {
  return raw
    // Convert markdown links [label](https://...) into plain anchor text
    .replace(/\[([^\]]+)\]\((?:https?|mailto|ftp):\/\/[^)\s]+(?:\s+"[^"]*")?\)/gi, '$1')
    .replace(/\[([^\]]+)\]\(\/[^)\s]*\)/g, '$1')
    // Remove HTML anchor tags while retaining inner text
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    // Remove any remaining HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Remove bare URLs and www domains
    .replace(/\b(?:https?|ftp):\/\/[^\s<>()"'\]]+/gi, '')
    .replace(/\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s<>()"'\]]*)?/gi, '')
    // Remove email addresses
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '')
    // Decode basic HTML entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, 'and')
    .replace(/&lt;/gi, 'less than')
    .replace(/&gt;/gi, 'greater than')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    // Clean up markdown artifacts and empty parens left behind by stripped URLs
    .replace(/[`*_~#>]+/g, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\[\s*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function expandNumbersAndDates(text: string): string {
  let out = text

  // ISO dates (e.g. 2026-11-15 or 2026-11-15T12:30:00Z)
  out = out.replace(
    /\b(19\d{2}|20\d{2})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g,
    (full) => dateToSpokenWords(full),
  )

  // Slash dates MM/DD/YYYY
  out = out.replace(
    /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(19\d{2}|20\d{2})\b/g,
    (_m, mStr: string, dStr: string, yStr: string) => {
      const m = Number.parseInt(mStr, 10)
      const d = Number.parseInt(dStr, 10)
      const y = Number.parseInt(yStr, 10)
      return `${MONTHS[m - 1]} ${ORDINAL_DAYS[d]}, ${yearToSpokenWords(y)}`
    },
  )

  // Semantic versions: v2.14.0 or 2.14.0 (3 segments)
  out = out.replace(
    /\bv?(\d+)\.(\d+)\.(\d+)\b/gi,
    (_m, major: string, minor: string, patch: string) =>
      `version ${numberStringToSpokenWords(major)} point ${numberStringToSpokenWords(minor)} point ${numberStringToSpokenWords(patch)}`,
  )

  // Leading 'v' short version like v2 or v2.4
  out = out.replace(
    /\bv(\d+(?:\.\d+)?)\b/gi,
    (_m, ver: string) => `version ${numberStringToSpokenWords(ver)}`,
  )

  // Scores/fractions like 92/100 or 3/5
  out = out.replace(
    /\b(\d+(?:,\d{3})*)\s*\/\s*(\d+(?:,\d{3})*)\b/g,
    (_m, num: string, den: string) =>
      `${numberStringToSpokenWords(num)} out of ${numberStringToSpokenWords(den)}`,
  )

  // Currency shorthand like $12.5M, $4B, $250K, $99
  out = out.replace(
    /\$(\d+(?:,\d{3})*(?:\.\d+)?)\s*([kmb])?\b/gi,
    (_m, amount: string, suffix?: string) => {
      const words = numberStringToSpokenWords(amount)
      const scale = suffix
        ? suffix.toLowerCase() === 'k'
          ? ' thousand'
          : suffix.toLowerCase() === 'm'
            ? ' million'
            : ' billion'
        : ''
      const numeric = Number.parseFloat(amount.replace(/,/g, ''))
      const noun = !scale && numeric === 1 ? 'dollar' : 'dollars'
      return `${words}${scale} ${noun}`
    },
  )

  // Percentages like 42.5%
  out = out.replace(
    /(-?\d+(?:,\d{3})*(?:\.\d+)?)\s*%/g,
    (_m, val: string) => `${numberStringToSpokenWords(val)} percent`,
  )

  // Multipliers like 1.8x or 10x
  out = out.replace(
    /\b(\d+(?:\.\d+)?)x\b/gi,
    (_m, val: string) => `${numberStringToSpokenWords(val)} times`,
  )

  // Numeric ranges like 900-1200 or 6–8
  out = out.replace(
    /\b(\d+(?:,\d{3})*(?:\.\d+)?)\s*[–—-]\s*(\d+(?:,\d{3})*(?:\.\d+)?)\b/g,
    (_m, a: string, b: string) =>
      `${numberStringToSpokenWords(a)} to ${numberStringToSpokenWords(b)}`,
  )

  // Numbers with units like 250ms, 40KB, 1024-dim
  out = out.replace(
    /\b(\d+(?:,\d{3})*(?:\.\d+)?)\s*-\s*(?:dim|dimensional)\b/gi,
    (_m, val: string) => `${numberStringToSpokenWords(val)} dimensional`,
  )

  out = out.replace(
    /\b(\d+(?:,\d{3})*(?:\.\d+)?)\s*(ms|secs?|mins?|hrs?|kib|mib|gib|kb|mb|gb|tb|khz|mhz|ghz|hz|fps|rps|wpm|tok|s)\b/gi,
    (_m, val: string, rawUnit: string) => {
      const pair = UNIT_WORDS[rawUnit.toLowerCase()]
      if (!pair) return `${numberStringToSpokenWords(val)} ${rawUnit}`
      const numeric = Number.parseFloat(val.replace(/,/g, ''))
      const unitWord = numeric === 1 ? pair[0] : pair[1]
      return `${numberStringToSpokenWords(val)} ${unitWord}`
    },
  )

  // 4-digit years preceded by year prepositions or standalone >= 1990 <= 2040
  out = out.replace(
    /\b(199\d|20[0-3]\d)\b/g,
    (_m, yr: string) => yearToSpokenWords(Number.parseInt(yr, 10)),
  )

  // Standalone numbers (avoiding alphanumeric identifiers like S3, EC2, K8s, M3)
  out = out.replace(
    /(?<![A-Za-z0-9_-])-?\d+(?:,\d{3})*(?:\.\d+)?(?![A-Za-z0-9_])/g,
    (match) => numberStringToSpokenWords(match),
  )

  return out
}

function splitLongSpokenSentence(sentence: string, maxWords = 22): string[] {
  const words = sentence.trim().split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) {
    return words.length > 0 ? [ensureSentencePeriod(words.join(' '))] : []
  }

  // Split on natural broadcast pauses first
  const clauses = sentence
    .split(/(?<=[;:])\s+|\s+[—-]\s+|,\s+(?=(?:and|but|while|which|because|so|as|with)\b)/i)
    .map((c) => c.trim())
    .filter(Boolean)

  const out: string[] = []
  const pushWords = (segment: string) => {
    const segWords = segment.split(/\s+/).filter(Boolean)
    if (segWords.length <= maxWords) {
      if (segWords.length > 0) out.push(ensureSentencePeriod(segWords.join(' ')))
      return
    }
    for (let i = 0; i < segWords.length; i += maxWords) {
      const slice = segWords.slice(i, i + maxWords).join(' ')
      if (slice) out.push(ensureSentencePeriod(slice))
    }
  }

  for (const clause of clauses) {
    pushWords(clause)
  }
  return out
}

function ensureSentencePeriod(text: string): string {
  const clean = text.trim().replace(/[,;:\s]+$/, '')
  if (!clean) return ''
  return /[.!?]$/.test(clean) ? clean : `${clean}.`
}

export function normalizeTextForSpeech(raw: string): string {
  const stripped = stripUrlsAndLinks(raw)
    // Remove multi-host dialogue tags if present so narration stays strictly single-narrator
    .replace(/(?:^|\n)\s*(?:host\s*\d*|co-?host|speaker\s*\d*|alex|sam)\s*:\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!stripped) return ''
  const expanded = expandNumbersAndDates(stripped)
  const rawSentences = expanded
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const shortSentences = rawSentences.flatMap((s) => splitLongSpokenSentence(s, 22))
  return shortSentences.join(' ').replace(/\s+/g, ' ').trim()
}

export function countSpokenWords(text: string): number {
  const clean = text.trim()
  if (!clean) return 0
  return clean.split(/\s+/).filter(Boolean).length
}

export function estimateSpokenMinutes(
  wordCount: number,
  wpm = SPOKEN_WORDS_PER_MINUTE,
): number {
  if (wordCount <= 0 || wpm <= 0) return 0
  return Math.round((wordCount / wpm) * 10) / 10
}

function splitSentencesPreservingEnds(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function topDimensionSummary(dimensions?: SignalDimensions): string {
  if (!dimensions) return ''
  const entries: Array<[string, number]> = [
    ['builder relevance', dimensions.relevance],
    ['recency', dimensions.recency],
    ['source authority', dimensions.authority],
    ['novelty', dimensions.novelty],
  ]
  entries.sort((a, b) => b[1] - a[1])
  const top = entries[0]
  if (!top || top[1] <= 0) return ''
  return `It scored highest on ${top[0]} at ${integerToSpokenWords(Math.round(top[1]))}.`
}

function buildStorySentences(
  item: SpokenBriefingInputItem,
  index: number,
): string[] {
  const ordinal = STORY_ORDINALS[index] ?? integerToSpokenWords(index + 1)
  const sourceSpoken = normalizeTextForSpeech(item.source || 'your feeds').replace(/\.$/, '')
  const titleSpoken = normalizeTextForSpeech(item.title)
  const scoreSpoken = integerToSpokenWords(Math.round(item.score))

  const sentences: string[] = []
  const seenNormalized = new Set<string>()
  const pushUnique = (rawSentence: string) => {
    const clean = ensureSentencePeriod(rawSentence)
    if (!clean) return
    const key = clean.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!key || seenNormalized.has(key)) return
    seenNormalized.add(key)
    for (const piece of splitLongSpokenSentence(clean, 22)) {
      const pieceKey = piece.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (pieceKey) seenNormalized.add(pieceKey)
      sentences.push(piece)
    }
  }

  pushUnique(
    `Story ${ordinal}, from ${sourceSpoken}, with a signal score of ${scoreSpoken} out of one hundred.`,
  )
  if (titleSpoken) pushUnique(titleSpoken)

  if (item.pubDate) {
    const published = dateToSpokenWords(item.pubDate)
    if (published !== 'today') {
      pushUnique(`Published on ${published}.`)
    }
  }

  const dimLine = topDimensionSummary(item.scoreDimensions)
  if (dimLine) pushUnique(dimLine)

  const tldrSpoken = normalizeTextForSpeech(item.tldr)
  if (tldrSpoken) {
    for (const s of splitSentencesPreservingEnds(tldrSpoken)) {
      pushUnique(s)
    }
  }

  if (Array.isArray(item.takeaways) && item.takeaways.length > 0) {
    const takeawaysClean = item.takeaways
      .map((t) => normalizeTextForSpeech(t))
      .filter(Boolean)
      .slice(0, 3)
    if (takeawaysClean.length > 0) {
      pushUnique('Here are the key takeaways.')
      for (const point of takeawaysClean) {
        for (const s of splitSentencesPreservingEnds(point)) {
          pushUnique(s)
        }
      }
    }
  }

  const detailSource = item.extractedText?.trim() || item.description?.trim() || ''
  if (detailSource) {
    const normalizedDetail = normalizeTextForSpeech(detailSource)
    for (const s of splitSentencesPreservingEnds(normalizedDetail)) {
      pushUnique(s)
    }
  }

  if (item.whyMatters?.trim()) {
    const whySpoken = normalizeTextForSpeech(item.whyMatters)
    if (whySpoken) {
      pushUnique(`Why this matters for builders. ${whySpoken}`)
    }
  }

  return sentences
}

function fitSentencesToBudget(sentences: string[], maxWords: number): string[] {
  const kept: string[] = []
  let wordsUsed = 0
  for (const s of sentences) {
    const w = countSpokenWords(s)
    if (kept.length >= 3 && wordsUsed + w > maxWords) break
    kept.push(s)
    wordsUsed += w
  }
  return kept
}

export function buildSpokenBriefingScript(
  rawItems: readonly SpokenBriefingInputItem[],
  options: { nowIso?: string; maxWords?: number } = {},
): SpokenBriefingScript {
  const items = rawItems.slice(0, 5)
  const maxWords =
    typeof options.maxWords === 'number' && options.maxWords > 0
      ? Math.min(SPOKEN_TARGET_MAX_WORDS, Math.floor(options.maxWords))
      : SPOKEN_TARGET_MAX_WORDS
  const dateSpoken = dateToSpokenWords(options.nowIso ?? new Date().toISOString())

  if (items.length === 0) {
    const emptyText = `Resurrected Reader daily briefing for ${dateSpoken}. No briefing items are available right now.`
    const words = countSpokenWords(emptyText)
    return {
      script: emptyText,
      segments: [],
      wordCount: words,
      estimatedMinutes: estimateSpokenMinutes(words),
      withinTargetRange: false,
      dateSpoken,
      singleNarrator: true,
    }
  }

  const countWord = integerToSpokenWords(items.length)
  const intro = normalizeTextForSpeech(
    `Resurrected Reader daily briefing for ${dateSpoken}. I have your top ${countWord} highest signal engineering stories ready. Let us get started.`,
  )
  const outro = normalizeTextForSpeech(
    `That wraps up today's ${countWord} story briefing for ${dateSpoken}. Open any item in the reader for full source links and Kiro task actions.`,
  )

  const overheadWords = countSpokenWords(intro) + countSpokenWords(outro)
  const perStoryCeiling = Math.max(
    60,
    Math.floor((maxWords - overheadWords) / items.length),
  )

  const rawStorySentences = items.map((item, idx) => buildStorySentences(item, idx))

  // Distribute unused word budget from shorter stories to richer stories so we stay
  // inside 900-1200 words whenever source material supports it without fabricating facts.
  let remainingBudget = maxWords - overheadWords
  const selectedStorySentences: string[][] = rawStorySentences.map(() => [])

  items.forEach((_item, idx) => {
    const storiesLeft = items.length - idx
    const fairShare = Math.max(
      perStoryCeiling,
      Math.floor(remainingBudget / storiesLeft),
    )
    const fitted = fitSentencesToBudget(rawStorySentences[idx]!, fairShare)
    selectedStorySentences[idx] = fitted
    const used = fitted.reduce((sum, s) => sum + countSpokenWords(s), 0)
    remainingBudget = Math.max(0, remainingBudget - used)
  })

  const segments: SpokenBriefingSegment[] = items.map((item, idx) => {
    const text = selectedStorySentences[idx]!.join(' ')
    return {
      itemId: item.id,
      itemIndex: idx,
      title: item.title,
      source: item.source,
      text,
      wordCount: countSpokenWords(text),
    }
  })

  const fullParts = [intro, ...segments.map((s) => s.text).filter(Boolean), outro]
  const script = fullParts.join('\n\n').trim()
  const wordCount = countSpokenWords(script)
  const estimatedMinutes = estimateSpokenMinutes(wordCount)

  return {
    script,
    segments,
    wordCount,
    estimatedMinutes,
    withinTargetRange:
      wordCount >= SPOKEN_TARGET_MIN_WORDS && wordCount <= SPOKEN_TARGET_MAX_WORDS,
    dateSpoken,
    singleNarrator: true,
  }
}

export function sanitizeSpokenScriptForTTS(
  rawScript: string,
  maxWords = SPOKEN_TARGET_MAX_WORDS,
): string {
  const paragraphs = rawScript
    .split(/\n{2,}/)
    .map((p) => normalizeTextForSpeech(p))
    .filter(Boolean)

  if (paragraphs.length === 0) return ''

  const bounded: string[] = []
  let wordsUsed = 0

  for (const para of paragraphs) {
    const sentences = splitSentencesPreservingEnds(para)
    const keptInPara: string[] = []
    for (const s of sentences) {
      const w = countSpokenWords(s)
      if (wordsUsed + w > maxWords && wordsUsed > 0) break
      keptInPara.push(s)
      wordsUsed += w
    }
    if (keptInPara.length > 0) {
      bounded.push(keptInPara.join(' '))
    }
    if (wordsUsed >= maxWords) break
  }

  return bounded.join('\n\n').trim()
}
