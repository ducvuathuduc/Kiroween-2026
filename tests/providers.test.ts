import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_PROVIDER_STATUSES,
  PROVIDER_ORDER,
  rankItemsByCosine,
  resolveEmbeddingOrder,
  resolveSummarizeOrder,
  sanitizeProviderId,
} from '../src/lib/providers.ts'
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/lib/storage.ts'

test('sanitizeProviderId defaults unknown inputs safely to gemini', () => {
  assert.equal(sanitizeProviderId('gemini'), 'gemini')
  assert.equal(sanitizeProviderId('openai'), 'openai')
  assert.equal(sanitizeProviderId('anthropic'), 'anthropic')
  assert.equal(sanitizeProviderId('bedrock'), 'bedrock')
  assert.equal(sanitizeProviderId('langchain'), 'gemini')
  assert.equal(sanitizeProviderId(null), 'gemini')
})

test('resolveSummarizeOrder follows Gemini -> OpenAI -> Anthropic -> Bedrock and skips unconfigured keys silently', () => {
  assert.deepEqual(
    resolveSummarizeOrder('gemini', {
      gemini: true,
      openai: true,
      anthropic: true,
      bedrock: true,
    }),
    ['gemini', 'openai', 'anthropic', 'bedrock'],
  )

  assert.deepEqual(
    resolveSummarizeOrder('anthropic', {
      gemini: true,
      openai: false,
      anthropic: true,
      bedrock: true,
    }),
    ['anthropic', 'gemini', 'bedrock'],
  )

  assert.deepEqual(
    resolveSummarizeOrder('openai', {
      gemini: false,
      openai: false,
      anthropic: false,
      bedrock: false,
    }),
    [],
  )
})

test('resolveEmbeddingOrder filters out non-embedding providers cleanly', () => {
  assert.deepEqual(
    resolveEmbeddingOrder('anthropic', {
      gemini: true,
      openai: true,
      anthropic: true,
      bedrock: true,
    }),
    ['gemini', 'openai', 'bedrock'],
  )

  assert.deepEqual(
    resolveEmbeddingOrder('bedrock', {
      gemini: true,
      openai: false,
      anthropic: true,
      bedrock: true,
    }),
    ['bedrock', 'gemini'],
  )
})

test('rankItemsByCosine sorts items by similarity descending while retaining keyword hits', () => {
  const sample = [
    { id: 'a', title: 'S3 Tables update' },
    { id: 'b', title: 'Serverless Lambda cold start improvements' },
    { id: 'c', title: 'Unrelated news' },
  ]
  const scores = {
    a: 0.42,
    b: 0.89,
    c: 0.09,
  }
  const ranked = rankItemsByCosine(
    sample,
    scores,
    (it) => it.title.toLowerCase().includes('lambda'),
  )
  assert.deepEqual(
    ranked.map((r) => r.id),
    ['b', 'a'],
  )
})

test('sanitizeSettings preserves valid aiProvider and defaults safely', () => {
  assert.equal(DEFAULT_SETTINGS.aiProvider, 'gemini')
  assert.equal(
    sanitizeSettings({ aiProvider: 'bedrock', density: 'compact' }).aiProvider,
    'bedrock',
  )
  assert.equal(sanitizeSettings({ aiProvider: 'invalid' }).aiProvider, 'gemini')
  assert.equal(DEFAULT_PROVIDER_STATUSES.length, PROVIDER_ORDER.length)
})
