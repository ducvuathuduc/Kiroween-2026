import assert from 'node:assert/strict'
import test from 'node:test'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import app from '../server.ts'
import worker, { createReaderMcpHandler } from '../server/mcp.ts'
import type { LiveAiEnv } from '../server/liveAi.ts'
import type { FeedItem } from '../src/lib/feeds.ts'
import { createMemoryNewsletterStore } from '../src/lib/newsletter.ts'

const MODERN_PROTOCOL = '2026-07-28'
const PROTOCOL_META_KEY = 'io.modelcontextprotocol/protocolVersion'
const CAPABILITIES_META_KEY = 'io.modelcontextprotocol/clientCapabilities'

interface McpToolDef {
  name: string
  description?: string
  inputSchema: { type: string }
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
}

interface McpRpcResponse {
  result?: {
    supportedVersions?: string[]
    protocolVersion?: string
    _meta?: Record<string, unknown>
    tools?: McpToolDef[]
    content?: { type: string; text: string }[]
    isError?: boolean
  }
  error?: { code: number; message: string }
}

async function sendMcp(
  method: string,
  params: Record<string, unknown>,
  options: {
    protocol?: '2026-07-28' | '2025-11-25'
    fetcher?: (req: Request) => Promise<Response>
  } = {},
): Promise<McpRpcResponse> {
  const protocol = options.protocol ?? MODERN_PROTOCOL
  const target = new URL('/mcp', process.env.READER_TEST_URL ?? 'http://localhost')
  const send =
    options.fetcher ?? (process.env.READER_TEST_URL ? fetch : worker.fetch)

  const bodyParams =
    protocol === MODERN_PROTOCOL
      ? {
          ...params,
          _meta: {
            ...((params._meta as Record<string, unknown> | undefined) ?? {}),
            [PROTOCOL_META_KEY]: MODERN_PROTOCOL,
            [CAPABILITIES_META_KEY]: {},
          },
        }
      : params

  const headers: Record<string, string> = {
    host: target.host,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': protocol,
  }
  if (protocol === MODERN_PROTOCOL) {
    headers['mcp-method'] = method
    if (method === 'tools/call' && typeof params.name === 'string') {
      headers['mcp-name'] = params.name
    }
  }

  const response = await send(
    new Request(target, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params: bodyParams,
      }),
    }),
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('mcp-session-id'), null)
  const raw = await response.text()
  const payload = response.headers.get('content-type')?.includes('text/event-stream')
    ? raw.split('\n').find((line) => line.startsWith('data: '))!.slice(6)
    : raw
  return JSON.parse(payload) as McpRpcResponse
}

async function callTool(
  name: string,
  args: object = {},
  options?: {
    protocol?: '2026-07-28' | '2025-11-25'
    fetcher?: (req: Request) => Promise<Response>
  },
) {
  const response = await sendMcp(
    'tools/call',
    { name, arguments: args },
    options,
  )
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.ok(response.result?.content?.[0]?.text)
  return response.result
}

function parseData<T>(result: Awaited<ReturnType<typeof callTool>>): T {
  assert.notEqual(result.isError, true, result.content?.[0]?.text)
  return JSON.parse(result.content![0].text) as T
}

test('MCP 2026-07-28 and 2025-11-25 expose ONLY five read-only tools with authless demo scope & CORS', async () => {
  const discover = await sendMcp('server/discover', {}, { protocol: '2026-07-28' })
  assert.equal(discover.error, undefined, JSON.stringify(discover.error))
  assert.deepEqual(discover.result?.supportedVersions, ['2026-07-28'])
  const discoverInfo = discover.result?._meta?.['io.modelcontextprotocol/serverInfo'] as
    | { name?: string; version?: string }
    | undefined
  assert.equal(discoverInfo?.name, 'resurrected-reader')

  const sdkClient = new Client(
    { name: 'sdk-v2-test-client', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } },
  )
  const transport = new StreamableHTTPClientTransport(
    new URL('/mcp', process.env.READER_TEST_URL ?? 'http://localhost'),
    {
      fetch: (input, init) =>
        process.env.READER_TEST_URL
          ? fetch(input, init)
          : worker.fetch(new Request(input, init)),
    },
  )
  await sdkClient.connect(transport)
  assert.equal(transport.protocolVersion, MODERN_PROTOCOL)
  const sdkTools = await sdkClient.listTools()
  assert.deepEqual(
    sdkTools.tools.map((t) => t.name).sort(),
    [
      'get_daily_briefing',
      'get_feed_items',
      'get_signal_scores',
      'list_newsletters',
      'resurface_past_read',
    ],
  )
  await sdkClient.close()

  for (const protocol of ['2026-07-28', '2025-11-25'] as const) {
    const listed = await sendMcp('tools/list', {}, { protocol })
    assert.equal(listed.error, undefined, JSON.stringify(listed.error))
    const tools = listed.result?.tools ?? []
    assert.deepEqual(
      tools.map((tool) => tool.name).sort(),
      [
        'get_daily_briefing',
        'get_feed_items',
        'get_signal_scores',
        'list_newsletters',
        'resurface_past_read',
      ],
    )
    for (const tool of tools) {
      assert.equal(tool.inputSchema.type, 'object')
      assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} missing readOnlyHint`)
      assert.equal(tool.annotations?.destructiveHint, false, `${tool.name} must not be destructive`)
      assert.equal(tool.annotations?.idempotentHint, true, `${tool.name} should be idempotent`)
      assert.match(
        tool.description ?? '',
        /authless read-only demo scope/i,
        `${tool.name} must disclose authless read-only demo scope`,
      )
    }
  }

  for (const [name, args] of [
    ['get_daily_briefing', { limit: 6 }],
    ['get_daily_briefing', { unexpected: true }],
    ['get_feed_items', { limit: 51 }],
    ['get_feed_items', { feedId: 'not-a-default-feed' }],
    ['get_feed_items', { query: ' ' }],
    ['get_signal_scores', { itemId: ' ' }],
    ['get_signal_scores', { limit: 0 }],
    ['resurface_past_read', { minAgeDays: -1 }],
    ['resurface_past_read', { limit: 11 }],
    ['list_newsletters', { entryLimit: 21 }],
  ] as const) {
    const invalid = await sendMcp('tools/call', { name, arguments: args })
    assert.ok(invalid.error || invalid.result?.isError, `${name} accepted invalid input`)
  }

  const preflight = await app.request('http://localhost/mcp', { method: 'OPTIONS' })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*')
})

test('all five read-only MCP tools serve live feeds, 4D scores, Second Brain resurface, and newsletters', async (t) => {
  // Public RSS smoke test with provider credentials cleared to avoid charges.
  const keys = [
    'GEMINI_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'AWS_BEARER_TOKEN_BEDROCK',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
  ]
  const saved = keys.map((key) => process.env[key])
  keys.forEach((key) => {
    delete process.env[key]
  })
  t.after(() =>
    keys.forEach((key, index) => {
      if (saved[index] === undefined) delete process.env[key]
      else process.env[key] = saved[index]
    }),
  )

  let topItem: FeedItem
  await t.test('get_daily_briefing (2026-07-28 + 2025-11-25)', async () => {
    const modern = parseData<{ items: FeedItem[]; errors: unknown[] }>(
      await callTool('get_daily_briefing', {}, { protocol: '2026-07-28' }),
    )
    const legacy = parseData<{ items: FeedItem[]; errors: unknown[] }>(
      await callTool('get_daily_briefing', {}, { protocol: '2025-11-25' }),
    )
    assert.equal(modern.items.length, 5)
    assert.deepEqual(modern, legacy)
    assert.ok(modern.items.every((entry) => !entry.sample && /^https?:/.test(entry.link)))
    assert.equal(new Set(modern.items.map((entry) => entry.link)).size, 5)
    topItem = modern.items[0]
  })

  await t.test('get_feed_items', async () => {
    const awsOnly = parseData<{ items: FeedItem[]; errors: unknown[] }>(
      await callTool('get_feed_items', { feedId: 'aws-news', limit: 5 }),
    )
    assert.ok(awsOnly.items.length > 0 && awsOnly.items.length <= 5)
    assert.ok(awsOnly.items.every((entry) => entry.feedId === 'aws-news'))
    assert.ok(
      awsOnly.items.every(
        (entry, idx) => idx === 0 || (awsOnly.items[idx - 1].score ?? 0) >= (entry.score ?? 0),
      ),
    )
  })

  await t.test('get_signal_scores', async () => {
    const overview = parseData<{
      scoringMethod: string
      weights: { relevance: number; recency: number; authority: number; novelty: number }
      summary: { total: number; highCount: number; avgScore: number; topScore: number }
      histogram: Array<{ bucket: string; count: number }>
      feedActivity: Array<{ fullTitle: string; total: number }>
      items: Array<{ id: string; score: number; dimensions: Record<string, number> }>
    }>(await callTool('get_signal_scores', { limit: 4 }))

    assert.equal(overview.scoringMethod, 'deterministic-4d')
    assert.deepEqual(overview.weights, {
      relevance: 0.42,
      recency: 0.24,
      authority: 0.18,
      novelty: 0.16,
    })
    assert.ok(overview.summary.total > 0)
    assert.equal(
      overview.histogram.reduce((sum, b) => sum + b.count, 0),
      overview.summary.total,
    )
    assert.equal(overview.items.length, 4)

    const detail = parseData<{
      scoringMethod: string
      item: {
        id: string
        score: number
        reasons: Array<{ label: string; dimension: string; points: number }>
        axes: Array<{ dimension: string; value: number }>
      }
    }>(await callTool('get_signal_scores', { itemId: topItem.id }))
    assert.equal(detail.scoringMethod, 'deterministic-4d')
    assert.equal(detail.item.id, topItem.id)
    assert.equal(detail.item.axes.length, 4)
    assert.ok(Array.isArray(detail.item.reasons))
  })

  await t.test('resurface_past_read (honest no-localStorage + topic-overlap + Vectorize env)', async () => {
    const empty = parseData<{ mode: string; matches: unknown[]; note?: string }>(
      await callTool('resurface_past_read', { query: 'Amazon Bedrock Agents' }),
    )
    assert.equal(empty.mode, 'topic-overlap')
    assert.deepEqual(empty.matches, [])
    assert.match(empty.note ?? '', /no browser localStorage/i)

    const oldIso = new Date(Date.now() - 45 * 86_400_000).toISOString()
    const recentIso = new Date(Date.now() - 3 * 86_400_000).toISOString()
    const matched = parseData<{
      mode: string
      matches: Array<{
        item: { id: string }
        matchKind: string
        sharedTopics: string[]
        daysAgo: number
        why: string
      }>
    }>(
      await callTool('resurface_past_read', {
        query: 'Amazon Bedrock Agents guardrails observability',
        minAgeDays: 30,
        pastReads: [
          {
            id: 'past-bedrock-45d',
            feedTitle: 'AWS Machine Learning Blog',
            title: 'Securing Amazon Bedrock Agents with Guardrails',
            description: 'Patterns for Amazon Bedrock Agents guardrails and IAM boundaries.',
            readAt: oldIso,
            score: 88,
          },
          {
            id: 'recent-bedrock-3d',
            feedTitle: 'AWS News Blog',
            title: 'Recent Amazon Bedrock update',
            description: 'Recent post that is under 30 days old.',
            readAt: recentIso,
            score: 75,
          },
        ],
      }),
    )
    assert.equal(matched.mode, 'topic-overlap')
    assert.equal(matched.matches.length, 1)
    assert.equal(matched.matches[0].item.id, 'past-bedrock-45d')
    assert.equal(matched.matches[0].matchKind, 'topic-overlap')
    assert.ok(matched.matches[0].daysAgo >= 44)
    assert.match(matched.matches[0].why, /Topic-overlap/i)

    // Verify Workers AI + Vectorize env wiring through createReaderMcpHandler.
    const unitVec = Array.from({ length: 1024 }, (_v, i) => (i === 0 ? 1 : 0))
    const fakeEnv: LiveAiEnv = {
      AI: {
        async run(model) {
          if (model === '@cf/baai/bge-m3') return { data: [unitVec] }
          if (model === '@cf/baai/bge-reranker-base') return { data: [{ index: 0, score: 0.91 }] }
          throw new Error(`Unexpected model: ${model}`)
        },
      },
      VECTORIZE: {
        async query() {
          return {
            matches: [
              {
                id: 'vec-past-1',
                score: 0.87,
                metadata: {
                  id: 'vec-past-1',
                  feedTitle: 'AWS News Blog',
                  title: 'Amazon Bedrock Guardrails Architecture',
                  description: 'Guardrails and multi-agent policies on Amazon Bedrock.',
                  interactedAt: oldIso,
                  score: 90,
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
    const envHandler = createReaderMcpHandler({ getEnv: () => fakeEnv })
    const vecResult = parseData<{
      mode: string
      model: string
      rerankerModel: string | null
      matches: Array<{ item: { id: string }; matchKind: string; why: string }>
    }>(
      await callTool(
        'resurface_past_read',
        { query: 'Amazon Bedrock Guardrails', minAgeDays: 30 },
        { fetcher: envHandler.fetch },
      ),
    )
    assert.equal(vecResult.mode, 'workers-ai-vectorize')
    assert.equal(vecResult.model, '@cf/baai/bge-m3')
    assert.equal(vecResult.rerankerModel, '@cf/baai/bge-reranker-base')
    assert.equal(vecResult.matches[0].item.id, 'vec-past-1')
    assert.equal(vecResult.matches[0].matchKind, 'semantic')
    assert.match(vecResult.matches[0].why, /Vectorize top-10/i)
  })

  await t.test('list_newsletters reads shared NewsletterStore without mutating state', async () => {
    const store = createMemoryNewsletterStore()
    const created = await store.createFeed({
      title: 'AWS Builder Weekly',
      domain: 'mail.example.invalid',
    })
    await store.importEmail(
      created.id,
      [
        'From: AWS Weekly <weekly@example.com>',
        'Subject: Serverless Workers + Bedrock Roundup',
        'Message-ID: <nl-mcp-1@example.com>',
        'Date: Mon, 10 Nov 2026 09:00:00 GMT',
        '',
        'Read more at https://aws.amazon.com/blogs/aws/',
      ].join('\r\n'),
    )

    const nlHandler = createReaderMcpHandler({ newsletterStore: store })
    const listed = parseData<{
      count: number
      newsletters: Array<{
        id: string
        title: string
        kind: string
        url: string
        entryCount: number
        entries?: Array<{ subject: string; preview: string }>
      }>
    }>(
      await callTool(
        'list_newsletters',
        { includeEntries: true, entryLimit: 5 },
        { fetcher: nlHandler.fetch },
      ),
    )

    assert.equal(listed.count, 1)
    assert.equal(listed.newsletters[0].id, created.id)
    assert.equal(listed.newsletters[0].kind, 'newsletter')
    assert.equal(listed.newsletters[0].url, `/rss/${created.id}`)
    assert.equal(listed.newsletters[0].entryCount, 1)
    assert.equal(
      listed.newsletters[0].entries?.[0].subject,
      'Serverless Workers + Bedrock Roundup',
    )

    const missing = await callTool(
      'list_newsletters',
      { feedId: 'does-not-exist' },
      { fetcher: nlHandler.fetch },
    )
    assert.equal(missing.isError, true)
    assert.match(missing.content![0].text, /Newsletter feed not found/i)

    // Verify main Worker (server.ts) shares its newsletterStore with /mcp.
    const createRes = await app.request('http://localhost/api/newsletter/feeds', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Worker Shared Digest' }),
    })
    assert.equal(createRes.status, 201)
    const { feed: createdViaApi } = (await createRes.json()) as {
      feed: { id: string }
    }

    const listedViaWorker = parseData<{
      newsletters: Array<{ id: string; title: string }>
    }>(
      await callTool(
        'list_newsletters',
        { feedId: createdViaApi.id },
        { fetcher: (req) => app.request(req) },
      ),
    )
    assert.equal(listedViaWorker.newsletters[0].id, createdViaApi.id)
    assert.equal(listedViaWorker.newsletters[0].title, 'Worker Shared Digest')

    // Clean up test feed from shared store.
    await app.request(`http://localhost/api/newsletter/feeds/${createdViaApi.id}`, {
      method: 'DELETE',
    })
  })
})
