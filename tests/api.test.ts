import assert from 'node:assert/strict'
import test from 'node:test'
import app from '../server.ts'
import { loadItems } from '../server/items.ts'

function request(path: string, init?: RequestInit): Promise<Response> {
  return process.env.READER_TEST_URL
    ? fetch(new URL(path, process.env.READER_TEST_URL), init)
    : app.request(path, init)
}

function post(path: string, body: unknown) {
  return request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const privateUrls = [
  'http://localhost/', 'http://localhost./', 'http://reader.localhost/',
  'http://reader.local./', 'http://reader.internal/', 'http://metadata/',
  'http://127.0.0.1/', 'http://2130706433/', 'http://0x7f000001/',
  'http://0.0.0.0/', 'http://10.0.0.1/', 'http://192.168.1.1/',
  'http://172.16.0.1/', 'http://172.31.255.255/', 'http://169.254.169.254/',
  'http://100.64.0.1/', 'http://100.127.255.255/', 'http://198.18.0.1/',
  'http://192.0.2.1/', 'http://198.51.100.1/', 'http://203.0.113.1/',
  'http://224.0.0.1/', 'http://255.255.255.255/',
  'http://[::1]:9/', 'http://[::ffff:127.0.0.1]:9/', 'http://[fd00::1]:9/',
  'https://user:password@aws.amazon.com/blogs/aws/feed/',
]

test('Hono preserves the existing API contracts', async (t) => {
  const keys = ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'AWS_BEARER_TOKEN_BEDROCK', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']
  const saved = keys.map((key) => process.env[key])
  keys.forEach((key) => { delete process.env[key] })
  t.after(() => keys.forEach((key, index) => {
    if (saved[index] === undefined) delete process.env[key]
    else process.env[key] = saved[index]
  }))

  const runtime = await (await request('/api/providers')).json()
  assert.ok(runtime.providers.every((entry: { available: boolean }) => !entry.available), 'Run smoke tests without runtime AI credentials to avoid charges.')

  await t.test('health and providers', async () => {
    const health = await request('/api/health')
    assert.equal(health.status, 200)
    const status = await health.json()
    assert.equal(status.ok, true)
    assert.equal(status.geminiConfigured, false)
    const providers = await request('/api/providers')
    assert.equal(providers.status, 200)
    const catalog = await providers.json()
    assert.equal(catalog.defaultProvider, 'gemini')
    assert.deepEqual(catalog.providers, status.providers)
    assert.ok(catalog.providers.every((provider: { available: boolean }) => !provider.available))
  })

  await t.test('RSS rejects missing, non-HTTP, and private addresses', async () => {
    for (const url of ['', 'file:///etc/passwd', ...privateUrls]) {
      const response = await request(`/api/rss?url=${encodeURIComponent(url)}`)
      assert.equal(response.status, 400, url)
      assert.deepEqual(await response.json(), { error: 'A valid public http(s) feed URL is required.' })
    }
    const duplicate = await request('/api/rss?url=https://aws.amazon.com/blogs/aws/feed/&url=https://hnrss.org/frontpage')
    assert.equal(duplicate.status, 400)
  })

  await t.test('RSS returns real XML and serves the cached response', async () => {
    const url = '/api/rss?url=' + encodeURIComponent('https://aws.amazon.com/blogs/aws/feed/')
    const first = await request(url)
    assert.equal(first.status, 200)
    assert.match(first.headers.get('content-type') ?? '', /application\/xml/)
    const xml = await first.text()
    assert.match(xml, /<rss\b/)
    assert.match(xml, /<item\b/)
    const second = await request(url)
    assert.equal(second.status, 200)
    assert.equal(await second.text(), xml)
    const redirected = await request('/api/rss?url=' + encodeURIComponent('http://aws.amazon.com/blogs/aws/feed/'))
    assert.equal(redirected.status, 200)
    assert.match(await redirected.text(), /<rss\b/)
  })

  await t.test('summarize and embeddings retain validation and no-provider behavior', async () => {
    const invalid = await post('/api/summarize', {})
    assert.equal(invalid.status, 400)
    assert.deepEqual(await invalid.json(), { error: 'Article title and content are required.' })
    const { items } = await loadItems()
    const item = items[0]
    const unavailable = await post('/api/summarize', { ...item, content: item.description })
    assert.equal(unavailable.status, 503)
    assert.match((await unavailable.json()).error, /No AI provider key is configured/)
    for (const body of [{}, { query: item.title, documents: [null, { id: item.id, text: item.description }] }]) {
      const embeddings = await post('/api/embed', body)
      assert.equal(embeddings.status, 200)
      assert.deepEqual(await embeddings.json(), { available: false, provider: null, scores: {} })
    }
  })

  await t.test('OpenGraph preserves empty results and private-address rejection', async () => {
    const empty = await post('/api/og-images', {})
    assert.equal(empty.status, 200)
    assert.deepEqual(await empty.json(), { images: {} })
    for (const url of privateUrls) {
      const blocked = await post('/api/og-images', { urls: [url, 42] })
      assert.equal(blocked.status, 200)
      assert.deepEqual(await blocked.json(), { images: { [url]: null } })
    }
  })

  await t.test('JSON parsing retains 400 and 413 boundaries', async () => {
    for (const body of ['{', 'null', '42']) {
      const response = await request('/api/embed', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body,
      })
      assert.equal(response.status, 400)
    }
    const oversized = await post('/api/embed', { query: 'x'.repeat(192 * 1024) })
    assert.equal(oversized.status, 413)
    const empty = await request('/api/embed', { method: 'POST', headers: { 'content-type': 'application/json' } })
    assert.equal(empty.status, 200)
    assert.deepEqual(await empty.json(), { available: false, provider: null, scores: {} })
  })
})
