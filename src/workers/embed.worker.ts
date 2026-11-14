import { env, pipeline, type FeatureExtractionPipeline, type ProgressInfo } from '@huggingface/transformers'

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2'
const MODEL_DTYPE = 'q8' as const

interface EmbedDocInput {
  id: string
  text: string
}

interface EmbedRequestMessage {
  type: 'embed'
  requestId: number
  query: string
  docs: EmbedDocInput[]
  skipQuery?: boolean
}

type WorkerInMessage = EmbedRequestMessage

interface WorkerScope {
  addEventListener: (type: 'message', listener: (event: MessageEvent<WorkerInMessage>) => void) => void
  postMessage: (message: unknown) => void
}

const workerScope = globalThis as unknown as WorkerScope

env.useBrowserCache = true
env.cacheKey = 'transformers-cache'
env.allowLocalModels = false
env.allowRemoteModels = true

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null

function postProgress(requestId: number, info: ProgressInfo): void {
  const status = info.status
  const file = 'file' in info && typeof info.file === 'string' ? info.file : ''
  const progress =
    'progress' in info && typeof info.progress === 'number' && Number.isFinite(info.progress)
      ? Math.max(0, Math.min(100, info.progress))
      : undefined
  const loaded =
    'loaded' in info && typeof info.loaded === 'number' && Number.isFinite(info.loaded)
      ? info.loaded
      : undefined
  const total =
    'total' in info && typeof info.total === 'number' && Number.isFinite(info.total)
      ? info.total
      : undefined

  workerScope.postMessage({
    type: 'progress',
    requestId,
    status,
    file,
    progress,
    loaded,
    total,
  })
}

async function getExtractor(requestId: number): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL_ID, {
      dtype: MODEL_DTYPE,
      progress_callback: (info) => postProgress(requestId, info),
    }).catch((err) => {
      extractorPromise = null
      throw err
    })
  }
  return extractorPromise
}

function tensorToVectors(tensor: { data: ArrayLike<number>; dims: number[] }, count: number): number[][] {
  const dim = tensor.dims[1] ?? 384
  const flat = tensor.data
  const vectors: number[][] = []
  for (let i = 0; i < count; i += 1) {
    const start = i * dim
    const vec: number[] = []
    for (let j = 0; j < dim; j += 1) {
      vec.push(Number(flat[start + j] ?? 0))
    }
    vectors.push(vec)
  }
  return vectors
}

workerScope.addEventListener('message', (event) => {
  const payload = event.data
  if (!payload || payload.type !== 'embed') return

  const { requestId, query, docs, skipQuery } = payload

  void (async () => {
    try {
      const extractor = await getExtractor(requestId)
      const texts: string[] = []
      if (!skipQuery) texts.push(query)
      for (const doc of docs) {
        texts.push(doc.text)
      }

      if (texts.length === 0) {
        workerScope.postMessage({
          type: 'result',
          requestId,
          queryVec: null,
          docVecs: {},
          model: `${MODEL_ID}#${MODEL_DTYPE}`,
        })
        return
      }

      const output = await extractor(texts, {
        pooling: 'mean',
        normalize: true,
      })

      const vectors = tensorToVectors(
        output as unknown as { data: ArrayLike<number>; dims: number[] },
        texts.length,
      )

      let offset = 0
      const queryVec = skipQuery ? null : (vectors[offset++] ?? null)
      const docVecs: Record<string, number[]> = {}
      for (const doc of docs) {
        const vec = vectors[offset++]
        if (vec && vec.length === 384) {
          docVecs[doc.id] = vec
        }
      }

      workerScope.postMessage({
        type: 'result',
        requestId,
        queryVec,
        docVecs,
        model: `${MODEL_ID}#${MODEL_DTYPE}`,
      })
    } catch (err) {
      workerScope.postMessage({
        type: 'error',
        requestId,
        error: err instanceof Error ? err.message : 'Local semantic embedding failed.',
      })
    }
  })()
})
