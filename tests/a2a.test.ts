import assert from 'node:assert/strict'
import test from 'node:test'
import app from '../server.ts'
import { loadItems } from '../server/items.ts'
import { selectDailyBriefingItems } from '../src/lib/briefing.ts'
import { buildKiroSpecBundle } from '../src/lib/kiroTask.ts'
import type { FeedItem } from '../src/lib/feeds.ts'

function request(path: string, init?: RequestInit) {
  return process.env.READER_TEST_URL
    ? fetch(new URL(path, process.env.READER_TEST_URL), init)
    : app.request(new URL(path, 'http://localhost'), init)
}
function message(data: unknown) {
  return { message: { kind: 'message', role: 'user', messageId: 'test-message', parts: [{ kind: 'data', data }] } }
}
function rpc(params: unknown, method = 'message/send') {
  return { jsonrpc: '2.0', id: 'test-request', method, params }
}
function post(body: unknown) {
  return request('/a2a/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
async function task(data: unknown) {
  const response = await post(rpc(message(data)))
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /application\/json/)
  const body = await response.json()
  assert.equal(body.jsonrpc, '2.0')
  assert.equal(body.id, 'test-request')
  assert.equal(body.error, undefined)
  const task = body.result
  assert.equal(task.kind, 'task')
  assert.match(task.id, /^[\da-f-]{36}$/)
  assert.match(task.contextId, /^[\da-f-]{36}$/)
  assert.ok(Number.isFinite(Date.parse(task.status.timestamp)))
  assert.deepEqual(task.metadata.transitions.map((entry: { state: string }) => entry.state), ['submitted', 'working', task.status.state])
  assert.equal(task.history, undefined)
  return task
}
async function mcp(name: string, args = {}) {
  const target = new URL('/mcp', process.env.READER_TEST_URL ?? 'http://localhost')
  const response = await request('/mcp', {
    method: 'POST', headers: { host: target.host, 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  })
  assert.equal(response.status, 200)
  const raw = await response.text()
  const body = JSON.parse(response.headers.get('content-type')?.includes('text/event-stream')
    ? raw.split('\n').find((line) => line.startsWith('data: '))!.slice(6)
    : raw)
  assert.equal(body.error, undefined)
  assert.notEqual(body.result.isError, true, body.result.content?.[0]?.text)
  return JSON.parse(body.result.content[0].text)
}
function artifact(task: Awaited<ReturnType<typeof task>>) {
  assert.equal(task.status.state, 'completed', JSON.stringify(task.status))
  assert.equal(task.artifacts.length, 1)
  assert.match(task.artifacts[0].artifactId, /^[\da-f-]{36}$/)
  assert.equal(task.artifacts[0].parts.length, 1)
  assert.equal(task.artifacts[0].parts[0].kind, 'data')
  return task.artifacts[0].parts[0].data
}

test('A2A card survives well-known discovery and declares only real public capabilities', async () => {
  const response = await request('/.well-known/agent-card.json')
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /application\/json/)
  const card = await response.json()
  assert.equal(card.protocolVersion, '0.3.0')
  assert.equal(card.name, 'Resurrected Reader')
  assert.ok(card.version && card.description)
  assert.equal(card.preferredTransport, 'JSONRPC')
  assert.equal(new URL(card.url).pathname, '/a2a/tasks')
  assert.equal(new URL(card.url).origin, new URL(process.env.READER_TEST_URL ?? 'http://localhost').origin)
  assert.deepEqual(card.security, [])
  assert.equal(card.authentication, undefined)
  assert.equal(card.securitySchemes, undefined)
  assert.deepEqual(card.capabilities, { streaming: false, pushNotifications: false, stateTransitionHistory: false })
  assert.deepEqual(card.defaultInputModes, ['application/json'])
  assert.deepEqual(card.defaultOutputModes, ['application/json'])
  assert.deepEqual(card.skills.map((skill: { id: string }) => skill.id), ['get_top_items', 'get_briefing', 'export_kiro_task'])
  assert.ok(card.skills.every((skill: { name: string; description: string; tags: string[] }) => skill.name && skill.description && skill.tags.length))
  const proxied = await request('/.well-known/agent-card.json', { headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'untrusted.example' } })
  const proxiedCard = await proxied.json()
  assert.equal(new URL(proxiedCard.url).protocol, 'https:')
  assert.equal(new URL(proxiedCard.url).hostname, new URL(card.url).hostname)
})

test('A2A rejects malformed requests honestly, without SPA fallbacks or task creation', async () => {
  for (const [body, code] of [
    [{ skill: 'get_briefing' }, -32600], [[], -32600], [null, -32600],
    [{ jsonrpc: '2.0', method: 'message/send', params: message({ skill: 'get_briefing' }) }, -32600],
    [rpc({}, 'message/stream'), -32601], [rpc({}, 'tasks/get'), -32601],
    [rpc({}), -32602], [rpc(message({ skill: 'unknown' })), -32602],
    [rpc(message({ skill: 'get_top_items', limit: 51 })), -32602],
    [rpc(message({ skill: 'get_top_items', limit: 0 })), -32602],
    [rpc(message({ skill: 'get_top_items', minScore: 101 })), -32602],
    [rpc(message({ skill: 'export_kiro_task', id: ' ' })), -32602],
    [rpc(message({ skill: 'get_briefing', provider: 'gemini' })), -32602],
    [rpc({ ...message({ skill: 'get_briefing' }), configuration: { pushNotificationConfig: { url: 'https://example.com' } } }), -32602],
    [rpc({ ...message({ skill: 'get_briefing' }), configuration: { acceptedOutputModes: ['text/plain'] } }), -32602],
    [rpc({ message: { ...message({ skill: 'get_briefing' }).message, taskId: 'old-task' } }), -32602],
    [rpc({ message: { ...message({ skill: 'get_briefing' }).message, contextId: 'old-context' } }), -32602],
    [rpc({ message: { kind: 'message', role: 'user', messageId: 'text', parts: [{ kind: 'text', text: 'get_briefing' }] } }), -32602],
  ] as const) {
    const response = await post(body)
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.jsonrpc, '2.0')
    assert.equal(result.error.code, code, JSON.stringify(body))
    assert.equal(result.result, undefined)
  }
  const malformed = await request('/a2a/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })
  assert.equal((await malformed.json()).error.code, -32700)
  const wrongType = await request('/a2a/tasks', { method: 'POST', body: '{}' })
  assert.equal(wrongType.status, 415)
  assert.equal((await wrongType.json()).error.code, -32600)
  const oversized = await post({ padding: 'x'.repeat(192 * 1024) })
  assert.equal(oversized.status, 413)
  assert.equal((await oversized.json()).error.code, -32600)
  for (const [path, method] of [['/a2a/unknown', 'POST'], ['/a2a/tasks', 'GET'], ['/a2a', 'POST']]) {
    const missing = await request(path, { method })
    assert.equal(missing.status, 404)
    assert.match(missing.headers.get('content-type') ?? '', /application\/json/)
  }
})

test('live A2A skills equal MCP and UI functions for the same default-feed items', async () => {
  const topTask = await task({ skill: 'get_top_items', limit: 50 })
  const top = artifact(topTask) as { items: FeedItem[]; errors: unknown[] }
  assert.ok(top.items.length > 0)
  assert.ok(top.items.every((item) => !item.sample && /^https?:/.test(item.link)))
  assert.deepEqual(top, await mcp('search_items', { limit: 50 }))
  const briefingTask = await task({ skill: 'get_briefing' })
  assert.notEqual(briefingTask.id, topTask.id)
  assert.notEqual(briefingTask.contextId, topTask.contextId)
  const briefing = artifact(briefingTask)
  assert.deepEqual(briefing, await mcp('daily_briefing'))
  // In-process: full exact cache; built Worker: compare selector over that same
  // Worker's ranked top-50 pool (more than enough for the top-five default feeds).
  const loaded = process.env.READER_TEST_URL ? top : await loadItems()
  // Compare wire JSON: optional undefined imageUrl fields are omitted in JSON.
  assert.deepEqual(briefing, JSON.parse(JSON.stringify({ items: selectDailyBriefingItems(loaded.items), errors: loaded.errors })))
  const filtered = artifact(await task({ skill: 'get_top_items', limit: 2, minScore: 70 }))
  assert.deepEqual(filtered, await mcp('search_items', { limit: 2, minScore: 70 }))
  const item = top.items[0]
  const bundle = artifact(await task({ skill: 'export_kiro_task', id: item.id }))
  assert.deepEqual(bundle, await mcp('export_kiro_task', { id: item.id }))
  assert.deepEqual(bundle, buildKiroSpecBundle(item))
  const failed = await task({ skill: 'export_kiro_task', id: 'missing-item-not-a-real-feed-id' })
  assert.equal(failed.status.state, 'failed')
  assert.equal(failed.artifacts, undefined)
  assert.equal(failed.status.message.kind, 'message')
  assert.equal(failed.status.message.role, 'agent')
  assert.equal(failed.status.message.taskId, failed.id)
  assert.equal(failed.status.message.contextId, failed.contextId)
  assert.match(failed.status.message.parts[0].text, /Item not found/)
})
