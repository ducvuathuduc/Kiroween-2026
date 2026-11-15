export const DEFAULT_MIN_SIMILARITY = 0.25

export function cosineSimilarity(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i += 1) {
    const va = a[i] ?? 0
    const vb = b[i] ?? 0
    if (!Number.isFinite(va) || !Number.isFinite(vb)) return 0
    dot += va * vb
    normA += va * va
    normB += vb * vb
  }
  if (normA <= 0 || normB <= 0) return 0
  const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB))
  return Number.isFinite(sim) ? Math.max(-1, Math.min(1, sim)) : 0
}
