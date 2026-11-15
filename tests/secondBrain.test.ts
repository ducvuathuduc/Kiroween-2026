import test from 'node:test'
import assert from 'node:assert/strict'
import type { FeedItem } from '../src/lib/feeds'
import {
  computeTopicOverlapScore,
  extractItemTopics,
  findResurfacedReads,
  findSharedTopics,
  rankRelatedPastReads,
  type PastReadRecord,
} from '../src/lib/secondBrain'
import {
  createSemanticSearchClient,
  type EmbedWorkerOutbound,
} from '../src/lib/semanticSearch'
import {
  sanitizePastReads,
  unmarkSavedPastRead,
  upsertPastRead,
} from '../src/lib/storage'

const NOW_ISO = '2026-11-15T12:00:00.000Z'
const NOW_MS = Date.parse(NOW_ISO)
const DAY_MS = 86_400_000

function daysBefore(days: number): string {
  return new Date(NOW_MS - days * DAY_MS).toISOString()
}

const TARGET_ITEM: FeedItem = {
  id: 'target-1',
  feedId: 'aws-news',
  feedTitle: 'AWS News Blog',
  title: 'Orchestrating Amazon Bedrock Agents with Step Functions and IAM Guardrails',
  link: 'https://aws.amazon.com/blogs/aws/bedrock-step-functions-iam/',
  pubDate: NOW_ISO,
  description:
    'How to coordinate multi-step Bedrock AgentCore workflows using Step Functions, least-privilege IAM roles, and automated guardrails.',
  score: 92,
}

const PAST_READS: PastReadRecord[] = [
  {
    id: 'past-bedrock-iam',
    feedId: 'aws-ml',
    feedTitle: 'AWS Machine Learning Blog',
    title: 'Least-privilege IAM guardrails for Amazon Bedrock agents',
    link: 'https://aws.amazon.com/blogs/machine-learning/bedrock-iam/',
    pubDate: daysBefore(40),
    description:
      'Production security patterns for Amazon Bedrock agentic workflows and Step Functions state machines.',
    score: 88,
    readAt: daysBefore(35),
    savedAt: daysBefore(35),
  },
  {
    id: 'past-step-functions',
    feedId: 'aws-news',
    feedTitle: 'AWS News Blog',
    title: 'Serverless orchestration with AWS Step Functions and Lambda',
    link: 'https://aws.amazon.com/blogs/aws/step-functions-lambda/',
    pubDate: daysBefore(20),
    description:
      'Building resilient workflow automation on AWS serverless primitives with Step Functions.',
    score: 79,
    readAt: daysBefore(14),
  },
  {
    id: 'past-agents-mcp',
    feedId: 'hn',
    feedTitle: 'Hacker News',
    title: 'Multi-agent tool calling and Bedrock AgentCore patterns',
    link: 'https://news.ycombinator.com/item?id=100',
    pubDate: daysBefore(10),
    description:
      'Notes on orchestrating Bedrock agents and guardrail validation loops in production.',
    score: 81,
    savedAt: daysBefore(8),
  },
  {
    id: 'past-kiro-evals',
    feedId: 'aws-ml',
    feedTitle: 'AWS Machine Learning Blog',
    title: 'Evaluating agentic coding pipelines on Amazon Bedrock',
    link: 'https://aws.amazon.com/blogs/machine-learning/evals-bedrock/',
    pubDate: daysBefore(45),
    description:
      'Deterministic evaluation harnesses for coding agents using Bedrock inference.',
    score: 84,
    readAt: daysBefore(42),
  },
  {
    id: 'past-unrelated-css',
    feedId: 'hn',
    feedTitle: 'Hacker News',
    title: 'Typography scale and CSS subgrid layout notes',
    link: 'https://example.com/css-subgrid',
    pubDate: daysBefore(50),
    description: 'Using CSS subgrid and font metrics for editorial typography.',
    score: 40,
    readAt: daysBefore(45),
  },
]

test('extractItemTopics and findSharedTopics identify curated and technical topics', () => {
  const topics = extractItemTopics(TARGET_ITEM)
  assert.ok(topics.curated.includes('Amazon Bedrock'))
  assert.ok(topics.curated.includes('AI Agents'))
  assert.ok(topics.curated.includes('Security & IAM'))

  const shared = findSharedTopics(TARGET_ITEM, PAST_READS[0])
  assert.ok(shared.includes('Amazon Bedrock'))
  assert.ok(shared.includes('Security & IAM'))
  assert.ok(shared.length <= 4)

  const noOverlap = computeTopicOverlapScore(TARGET_ITEM, PAST_READS[4])
  assert.equal(noOverlap.sharedTopics.length, 0)
  assert.equal(noOverlap.score, 0)
})

test('rankRelatedPastReads returns top 3 matches labeled topic-overlap when no embedding key is configured', () => {
  const withSelfAndDup: PastReadRecord[] = [
    {
      ...PAST_READS[0],
      id: TARGET_ITEM.id,
      title: TARGET_ITEM.title,
    },
    {
      ...PAST_READS[0],
      id: 'dup-title',
      title: TARGET_ITEM.title,
    },
    ...PAST_READS,
  ]

  const matches = rankRelatedPastReads(TARGET_ITEM, withSelfAndDup, {
    allowSemantic: false,
    limit: 3,
  })

  assert.equal(matches.length, 3)
  assert.ok(matches.every((m) => m.item.id !== TARGET_ITEM.id))
  assert.ok(matches.every((m) => m.item.id !== 'dup-title'))
  assert.ok(matches.every((m) => m.item.id !== 'past-unrelated-css'))
  assert.ok(matches.every((m) => m.matchKind === 'topic-overlap'))
  assert.ok(matches.every((m) => m.sharedTopics.length > 0))
  assert.ok(matches[0].score >= matches[1].score)
  assert.ok(matches[1].score >= matches[2].score)
  assert.equal(matches[0].item.id, 'past-bedrock-iam')

  const emptyMatches = rankRelatedPastReads(
    {
      id: 'cooking',
      title: 'Sourdough starter hydration ratios',
      description: 'Fermentation temperatures for crusty loaves.',
    },
    PAST_READS,
    { allowSemantic: false },
  )
  assert.deepEqual(emptyMatches, [])
})

test('rankRelatedPastReads uses real cosine similarity labeled semantic when vectors are provided', () => {
  const vecA = [1, 0, 0, 0]
  const vecClose = [0.85, 0.52, 0, 0]
  const vecFar = [0, 1, 0, 0]

  const matches = rankRelatedPastReads(TARGET_ITEM, PAST_READS, {
    allowSemantic: true,
    vectors: {
      [TARGET_ITEM.id]: vecA,
      'past-step-functions': vecClose,
      'past-unrelated-css': vecFar,
    },
    limit: 3,
  })

  const semanticHit = matches.find((m) => m.item.id === 'past-step-functions')
  assert.ok(semanticHit)
  assert.equal(semanticHit.matchKind, 'semantic')
  assert.ok(semanticHit.score > 0.8)
  assert.ok(semanticHit.sharedTopics.length > 0)

  // Un-embedded items fall back honestly to topic-overlap rather than faking semantic
  const fallbackHit = matches.find((m) => m.item.id === 'past-bedrock-iam')
  assert.ok(fallbackHit)
  assert.equal(fallbackHit.matchKind, 'topic-overlap')
})

test('findResurfacedReads surfaces only >30d reads/saves matching today top stories', () => {
  const boundary30Days: PastReadRecord = {
    id: 'past-exact-30d',
    feedId: 'aws-news',
    feedTitle: 'AWS News Blog',
    title: 'Amazon Bedrock agents launch notes',
    link: 'https://aws.amazon.com/blogs/aws/exact-30/',
    pubDate: daysBefore(31),
    description: 'Amazon Bedrock agent workflows and IAM guardrails.',
    score: 80,
    readAt: daysBefore(30),
  }

  const resurfaced = findResurfacedReads(
    [...PAST_READS, boundary30Days],
    [TARGET_ITEM],
    {
      nowMs: NOW_MS,
      allowSemantic: false,
      limit: 5,
    },
  )

  const ids = resurfaced.map((r) => r.item.id)
  assert.ok(ids.includes('past-bedrock-iam'))
  assert.ok(ids.includes('past-kiro-evals'))
  // 14d, 8d, and exact 30.0d must not resurface; unrelated >30d must not resurface
  assert.ok(!ids.includes('past-step-functions'))
  assert.ok(!ids.includes('past-agents-mcp'))
  assert.ok(!ids.includes('past-exact-30d'))
  assert.ok(!ids.includes('past-unrelated-css'))

  assert.equal(resurfaced[0].matchedTopStory.id, TARGET_ITEM.id)
  assert.equal(resurfaced[0].matchKind, 'topic-overlap')
  assert.ok(resurfaced[0].daysAgo > 30)
  assert.ok(resurfaced[0].sharedTopics.length > 0)
})

test('storage helpers ignore sample items, preserve original readAt, and sanitize records', () => {
  const sampleItem: FeedItem = {
    ...TARGET_ITEM,
    id: 'sample-0',
    sample: true,
  }
  assert.deepEqual(upsertPastRead([], sampleItem, 'read', NOW_ISO), [])

  const first = upsertPastRead([], TARGET_ITEM, 'read', daysBefore(35))
  assert.equal(first.length, 1)
  assert.equal(first[0].readAt, daysBefore(35))
  assert.equal(first[0].savedAt, undefined)

  // Re-opening an old read preserves historical readAt while adding savedAt on save
  const reopened = upsertPastRead(first, TARGET_ITEM, 'read', NOW_ISO)
  assert.equal(reopened[0].readAt, daysBefore(35))

  const saved = upsertPastRead(reopened, TARGET_ITEM, 'save', NOW_ISO)
  assert.equal(saved[0].readAt, daysBefore(35))
  assert.equal(saved[0].savedAt, NOW_ISO)

  // Un-saving clears savedAt while preserving readAt
  const unsaved = unmarkSavedPastRead(saved, TARGET_ITEM.id)
  assert.equal(unsaved.length, 1)
  assert.equal(unsaved[0].savedAt, undefined)
  assert.equal(unsaved[0].readAt, daysBefore(35))

  // Saved-only item is removed completely when un-saved
  const saveOnly = upsertPastRead([], TARGET_ITEM, 'save', NOW_ISO)
  assert.deepEqual(unmarkSavedPastRead(saveOnly, TARGET_ITEM.id), [])

  const sanitized = sanitizePastReads([
    { ...saved[0] },
    { ...saved[0], id: 'sample-leak', sample: true },
    { id: 'bad-no-timestamp', title: 'Missing dates', feedId: 'x', feedTitle: 'X', link: '', description: '', pubDate: NOW_ISO },
  ])
  assert.equal(sanitized.length, 1)
  assert.equal(sanitized[0].id, TARGET_ITEM.id)
})

test('SemanticSearchClient.embedItems reuses the existing worker with skipQuery=true and caches vectors', async () => {
  let embedCalls = 0
  let lastSkipQuery: boolean | undefined
  const unitX = Array.from({ length: 384 }, (_, i) => (i === 0 ? 1 : 0))

  class StubWorker {
    private listeners = new Map<string, Set<(event: unknown) => void>>()
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
      lastSkipQuery = payload.skipQuery
      queueMicrotask(() => {
        const docVecs: Record<string, number[]> = {}
        for (const d of payload.docs) {
          docVecs[d.id] = unitX
        }
        this.emit('message', {
          type: 'result',
          requestId: payload.requestId,
          queryVec: null,
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
    const vecs = await client.embedItems([TARGET_ITEM])
    assert.equal(embedCalls, 1)
    assert.equal(lastSkipQuery, true)
    assert.equal(vecs[TARGET_ITEM.id]?.length, 384)

    const cached = await client.getCachedItemVectors([TARGET_ITEM.id])
    assert.equal(embedCalls, 1)
    assert.equal(cached[TARGET_ITEM.id]?.length, 384)
    client.dispose()
  } finally {
    Object.defineProperty(globalThis, 'Worker', { value: prevWorker, configurable: true })
    if (prevWasm === undefined) {
      delete (globalThis as Record<string, unknown>).WebAssembly
    }
  }
})
