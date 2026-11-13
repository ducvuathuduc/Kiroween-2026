export type AIProviderId = 'gemini' | 'openai' | 'anthropic' | 'bedrock'

export const PROVIDER_ORDER: readonly AIProviderId[] = [
  'gemini',
  'openai',
  'anthropic',
  'bedrock',
]

export interface ProviderMeta {
  id: AIProviderId
  label: string
  modelLabel: string
  embeddingModelLabel: string | null
  supportsEmbeddings: boolean
  description: string
}

export interface ProviderStatus extends ProviderMeta {
  available: boolean
}

export const PROVIDER_CATALOG: Record<AIProviderId, ProviderMeta> = {
  gemini: {
    id: 'gemini',
    label: 'Gemini (Default)',
    modelLabel: 'gemini-4-hydrogen',
    embeddingModelLabel: 'gemini-embedding-2',
    supportsEmbeddings: true,
    description: 'Primary summarization & semantic search via Google Gemini.',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    modelLabel: 'gpt-4.1-mini',
    embeddingModelLabel: 'text-embedding-3-small',
    supportsEmbeddings: true,
    description: 'Fallback summarization & text-embedding-3-small search.',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    modelLabel: 'claude-haiku-4-5',
    embeddingModelLabel: null,
    supportsEmbeddings: false,
    description: 'Claude summarization fallback (uses Gemini/OpenAI/Bedrock for embeddings).',
  },
  bedrock: {
    id: 'bedrock',
    label: 'Amazon Bedrock',
    modelLabel: 'us.amazon.nova-lite-v1:0',
    embeddingModelLabel: 'amazon.titan-embed-text-v2:0',
    supportsEmbeddings: true,
    description: 'AWS-native summarization & Titan Text v2 embeddings.',
  },
}

export const DEFAULT_PROVIDER_STATUSES: ProviderStatus[] = PROVIDER_ORDER.map(
  (id) => ({
    ...PROVIDER_CATALOG[id],
    available: false,
  }),
)

export function sanitizeProviderId(raw: unknown): AIProviderId {
  return raw === 'openai' || raw === 'anthropic' || raw === 'bedrock'
    ? raw
    : 'gemini'
}

/**
 * Order configured providers starting with the user's preferred choice (when available),
 * followed by the canonical fallback chain: Gemini -> OpenAI -> Anthropic -> Bedrock.
 * Providers without a configured key are omitted so they are skipped silently.
 */
export function resolveSummarizeOrder(
  preferred: AIProviderId,
  availability: Record<AIProviderId, boolean>,
): AIProviderId[] {
  const ordered: AIProviderId[] = []
  if (availability[preferred]) {
    ordered.push(preferred)
  }
  for (const id of PROVIDER_ORDER) {
    if (availability[id] && !ordered.includes(id)) {
      ordered.push(id)
    }
  }
  return ordered
}

/**
 * Order configured embedding-capable providers starting with the user's preferred choice,
 * followed by the canonical fallback chain (Gemini -> OpenAI -> Bedrock).
 */
export function resolveEmbeddingOrder(
  preferred: AIProviderId,
  availability: Record<AIProviderId, boolean>,
): AIProviderId[] {
  return resolveSummarizeOrder(preferred, availability).filter(
    (id) => PROVIDER_CATALOG[id].supportsEmbeddings,
  )
}

export function getProviderDisplayName(id: AIProviderId): string {
  switch (id) {
    case 'gemini':
      return 'Gemini'
    case 'openai':
      return 'OpenAI'
    case 'anthropic':
      return 'Anthropic'
    case 'bedrock':
      return 'Bedrock'
  }
}

/**
 * Rank items by cosine similarity descending.
 * Retains items that either pass `minSimilarity` or match `keywordPredicate`,
 * ensuring exact keyword matches are never dropped when embeddings shift ordering.
 */
export function rankItemsByCosine<T extends { id: string }>(
  items: readonly T[],
  scores: Record<string, number>,
  keywordPredicate?: (item: T) => boolean,
  minSimilarity = 0.28,
): T[] {
  return items
    .map((item) => {
      const similarity = scores[item.id] ?? 0
      const keywordHit = keywordPredicate ? keywordPredicate(item) : false
      return { item, similarity, keywordHit }
    })
    .filter((entry) => entry.similarity >= minSimilarity || entry.keywordHit)
    .sort((a, b) => {
      const aScore = a.similarity + (a.keywordHit ? 0.15 : 0)
      const bScore = b.similarity + (b.keywordHit ? 0.15 : 0)
      return bScore - aScore
    })
    .map((entry) => entry.item)
}
