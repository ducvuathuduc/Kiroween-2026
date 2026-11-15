import type { FeedItem } from './feeds'
import { cosineSimilarity } from './vectorMath'

export const BGE_M3_DIMENSIONS = 1024
export const DEFAULT_TASTE_HALF_LIFE_DAYS = 14
export const DEFAULT_EXPLORE_SLOT_INDEX = 3
export const MIN_EXPLORE_SIGNAL_SCORE = 40
const DAY_MS = 86_400_000

export interface TasteVectorEntry {
  id: string
  vector: readonly number[]
  interactedAt: string
  saved?: boolean
}

export interface RankedTasteFeedEntry<T extends FeedItem = FeedItem> {
  item: T
  combinedScore: number
  tasteCosine: number | null
  signalNorm: number
  isExploreSlot: boolean
  exploreReason?: string
}

export interface RankFeedWithTasteOptions {
  readIds?: readonly string[]
  exploreSlotIndex?: number
  minExploreSignal?: number
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function l2NormalizeVector(values: number[]): number[] | null {
  let normSq = 0
  for (let i = 0; i < values.length; i += 1) {
    normSq += values[i] * values[i]
  }
  if (!Number.isFinite(normSq) || normSq <= 0) return null
  const inv = 1 / Math.sqrt(normSq)
  return values.map((v) => v * inv)
}

/**
 * Compute an L2-normalized, decay-weighted mean of read/saved 1024-dim embeddings.
 * Saved items receive 1.5x base weight vs 1.0x for read-only items.
 */
export function computeDecayWeightedTasteVector(
  entries: readonly TasteVectorEntry[],
  nowMs = Date.now(),
  halfLifeDays = DEFAULT_TASTE_HALF_LIFE_DAYS,
): number[] | null {
  if (entries.length === 0) return null
  const acc = Array<number>(BGE_M3_DIMENSIONS).fill(0)
  let totalWeight = 0
  const safeHalfLife = Math.max(1, halfLifeDays)

  for (const entry of entries) {
    if (
      !Array.isArray(entry.vector) ||
      entry.vector.length !== BGE_M3_DIMENSIONS
    ) {
      continue
    }
    const interactedMs = Date.parse(entry.interactedAt)
    if (!Number.isFinite(interactedMs)) continue
    const ageDays = Math.max(0, (nowMs - interactedMs) / DAY_MS)
    const decay = Math.exp((-ageDays * Math.LN2) / safeHalfLife)
    const actionWeight = entry.saved ? 1.5 : 1.0
    const weight = actionWeight * decay
    if (!Number.isFinite(weight) || weight <= 0) continue

    let validVec = true
    for (let i = 0; i < BGE_M3_DIMENSIONS; i += 1) {
      const v = entry.vector[i]
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        validVec = false
        break
      }
    }
    if (!validVec) continue

    for (let i = 0; i < BGE_M3_DIMENSIONS; i += 1) {
      acc[i] += entry.vector[i] * weight
    }
    totalWeight += weight
  }

  if (totalWeight <= 0) return null
  return l2NormalizeVector(acc)
}

/**
 * Rank feed items using 0.5 * cosine(taste) + 0.5 * Signal Radar + 1 explore slot.
 * Preserves item.score and item.scoreDimensions unchanged.
 */
export function rankFeedWithTasteVector<T extends FeedItem>(
  items: readonly T[],
  itemVectors: Readonly<Record<string, readonly number[]>>,
  tasteVector: readonly number[] | null,
  options: RankFeedWithTasteOptions = {},
): RankedTasteFeedEntry<T>[] {
  if (items.length === 0) return []

  const hasValidTaste =
    Array.isArray(tasteVector) && tasteVector.length === BGE_M3_DIMENSIONS
  const readSet = new Set(options.readIds ?? [])
  const exploreSlotIndex = Math.max(
    1,
    options.exploreSlotIndex ?? DEFAULT_EXPLORE_SLOT_INDEX,
  )
  const minExploreSignal = options.minExploreSignal ?? MIN_EXPLORE_SIGNAL_SCORE

  const scored: RankedTasteFeedEntry<T>[] = items.map((item) => {
    const signalNorm = clamp01((item.score ?? 0) / 100)
    const vec = itemVectors[item.id]
    const hasItemVec =
      hasValidTaste && Array.isArray(vec) && vec.length === BGE_M3_DIMENSIONS

    const tasteCosine = hasItemVec
      ? clamp01(cosineSimilarity(vec, tasteVector))
      : null

    const combinedScore =
      tasteCosine !== null
        ? 0.5 * tasteCosine + 0.5 * signalNorm
        : 0.5 * signalNorm

    return {
      item,
      combinedScore,
      tasteCosine,
      signalNorm,
      isExploreSlot: false,
    }
  })

  scored.sort(
    (a, b) =>
      b.combinedScore - a.combinedScore ||
      (b.item.score ?? 0) - (a.item.score ?? 0) ||
      Date.parse(b.item.pubDate) - Date.parse(a.item.pubDate),
  )

  if (!hasValidTaste || scored.length < 4) {
    return scored
  }

  const slotIdx = Math.min(exploreSlotIndex, scored.length - 1)
  const tailCandidates = scored
    .slice(slotIdx)
    .filter(
      (entry) =>
        !readSet.has(entry.item.id) &&
        (entry.item.score ?? 0) >= minExploreSignal,
    )

  if (tailCandidates.length === 0) {
    return scored
  }

  // Pick an out-of-bubble item: lowest taste cosine among decent-signal unread candidates
  const explorePick = [...tailCandidates].sort((a, b) => {
    const cosA = a.tasteCosine ?? 0.5
    const cosB = b.tasteCosine ?? 0.5
    if (cosA !== cosB) return cosA - cosB
    return (b.item.score ?? 0) - (a.item.score ?? 0)
  })[0]

  if (!explorePick) return scored

  const currentIdx = scored.findIndex((e) => e.item.id === explorePick.item.id)
  if (currentIdx === -1) return scored

  const reordered = [...scored]
  const [picked] = reordered.splice(currentIdx, 1)
  reordered.splice(slotIdx, 0, {
    ...picked,
    isExploreSlot: true,
    exploreReason: 'Explore slot: outside your taste centroid',
  })

  return reordered
}
