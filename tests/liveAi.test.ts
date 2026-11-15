import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import app, { queue as workerQueue } from '../server.ts'
import {
  BGE_M3_DIMENSIONS,
  embedWithWorkersAi,
  resurfaceSecondBrain,
  summarizeWithWorkersAi,
  WORKERS_AI_EMBED_MODEL,
  WORKERS_AI_RERANK_MODEL,
  WORKERS_AI_SUMMARY_MODEL,
  type ExecutionCtxLike,
  type LiveAiEnv,
  type VectorizeUpsertRecord,
} from '../server/liveAi.ts'
import type { FeedItem } from '../src/lib/feeds.ts'
import {
  computeDecayWeightedTasteVector,
  rankFeedWithTasteVector,
} from '../src/lib/tasteVector.ts'

const NOW_ISO = '2026-11-15T12:00:00.000Z'
const NOW_MS = Date.parse(NOW_ISO)
const DAY_MS = 86_400_000

function daysAgoIso(days: number): string {
  return new Date(NOW_MS - days * DAY_MS).toISOString()
}

function makeUnitVec1024(primaryIndex: number, secondaryIndex?: number, secondaryWeight = 0): number[] {
  const vec = Array<number>(BGE_M3_DIMENSIONS).fill(0)
  vec[primaryIndex] = 1
  if (typeof secondaryIndex === 'number' && secondaryWeight !== 0) {
    vec[secondaryIndex] = secondaryWeight
  }
  const norm = Math.hypot(...vec)
  return vec.map((v) => v / norm)
}

test('Workers AI models strictly use surviving post-20 Nov 2026 models', () => {
  assert.equal(WORKERS_AI_SUMMARY_MODEL, '@cf/meta/llama-3.2-1b-instruct')
  assert.equal(WORKERS_AI_EMBED_MODEL, '@cf/baai/bge-m3')
  assert.equal(WORKERS_AI_RERANK_MODEL, '@cf/baai/bge-reranker-base')

  const src = readFileSync(new URL('../server/liveAi.ts', import.meta.url), 'utf8').toLowerCase()
  for (const retired of ['llama-3.1-8b-fp8', 'llama-3.1-8b-instruct-fp8', 'kimi', 'glm', 'deepseek-v4']) {
    assert.equal(src.includes(retired), false, `Retired model ${retired} must not appear`)
  }
})

test('POST /api/ai/summarize validates input and falls back honestly to extractive summary without bindings', async (t) => {
  const keys = ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'AWS_BEARER_TOKEN_BEDROCK', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']
  const saved = keys.map((k) => process.env[k])
  keys.forEach((k) => { delete process.env[k] })
  t.after(() => keys.forEach((k, idx) => {
    if (saved[idx] === undefined) delete process.env[k]
    else process.env[k] = saved[idx]
  }))

  const badRes = await app.request('/api/ai/summarize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '', content: '' }),
  })
  assert.equal(badRes.status, 400)

  const okRes = await app.request('/api/ai/summarize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Amazon Bedrock AgentCore Guardrails',
      feedTitle: 'AWS News Blog',
      link: 'https://aws.amazon.com/blogs/aws/agentcore-guardrails/',
      content:
        'Amazon Bedrock AgentCore enforces deterministic IAM policies and runtime guardrails across tool calls. Teams can audit multi-step agent traces in CloudWatch. Automated regression checks validate policy compliance before deployment.',
    }),
  })
  assert.equal(okRes.status, 200)
  const payload = (await okRes.json()) as {
    tldr: string
    takeaways: string[]
    whyMatters: string
    model: string
    mode: string
    fallbackReason?: string
  }
  assert.equal(payload.mode, 'extractive')
  assert.equal(payload.model, 'extractive')
  assert.ok(payload.tldr.includes('Amazon Bedrock AgentCore'))
  assert.ok(payload.takeaways.length >= 1)
  assert.ok(payload.whyMatters.includes('Extractive summary'))
  assert.ok(payload.fallbackReason)
})

test('summarizeWithWorkersAi invokes @cf/meta/llama-3.2-1b-instruct when AI binding is live', async () => {
  const calledModels: string[] = []
  const env: LiveAiEnv = {
    AI: {
      async run(model) {
        calledModels.push(model)
        return {
          response: JSON.stringify({
            tldr: 'Workers AI generated TL;DR for Bedrock AgentCore.',
            takeaways: ['IAM policy enforcement', 'CloudWatch tracing', 'Zero client keys'],
            whyMatters: 'Keeps inference low-latency on Cloudflare Workers.',
          }),
        }
      },
    },
  }

  const res = await summarizeWithWorkersAi({
    title: 'Amazon Bedrock AgentCore',
    feedTitle: 'AWS News Blog',
    link: 'https://aws.amazon.com/blogs/aws/agentcore/',
    content: 'AgentCore executes tool calls inside bounded IAM sessions.',
    env,
  })

  assert.deepEqual(calledModels, ['@cf/meta/llama-3.2-1b-instruct'])
  assert.equal(res.mode, 'workers-ai')
  assert.equal(res.model, '@cf/meta/llama-3.2-1b-instruct')
  assert.equal(res.tldr, 'Workers AI generated TL;DR for Bedrock AgentCore.')
  assert.equal(res.takeaways.length, 3)
})

test('embedWithWorkersAi computes 1024-dim @cf/baai/bge-m3 vectors and schedules Vectorize upsert strictly asynchronously via waitUntil', async () => {
  const waitUntilPromises: Promise<unknown>[] = []
  let upsertResolved = false
  let releaseUpsert!: () => void
  const upsertGate = new Promise<void>((resolve) => {
    releaseUpsert = resolve
  })
  const upsertedBatches: VectorizeUpsertRecord[][] = []

  const env: LiveAiEnv = {
    AI: {
      async run(model, input) {
        assert.equal(model, '@cf/baai/bge-m3')
        const texts = input.text as string[]
        return {
          data: texts.map((_, idx) => makeUnitVec1024(idx % 8)),
        }
      },
    },
    VECTORIZE: {
      async query() {
        return { matches: [] }
      },
      async upsert(vectors) {
        await upsertGate
        upsertedBatches.push(vectors)
        upsertResolved = true
        return { count: vectors.length }
      },
    },
  }

  const executionCtx: ExecutionCtxLike = {
    waitUntil(promise) {
      waitUntilPromises.push(promise)
    },
  }

  const result = await embedWithWorkersAi({
    items: [
      {
        id: 'item-1',
        feedId: 'aws-news',
        feedTitle: 'AWS News Blog',
        title: 'Bedrock AgentCore',
        description: 'Agentic workflows on AWS.',
        pubDate: NOW_ISO,
        score: 90,
      },
    ],
    ingest: true,
    env,
    executionCtx,
  })

  // HTTP response returned BEFORE Vectorize upsert resolved (non-blocking async ingest)
  assert.equal(upsertResolved, false)
  assert.equal(result.available, true)
  assert.equal(result.model, '@cf/baai/bge-m3')
  assert.equal(result.dimensions, 1024)
  assert.equal(result.queuedIngest, true)
  assert.equal(result.ingestTarget, 'waitUntil')
  assert.equal(result.embeddings['item-1']?.length, 1024)
  assert.equal(waitUntilPromises.length, 1)

  releaseUpsert()
  await Promise.all(waitUntilPromises)
  assert.equal(upsertResolved, true)
  assert.equal(upsertedBatches[0]?.[0]?.id, 'item-1')
  assert.equal(upsertedBatches[0]?.[0]?.values.length, 1024)
})

test('workerQueue handles async queue batch ingest into Vectorize', async () => {
  const upserted: VectorizeUpsertRecord[] = []
  await workerQueue(
    {
      messages: [
        {
          body: {
            items: [
              {
                id: 'q-1',
                feedTitle: 'AWS Blog',
                title: 'Queued article',
                description: 'Embedded asynchronously via Cloudflare Queue.',
              },
            ],
            embeddings: {
              'q-1': makeUnitVec1024(3),
            },
          },
        },
      ],
    },
    {
      VECTORIZE: {
        async query() {
          return { matches: [] }
        },
        async upsert(rows) {
          upserted.push(...rows)
          return { count: rows.length }
        },
      },
    },
  )
  assert.equal(upserted.length, 1)
  assert.equal(upserted[0]?.id, 'q-1')
  assert.equal(upserted[0]?.values.length, 1024)
})

test('resurfaceSecondBrain runs Vectorize topK 10 -> bge-reranker-base -> top 5 -> hybrid keyword fallback -> dedupe + decay + Signal Radar + why', async () => {
  let queriedTopK = 0
  let rerankContextCount = 0

  const env: LiveAiEnv = {
    AI: {
      async run(model, input) {
        if (model === '@cf/baai/bge-m3') {
          return { data: [makeUnitVec1024(0)] }
        }
        if (model === '@cf/baai/bge-reranker-base') {
          const contexts = input.contexts as Array<{ text: string }>
          rerankContextCount = contexts.length
          return {
            response: contexts.map((_, idx) => ({
              id: idx,
              // Reverse order so reranker genuinely promotes later Vectorize items
              score: idx === 1 ? 0.94 : Math.max(0.2, 0.7 - idx * 0.08),
            })),
          }
        }
        throw new Error(`Unexpected model: ${model}`)
      },
    },
    VECTORIZE: {
      async query(_vec, opts) {
        queriedTopK = opts.topK
        return {
          matches: [
            {
              id: 'top-story',
              score: 0.99,
              metadata: { title: 'Orchestrating Amazon Bedrock Agents', interactedAt: daysAgoIso(40) },
            },
            {
              id: 'vec-old-1',
              score: 0.78,
              metadata: {
                title: 'Serverless Lambda Cold Starts',
                feedTitle: 'AWS News Blog',
                description: 'Optimizing serverless Lambda functions.',
                interactedAt: daysAgoIso(45),
                score: 70,
              },
            },
            {
              id: 'vec-old-2',
              score: 0.72,
              metadata: {
                title: 'IAM Guardrails for Bedrock Agents',
                feedTitle: 'AWS ML Blog',
                description: 'Amazon Bedrock agent guardrails and IAM least privilege.',
                interactedAt: daysAgoIso(36),
                score: 92,
              },
            },
            {
              id: 'vec-too-recent',
              score: 0.95,
              metadata: {
                title: 'Recent Bedrock Post',
                feedTitle: 'AWS ML Blog',
                description: 'Bedrock agents from 5 days ago.',
                interactedAt: daysAgoIso(5),
                score: 88,
              },
            },
          ],
        }
      },
      async upsert() {
        return {}
      },
    },
  }

  const res = await resurfaceSecondBrain(
    {
      query: 'Orchestrating Amazon Bedrock Agents with IAM Guardrails',
      topStory: {
        id: 'top-story',
        title: 'Orchestrating Amazon Bedrock Agents',
        description: 'Amazon Bedrock agents and IAM guardrails.',
      },
      minAgeDays: 30,
      nowMs: NOW_MS,
      limit: 5,
      candidates: [
        {
          id: 'vec-old-2-dup-title',
          feedTitle: 'Mirror Feed',
          title: 'IAM Guardrails for Bedrock Agents',
          description: 'Duplicate title should be deduplicated.',
          readAt: daysAgoIso(38),
          score: 80,
        },
        {
          id: 'kw-only-old',
          feedTitle: 'AWS Architecture Blog',
          title: 'Multi-agent Bedrock orchestration patterns',
          description: 'Amazon Bedrock agents and Step Functions IAM guardrails.',
          readAt: daysAgoIso(41),
          score: 86,
        },
      ],
    },
    env,
  )

  assert.equal(res.mode, 'workers-ai-vectorize')
  assert.equal(res.model, '@cf/baai/bge-m3')
  assert.equal(res.rerankerModel, '@cf/baai/bge-reranker-base')
  assert.equal(queriedTopK, 10)
  assert.equal(rerankContextCount, 2) // top-story and <30d item filtered out before rerank
  assert.equal(res.rerankedCount, 2)

  const ids = res.matches.map((m) => m.item.id)
  assert.ok(!ids.includes('top-story'))
  assert.ok(!ids.includes('vec-too-recent'))
  assert.ok(!ids.includes('vec-old-2-dup-title')) // deduped by title
  assert.ok(ids.includes('vec-old-2'))
  assert.ok(ids.includes('kw-only-old')) // hybrid keyword fallback merged
  assert.equal(res.matches[0]?.item.id, 'vec-old-2')
  assert.ok(res.matches.every((m) => m.why.length > 0 && m.sharedTopics.length > 0))
})

test('resurfaceSecondBrain falls back honestly to topic-overlap when no Cloudflare bindings exist', async () => {
  const res = await resurfaceSecondBrain({
    query: 'Amazon Bedrock Agents',
    topStory: {
      id: 'story-1',
      title: 'Amazon Bedrock AgentCore Workflows',
      description: 'Bedrock agents with IAM guardrails.',
    },
    minAgeDays: 30,
    nowMs: NOW_MS,
    candidates: [
      {
        id: 'old-match',
        feedTitle: 'AWS ML Blog',
        title: 'Bedrock IAM Guardrails',
        description: 'Using Amazon Bedrock agents safely.',
        readAt: daysAgoIso(40),
        score: 85,
      },
      {
        id: 'too-new',
        feedTitle: 'AWS ML Blog',
        title: 'Recent Bedrock AgentCore',
        description: 'Amazon Bedrock agents.',
        readAt: daysAgoIso(10),
        score: 90,
      },
    ],
  })

  assert.equal(res.mode, 'topic-overlap')
  assert.equal(res.rerankerModel, null)
  assert.equal(res.matches.length, 1)
  assert.equal(res.matches[0]?.item.id, 'old-match')
  assert.equal(res.matches[0]?.matchKind, 'topic-overlap')
  assert.ok(res.matches[0]?.why.includes('Topic-overlap'))
})

test('computeDecayWeightedTasteVector and rankFeedWithTasteVector apply 0.5*cosine + 0.5*Signal Radar + 1 explore slot', () => {
  const vecAxis0 = makeUnitVec1024(0)
  const vecAxis1 = makeUnitVec1024(1)
  const vecAxis2 = makeUnitVec1024(2)

  // Recent saved read on axis 0 should dominate an older read on axis 1
  const taste = computeDecayWeightedTasteVector(
    [
      { id: 'r1', vector: vecAxis0, interactedAt: daysAgoIso(1), saved: true },
      { id: 'r2', vector: vecAxis1, interactedAt: daysAgoIso(45), saved: false },
    ],
    NOW_MS,
  )
  assert.ok(taste)
  assert.equal(taste.length, 1024)
  assert.ok(taste[0] > taste[1])

  const items: FeedItem[] = [
    {
      id: 'item-high-signal-on-taste',
      feedId: 'aws',
      feedTitle: 'AWS News Blog',
      title: 'High Signal On-Taste',
      link: 'https://aws.amazon.com/1',
      pubDate: NOW_ISO,
      description: 'A',
      score: 90,
      scoreDimensions: { relevance: 90, recency: 100, authority: 85, novelty: 80 },
    },
    {
      id: 'item-med-signal-on-taste',
      feedId: 'aws',
      feedTitle: 'AWS News Blog',
      title: 'Med Signal On-Taste',
      link: 'https://aws.amazon.com/2',
      pubDate: NOW_ISO,
      description: 'B',
      score: 76,
    },
    {
      id: 'item-already-read-on-taste',
      feedId: 'aws',
      feedTitle: 'AWS News Blog',
      title: 'Read On-Taste',
      link: 'https://aws.amazon.com/3',
      pubDate: NOW_ISO,
      description: 'C',
      score: 72,
    },
    {
      id: 'item-third-on-taste',
      feedId: 'aws',
      feedTitle: 'AWS News Blog',
      title: 'Third On-Taste',
      link: 'https://aws.amazon.com/4',
      pubDate: NOW_ISO,
      description: 'D',
      score: 68,
    },
    {
      id: 'item-explore-outside-bubble',
      feedId: 'hn',
      feedTitle: 'Hacker News',
      title: 'Out-of-Bubble Systems Post',
      link: 'https://example.com/explore',
      pubDate: NOW_ISO,
      description: 'E',
      score: 62,
    },
  ]

  const vectors: Record<string, number[]> = {
    'item-high-signal-on-taste': vecAxis0,
    'item-med-signal-on-taste': vecAxis0,
    'item-already-read-on-taste': vecAxis0,
    'item-third-on-taste': vecAxis0,
    'item-explore-outside-bubble': vecAxis2, // orthogonal to taste -> lowest cosine
  }

  const ranked = rankFeedWithTasteVector(items, vectors, taste, {
    readIds: ['item-already-read-on-taste'],
    exploreSlotIndex: 3,
  })

  assert.equal(ranked.length, 5)
  assert.equal(ranked[0]?.item.id, 'item-high-signal-on-taste')
  assert.equal(ranked[3]?.item.id, 'item-explore-outside-bubble')
  assert.equal(ranked[3]?.isExploreSlot, true)
  assert.ok(ranked[3]?.exploreReason)
  // Original deterministic Signal Radar score & dimensions must never be mutated
  assert.equal(ranked[0]?.item.score, 90)
  assert.deepEqual(ranked[0]?.item.scoreDimensions, {
    relevance: 90,
    recency: 100,
    authority: 85,
    novelty: 80,
  })
})
