import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cosineSimilarity,
  createSemanticSearchClient,
  normalizeKeywordScore,
  rankItemsHybrid,
  selectSemanticBackend,
  type EmbedWorkerOutbound,
} from '../src/lib/semanticSearch'
import {
  DEFAULT_SETTINGS,
  isValidSemanticRecord,
  sanitizeSettings,
} from '../src/lib/storage'

test('cosineSimilarity computes exact, orthogonal, and malformed vector cases cleanly', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [1, 0, 0]) - 1) < 1e-6)
  assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [0, 1, 0])) < 1e-6)
  assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [-1, 0, 0]) + 1) < 1e-6)
  assert.equal(cosineSimilarity([1, 2], [1]), 0)
  assert.equal(cosineSimilarity([0, 0], [1, 2]), 0)
  assert.equal(cosineSimilarity([Number.NaN, 1], [1, 1]), 0)
})

test('rankItemsHybrid applies 0.6 semantic + 0.4 keyword without mutating 4D score', () => {
  const items = [
    {
      id: 'item-semantic',
      feedTitle: 'AWS Architecture Blog',
      title: 'Multi-agent orchestration with Step Functions and tool-calling loops',
      description: 'Coordinating autonomous tasks reliably in serverless workflows.',
      score: 64,
      scoreDimensions: { recency: 70, relevance: 65, authority: 72, novelty: 50 },
    },
    {
      id: 'item-keyword',
      feedTitle: 'Hacker News',
      title: 'Bedrock agents changelog notes',
      description: 'Brief release summary.',
      score: 48,
      scoreDimensions: { recency: 60, relevance: 55, authority: 44, novelty: 40 },
    },
    {
      id: 'item-noise',
      feedTitle: 'General Tech',
      title: 'CSS grid subgrid layout tips',
      description: 'Frontend styling notes.',
      score: 30,
      scoreDimensions: { recency: 50, relevance: 10, authority: 44, novelty: 40 },
    },
  ]

  const stubbedSimilarities: Record<string, number> = {
    'item-semantic': 0.9, // 0.6 * 0.90 + 0.4 * 0 = 0.54
    'item-keyword': 0.2, // 0.6 * 0.20 + 0.4 * ~1.0 = ~0.52
    'item-noise': 0.05,
  }

  const ranked = rankItemsHybrid(items, stubbedSimilarities, 'Bedrock agents')
  assert.equal(ranked.length, 2)
  assert.equal(ranked[0].item.id, 'item-semantic')
  assert.equal(ranked[0].isSemanticMatch, true)
  assert.ok(Math.abs(ranked[0].combinedScore - 0.6 * 0.9) < 1e-6)
  assert.equal(ranked[1].item.id, 'item-keyword')
  assert.ok(normalizeKeywordScore('Bedrock agents', items[1]) > 0.8)
  assert.ok(ranked[0].combinedScore > ranked[1].combinedScore)

  // Deterministic 4D signal score must never be overwritten by semantic ranking
  assert.equal(ranked[0].item.score, 64)
  assert.deepEqual(ranked[0].item.scoreDimensions, {
    recency: 70,
    relevance: 65,
    authority: 72,
    novelty: 50,
  })
})

test('selectSemanticBackend chooses local, server fallback, or keyword-only appropriately', () => {
  assert.equal(
    selectSemanticBackend({
      enabled: false,
      query: 'bedrock agents',
      workerSupported: true,
      localReady: true,
      localFailed: false,
      hasServerEmbedProvider: true,
      online: true,
    }),
    'keyword-only',
  )
  assert.equal(
    selectSemanticBackend({
      enabled: true,
      query: 'bedrock agents',
      workerSupported: false,
      localReady: false,
      localFailed: false,
      hasServerEmbedProvider: true,
      online: true,
    }),
    'server-fallback',
  )
  assert.equal(
    selectSemanticBackend({
      enabled: true,
      query: 'bedrock agents',
      workerSupported: true,
      localReady: false,
      localFailed: false,
      hasServerEmbedProvider: true,
      online: true,
    }),
    'local-with-server-fallback',
  )
  assert.equal(
    selectSemanticBackend({
      enabled: true,
      query: 'bedrock agents',
      workerSupported: true,
      localReady: true,
      localFailed: false,
      hasServerEmbedProvider: true,
      online: false,
    }),
    'local-primary',
  )
})

test('sanitizeSettings and isValidSemanticRecord validate semantic config and 384-dim vectors', () => {
  assert.equal(DEFAULT_SETTINGS.semanticSearchEnabled, true)
  assert.equal(sanitizeSettings({ semanticSearchEnabled: false }).semanticSearchEnabled, false)
  assert.equal(sanitizeSettings({ semanticSearchEnabled: 'yes' }).semanticSearchEnabled, true)

  const validVec = Array.from({ length: 384 }, (_, i) => (i === 0 ? 1 : 0))
  assert.equal(
    isValidSemanticRecord(
      {
        itemId: 'a1',
        vec: validVec,
        model: 'Xenova/all-MiniLM-L6-v2#q8',
        updatedAt: Date.now(),
      },
      'Xenova/all-MiniLM-L6-v2#q8',
    ),
    true,
  )
  assert.equal(
    isValidSemanticRecord(
      {
        itemId: 'a1',
        vec: [1, 2, 3],
        model: 'Xenova/all-MiniLM-L6-v2#q8',
        updatedAt: Date.now(),
      },
      'Xenova/all-MiniLM-L6-v2#q8',
    ),
    false,
  )
})

test('createSemanticSearchClient lazily spawns worker, tracks progress, and caches vectors with stubbed worker', async () => {
  let workerCreated = 0
  let embedCalls = 0
  const unitX = Array.from({ length: 384 }, (_, i) => (i === 0 ? 1 : 0))
  const unitY = Array.from({ length: 384 }, (_, i) => (i === 1 ? 1 : 0))

  class StubWorker {
    private listeners = new Map<string, Set<(event: unknown) => void>>()
    constructor() {
      workerCreated += 1
    }
    addEventListener(type: string, fn: (event: unknown) => void) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set())
      this.listeners.get(type)!.add(fn)
    }
    emit(type: string, data: EmbedWorkerOutbound) {
      for (const fn of this.listeners.get(type) ?? []) {
        fn({ data })
      }
    }
    postMessage(payload: { requestId: number; docs: Array<{ id: string }>; skipQuery?: boolean }) {
      embedCalls += 1
      queueMicrotask(() => {
        this.emit('message', {
          type: 'progress',
          requestId: payload.requestId,
          status: 'progress_total',
          progress: 65,
          file: 'onnx/model_quantized.onnx',
        })
        const docVecs: Record<string, number[]> = {}
        for (const d of payload.docs) {
          docVecs[d.id] = d.id === 'doc-1' ? unitX : unitY
        }
        this.emit('message', {
          type: 'result',
          requestId: payload.requestId,
          queryVec: payload.skipQuery ? null : unitX,
          docVecs,
        })
      })
    }
    terminate() {
      this.listeners.clear()
    }
  }

  const prevWorker = globalThis.Worker
  const prevWasm = globalThis.WebAssembly
  Object.defineProperty(globalThis, 'Worker', { value: StubWorker, configurable: true })
  if (typeof globalThis.WebAssembly === 'undefined') {
    Object.defineProperty(globalThis, 'WebAssembly', { value: {}, configurable: true })
  }

  try {
    const client = createSemanticSearchClient(() => new StubWorker() as unknown as Worker)
    assert.equal(workerCreated, 0)
    assert.equal(client.getState().status, 'idle')

    const seenStatuses: string[] = []
    client.subscribe((s) => seenStatuses.push(s.status))

    const docs = [
      { id: 'doc-1', feedTitle: 'AWS', title: 'Step Functions', description: 'Workflows' },
      { id: 'doc-2', feedTitle: 'HN', title: 'CSS layout', description: 'Subgrid' },
    ]

    const first = await client.search('bedrock agents', docs)
    assert.equal(workerCreated, 1)
    assert.equal(embedCalls, 1)
    assert.ok(seenStatuses.includes('downloading'))
    assert.equal(client.getState().modelReady, true)
    assert.ok(Math.abs(first.scores['doc-1'] - 1) < 1e-6)
    assert.ok(Math.abs(first.scores['doc-2']) < 1e-6)

    // Repeat query + same docs hits in-memory vector cache without calling worker again
    const second = await client.search('bedrock agents', docs)
    assert.equal(embedCalls, 1)
    assert.deepEqual(second.scores, first.scores)
    client.dispose()
  } finally {
    Object.defineProperty(globalThis, 'Worker', { value: prevWorker, configurable: true })
    if (prevWasm === undefined) {
      delete (globalThis as Record<string, unknown>).WebAssembly
    }
  }
})
