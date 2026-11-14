import test from 'node:test'
import assert from 'node:assert/strict'
import { extractArticle } from '../server/extract.ts'
import app from '../server.ts'

test('extracts article markdown from fixture and rejects empty pages', async () => {
  const text = 'A detailed technical article explains how a cloud system works. '.repeat(30)
  const article = await extractArticle(`<html><head><title>Fixture article</title></head><body><article><h1>Fixture article</h1><p>${text}</p></article></body></html>`, 'https://aws.amazon.com/article')
  assert.equal(article?.title, 'Fixture article')
  assert.match(article?.markdown ?? '', /detailed technical article/)
  assert.equal(await extractArticle('<html><head></head><body></body></html>', 'https://aws.amazon.com/empty'), null)
})

test('Readability extracts a fresh document when Defuddle fails', async () => {
  const text = 'An engineering team explains a detailed technical system and its architecture. '.repeat(40)
  const html = `<html><head><title>Long fixture article</title></head><body><article><h1>Long fixture article</h1><p>${text}</p></article></body></html>`
  const result = await extractArticle(html, 'https://aws.amazon.com/article', async () => { throw new Error('fixture failure') })
  assert.match(result?.markdown ?? '', /engineering team/)
  assert.ok(result?.title)
})

test('article route restricts hosts and rechecks redirects', async () => {
  for (const url of ['https://example.com/', 'http://aws.amazon.com/', 'https://aws.amazon.com.evil.test/', 'http://127.0.0.1/']) {
    const result = await app.request(`/api/extract?url=${encodeURIComponent(url)}`)
    assert.equal(result.status, 400, url)
  }
  const original = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = async () => {
      calls++
      return new Response(null, { status: 302, headers: { location: 'https://example.com/' } })
    }
    const result = await app.request(`/api/extract?url=${encodeURIComponent('https://aws.amazon.com/article')}`)
    assert.equal(result.status, 502)
    assert.equal(calls, 1)
  } finally { globalThis.fetch = original }
})
