import assert from 'node:assert/strict'
import test from 'node:test'
import worker from '../server/mcp.ts'
import type { FeedItem } from '../src/lib/feeds.ts'

async function request(method: string, params: object) {
  const response = await worker.fetch(new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      host: 'localhost',
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-11-25',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('mcp-session-id'), null)
  const body = await response.text()
  const payload = response.headers.get('content-type')?.includes('text/event-stream')
    ? body.split('\n').find((line) => line.startsWith('data: '))!.slice(6)
    : body
  return JSON.parse(payload) as {
    result?: { tools?: { name: string; inputSchema: { type: string } }[]; content?: { type: string; text: string }[]; isError?: boolean }
    error?: { code: number; message: string }
  }
}

async function call(name: string, args: object = {}) {
  const response = await request('tools/call', { name, arguments: args })
  assert.equal(response.error, undefined)
  assert.ok(response.result?.content?.[0]?.text)
  return response.result
}

function data<T>(result: Awaited<ReturnType<typeof call>>): T {
  assert.notEqual(result.isError, true, result.content?.[0]?.text)
  return JSON.parse(result.content![0].text) as T
}

test('MCP registers exactly eight tools and rejects invalid inputs', async () => {
  const response = await request('tools/list', {})
  const tools = response.result?.tools ?? []
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    'daily_briefing', 'export_kiro_task', 'get_item', 'get_providers',
    'list_feeds', 'search_items', 'semantic_search', 'summarize_item',
  ])
  assert.ok(tools.every((tool) => tool.inputSchema.type === 'object'))
  for (const [name, args] of [
    ['get_item', {}],
    ['search_items', { limit: 51 }],
    ['semantic_search', { query: ' ' }],
    ['summarize_item', { id: 'current-item', provider: 'unknown' }],
  ] as const) {
    const invalid = await request('tools/call', { name, arguments: args })
    assert.ok(invalid.error || invalid.result?.isError, `${name} accepted invalid input`)
  }
})

test('all eight MCP tools serve real live data or honest no-provider results', async (t) => {
  // The smoke test uses public RSS data, not invented articles or mocked fetches.
  // Disable AI credentials for this test only so the suite never incurs charges.
  const keys = ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'AWS_BEARER_TOKEN_BEDROCK', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']
  const saved = keys.map((key) => process.env[key])
  keys.forEach((key) => { delete process.env[key] })
  t.after(() => keys.forEach((key, index) => {
    if (saved[index] === undefined) delete process.env[key]
    else process.env[key] = saved[index]
  }))

  await t.test('list_feeds', async () => {
    const catalog = data<{ feeds: { id: string; url: string }[] }>(await call('list_feeds'))
    assert.equal(catalog.feeds.length, 3)
    assert.ok(catalog.feeds.some((feed) => feed.url === 'https://aws.amazon.com/blogs/aws/feed/'))
  })

  let item: FeedItem
  await t.test('search_items', async () => {
    const found = data<{ items: FeedItem[]; errors: unknown[] }>(await call('search_items', { limit: 5 }))
    assert.ok(found.items.length > 0 && found.items.length <= 5)
    assert.ok(found.items.every((entry) => !entry.sample && /^https?:/.test(entry.link)))
    assert.ok(found.items.every((entry) => entry.score !== undefined && entry.score >= 0 && entry.score <= 100 && entry.scoreDimensions))
    assert.ok(found.items.every((entry, index) => index === 0 || found.items[index - 1].score! >= entry.score!))
    item = found.items[0]
  })
  assert.ok(item!, 'A live feed item is required for the remaining smoke calls')

  await t.test('get_item', async () => {
    const found = data<FeedItem>(await call('get_item', { id: item.id }))
    assert.equal(found.title, item.title)
    assert.equal(found.link, item.link)
  })
  await t.test('summarize_item', async () => {
    const summary = await call('summarize_item', { id: item.id })
    assert.equal(summary.isError, true)
    assert.match(summary.content![0].text, /No AI provider key is configured/)
  })
  await t.test('semantic_search', async () => {
    const found = data<{ available: boolean; items: FeedItem[] }>(await call('semantic_search', { query: item.title.slice(0, 100) }))
    assert.equal(found.available, false)
    assert.ok(found.items.some((entry) => entry.id === item.id))
  })
  await t.test('get_providers', async () => {
    const status = data<{ providers: { id: string; available: boolean }[] }>(await call('get_providers'))
    assert.deepEqual(status.providers.map((entry) => entry.id), ['gemini', 'openai', 'anthropic', 'bedrock'])
    assert.ok(status.providers.every((entry) => entry.available === false))
  })
  await t.test('daily_briefing', async () => {
    const briefing = data<{ items: FeedItem[] }>(await call('daily_briefing'))
    assert.equal(briefing.items.length, 5)
    assert.equal(briefing.items[0].id, item.id)
    assert.equal(new Set(briefing.items.map((entry) => entry.link)).size, 5)
  })
  await t.test('export_kiro_task', async () => {
    const bundle = data<{ requirements: string; design: string; tasks: string }>(await call('export_kiro_task', { id: item.id }))
    assert.ok(bundle.requirements.includes(item.title) && bundle.requirements.includes(item.link))
    assert.match(bundle.design, /Architecture & Scope/)
    assert.match(bundle.tasks, /Run build, typecheck, and lint/)
  })
})
