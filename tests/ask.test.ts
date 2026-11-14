import assert from 'node:assert/strict'
import test from 'node:test'
import { cosineSimilarity } from 'ai'
import app from '../server.ts'
import { loadItems } from '../server/items.ts'
import { answerWithFallback, NoProvidersConfiguredError, semanticScoreWithFallback } from '../server/ai.ts'
import { askResponse, askRequestSchema, askStreamResponse, AskFeedsError, AskUnavailableError, runAsk } from '../server/ask.ts'
import { buildAskSources, selectAskSources, selectTodayItems, validateAskAnswer } from '../server/askPolicy.ts'
import { ASK_ABSTENTION, ASK_SCOPE, MIN_ASK_SIMILARITY, readAskResponse, type AskResult } from '../src/lib/ask.ts'
import type { FeedItem } from '../src/lib/feeds.ts'

// Explicit test articles/embeddings, not claims of live feeds or provider output.
// Synthetic embedding vectors are confined to this owner-authorized test file.
const now = new Date('2026-11-13T12:00:00.000Z')
const fixture = (id: string, changes: Partial<FeedItem> = {}): FeedItem => ({
  id, feedId: 'test-fixture', feedTitle: 'TEST FIXTURE', title: `TEST FIXTURE ${id}`,
  link: `https://example.com/test/${id}`, pubDate: '2026-11-13T10:00:00.000Z',
  description: 'Explicit retrieval test fixture; not a real article.', score: 80, ...changes,
})
const input = askRequestSchema.parse({ question: 'test question' })
const signal = () => new AbortController().signal
const noGenerate: typeof answerWithFallback = async () => { throw new Error('Generation must not run') }
const stubScores = (scores: Record<string, number>): typeof semanticScoreWithFallback => async () => ({ available: true, provider: 'gemini', scores })

test('Ask UTC date window includes midnight and frozen now, excludes invalid/future/previous dates and samples', () => {
  const midnight = fixture('midnight', { pubDate: '2026-11-13T00:00:00Z' })
  const end = fixture('end', { pubDate: now.toISOString() })
  const items = [midnight, end,
    fixture('old', { pubDate: '2026-11-12T23:59:59.999Z' }),
    fixture('future', { pubDate: '2026-11-13T12:00:00.001Z' }),
    fixture('invalid', { pubDate: 'invalid' }), fixture('sample', { sample: true }),
    fixture('unsafe', { link: 'javascript:alert(1)' }), fixture('credentials', { link: 'https://user:password@example.com' }),
    fixture('unscored', { score: undefined }), fixture('nan', { score: NaN }),
  ]
  assert.deepEqual(selectTodayItems(items, now).map((item) => item.id), ['end', 'midnight'])
  assert.deepEqual(selectTodayItems(items, new Date('2026-11-14T00:00:00Z')), [])
  assert.throws(() => selectTodayItems(items, new Date('invalid')), /clock/)
  const many = Array.from({ length: 65 }, (_, index) => fixture(String(index), { score: index }))
  const selected = selectTodayItems([...many, many[64]], now)
  assert.equal(selected.length, 60)
  assert.equal(selected[0].id, '64')
  assert.equal(selected.at(-1)?.id, '5')
})

test('Ask cosine guard does not keyword-bypass the threshold, limits/dedupes, and rejects missing/non-finite scores', () => {
  const items = [fixture('related'), fixture('unrelated', { title: input.question }), fixture('edge')]
  const scores = {
    related: cosineSimilarity([1, 0], [1, 0]),
    unrelated: cosineSimilarity([1, 0], [0, 1]),
    edge: MIN_ASK_SIMILARITY,
  }
  assert.deepEqual(selectAskSources(items, scores).map((item) => item.id), ['related', 'edge'])
  assert.equal(selectAskSources(items, { related: 0.2799, unrelated: 0, edge: -1 }).length, 0)
  for (const invalid of [{}, { related: NaN }, { related: Infinity }, { related: 1.1 }, { related: -1.1 }]) {
    assert.throws(() => selectAskSources([items[0]], invalid), /every candidate/)
  }
  const duplicates = Array.from({ length: 8 }, (_, index) => fixture(String(index), { link: index === 1 ? 'https://example.com/test/0' : `https://example.com/test/${index}` }))
  const top = selectAskSources(duplicates, Object.fromEntries(duplicates.map((item) => [item.id, 0.9])))
  assert.equal(top.length, 5)
  assert.equal(new Set(top.map((item) => item.link)).size, 5)
})

test('Ask validates each citation and rejects model links, markup, malformed/missing references', () => {
  const sources = buildAskSources([fixture('one')])
  const json = (text: string, citations: number[] = [1]) => JSON.stringify({ statements: [{ text, citations }] })
  assert.deepEqual(validateAskAnswer(json('A plain cited statement.', [1, 1]), sources), [{ text: 'A plain cited statement.', citations: [1] }])
  for (const raw of [
    '{', '{}', '```json\n{}\n```', JSON.stringify({ statements: [] }),
    json('Statement.', []), json('Statement.', [2]), json('Statement.', [0]),
    json('See https://invented.example/path'), json('Visit invented.example'), json('www.example.com'),
    json('[link](https://example.com)'), json('<a href="https://example.com">click</a>'),
    json('javascript:alert(1)'), json('data:text/html,unsafe'), json('See /invented/path'),
    json('Inline reference [1]'), json('unsafe\ncontrol'),
    JSON.stringify({ statements: [{ text: 'Statement.', citations: [1], link: 'https://invented.example' }] }),
    json('x'.repeat(801)), 'x'.repeat(16_001),
  ]) assert.throws(() => validateAskAnswer(raw, sources), raw.slice(0, 100))
})

test('Ask pipeline abstains only after empty eligible corpus or successful low retrieval; never generates in either case', async () => {
  const empty = await runAsk(input, now, signal(), {
    load: async () => ({ items: [fixture('old', { pubDate: '2026-11-12T12:00:00Z' })], errors: [] }),
    score: async () => { throw new Error('Embedding must not run') }, answer: noGenerate,
  })
  assert.deepEqual(empty.answer, { kind: 'abstention', text: ASK_ABSTENTION })
  assert.equal(empty.completion.retrievalProvider, null)
  let called = false
  const low = await runAsk(input, now, signal(), {
    load: async () => ({ items: [fixture('one')], errors: [{ feedId: 'unavailable-fixture', error: 'Do not expose upstream detail' }] }),
    score: async (params) => {
      called = true
      assert.equal(params.query, input.question)
      assert.deepEqual(params.documents.map((doc) => doc.id), ['one'])
      assert.ok(params.abortSignal)
      return stubScores({ one: 0.1 })(params)
    }, answer: noGenerate,
  })
  assert.equal(called, true)
  assert.deepEqual(low.answer, empty.answer)
  assert.equal(low.completion.retrievalProvider, 'gemini')
  assert.equal(low.context.scope, ASK_SCOPE)
  assert.equal(low.context.asOf, now.toISOString())
  assert.doesNotMatch(JSON.stringify(low.context.warnings), /Do not expose/)
})

test('Ask unavailable/partial vectors and feed outages do not become false abstentions', async () => {
  const load = async () => ({ items: [fixture('one')], errors: [] })
  for (const score of [
    async () => ({ available: false, provider: null, scores: {} }) as const,
    stubScores({}), stubScores({ one: NaN }),
    async () => { throw new Error('Embedding transport failed') },
  ]) await assert.rejects(runAsk(input, now, signal(), { load, score, answer: noGenerate }), AskUnavailableError)
  await assert.rejects(runAsk(input, now, signal(), {
    load: async () => { throw new Error('Feed failed') }, score: stubScores({}), answer: noGenerate,
  }), AskFeedsError)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(runAsk(input, now, controller.signal), { name: 'AbortError' })
})

const providerKeys = ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'AWS_BEARER_TOKEN_BEDROCK', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']
test('Ask shared helpers honestly reject missing providers; high stub retrieval cannot fabricate an answer', async (t) => {
  const saved = providerKeys.map((key) => process.env[key])
  providerKeys.forEach((key) => { delete process.env[key] })
  t.after(() => providerKeys.forEach((key, index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index] }))
  await assert.rejects(answerWithFallback({ question: input.question, items: [fixture('one')], preferredProvider: 'gemini', abortSignal: signal() }), NoProvidersConfiguredError)
  const unavailable = await semanticScoreWithFallback({ query: input.question, documents: [{ id: 'one', text: 'TEST FIXTURE' }], preferredProvider: 'gemini' })
  assert.deepEqual(unavailable, { available: false, provider: null, scores: {} })
  await assert.rejects(runAsk(input, now, signal(), {
    load: async () => ({ items: [fixture('one')], errors: [] }), score: stubScores({ one: 0.9 }), answer: answerWithFallback,
  }), NoProvidersConfiguredError)
  const aborted = new AbortController()
  aborted.abort()
  await assert.rejects(answerWithFallback({ question: 'test', items: [], preferredProvider: 'gemini', abortSignal: aborted.signal }), { name: 'AbortError' })
  await assert.rejects(semanticScoreWithFallback({ query: 'test', documents: [], preferredProvider: 'gemini', abortSignal: aborted.signal }), { name: 'AbortError' })
})

function wireFixture(): AskResult {
  // Protocol fixture only: does not claim a real model generated this answer.
  return {
    context: { type: 'sources', scope: ASK_SCOPE, asOf: now.toISOString(), sources: buildAskSources([fixture('one')]), warnings: [] },
    answer: { kind: 'answer', statements: [{ text: 'Explicit cited protocol fixture.', citations: [1] }] },
    completion: { type: 'done', provider: 'gemini', retrievalProvider: 'gemini' },
  }
}
test('Ask framed HTTP reader accepts chunk boundaries/Unicode and fails closed on truncation/order/citations/URLs', async () => {
  const valid = wireFixture()
  const response = askStreamResponse(valid)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const raw = await response.text()
  const make = (text: string, chunkSize = 7) => {
    const bytes = new TextEncoder().encode(text)
    return new Response(new ReadableStream({ start(controller) {
      for (let index = 0; index < bytes.length; index += chunkSize) controller.enqueue(bytes.slice(index, index + chunkSize))
      controller.close()
    } }), { headers: { 'content-type': 'application/x-ndjson' } })
  }
  const events: string[] = []
  assert.deepEqual(await readAskResponse(make(raw), (event) => events.push(event.type)), valid)
  assert.deepEqual(events, ['sources', 'answer', 'done'])
  assert.deepEqual(await readAskResponse(make(raw.replace('protocol fixture', 'Unicode café fixture'), 1)), {
    ...valid, answer: { kind: 'answer', statements: [{ text: 'Explicit cited Unicode café fixture.', citations: [1] }] },
  })
  for (const broken of [
    raw.split('\n').slice(0, 2).join('\n') + '\n', raw.trimEnd(), raw + raw,
    raw.replace('"citations":[1]', '"citations":[2]'), raw.replace('https://example.com/test/one', 'javascript:alert(1)'),
    raw.split('\n').reverse().join('\n'), 'x'.repeat(128 * 1024 + 1),
  ]) await assert.rejects(readAskResponse(make(broken)))
  await assert.rejects(readAskResponse(new Response('html')), /Invalid Ask response/)
  await assert.rejects(readAskResponse(new Response('untrusted upstream content', { status: 503 })), /unavailable/)
  await assert.rejects(readAskResponse(new Response('', { status: 408 })), /timed out/)
})

test('Ask API rejects invalid bodies before retrieval, and cancellation is explicit', async () => {
  const request = (body: unknown) => process.env.READER_TEST_URL
    ? fetch(new URL('/api/ask', process.env.READER_TEST_URL), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    : app.request('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  for (const invalid of [{}, { question: ' ' }, { question: 'x'.repeat(501) }, { question: 'test', provider: 'unknown' }, { question: 'test', items: [] }, []]) {
    const response = await request(invalid)
    assert.equal(response.status, 400)
    assert.match((await response.json()).error, /question/)
  }
  const oversized = await request({ question: 'x'.repeat(192 * 1024) })
  assert.equal(oversized.status, 413)
  const aborted = new AbortController()
  aborted.abort()
  assert.equal((await askResponse({ question: 'test' }, aborted.signal)).status, 408)
})

test('Ask live API without credentials reports unavailable or a genuinely empty UTC corpus, never invented answers', async () => {
  const request = (path: string, init?: RequestInit) => process.env.READER_TEST_URL
    ? fetch(new URL(path, process.env.READER_TEST_URL), init) : app.request(path, init)
  const status = await (await request('/api/providers')).json()
  assert.ok(status.providers.every((provider: { available: boolean }) => !provider.available), 'Live Ask smoke must run without provider credentials to avoid charges.')
  const before = new Date()
  const loaded = await loadItems()
  const response = await request('/api/ask', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'What changed in cloud engineering today?' }),
  })
  const after = new Date()
  if (selectTodayItems(loaded.items, before).length || selectTodayItems(loaded.items, after).length) {
    assert.equal(response.status, 503)
    assert.match((await response.json()).error, /unavailable/)
  } else {
    assert.equal(response.status, 200)
    const result = await readAskResponse(response)
    assert.deepEqual(result.answer, { kind: 'abstention', text: ASK_ABSTENTION })
    assert.deepEqual(result.context.sources, [])
    assert.equal(result.completion.provider, null)
  }
})
