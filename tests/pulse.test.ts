import test from 'node:test'
import assert from 'node:assert/strict'
import { mapGithubRepo, mapHnStory } from '../src/lib/pulse'

test('mapHnStory maps Firebase story into scored PulseItem', () => {
  const nowSec = Math.floor(Date.now() / 1000) - 3600
  const item = mapHnStory({
    id: 12345,
    type: 'story',
    title: 'Kiro agents on AWS',
    url: 'https://example.com/kiro-aws',
    by: 'builder',
    score: 142,
    descendants: 37,
    time: nowSec,
  })
  assert.ok(item)
  assert.equal(item.id, 'pulse-hn-12345')
  assert.equal(item.pulseChannel, 'hn')
  assert.equal(item.metricLabel, '142 pts · 37 cmt')
  assert.ok((item.score ?? 0) >= 70)
})

test('mapHnStory ignores non-story entries', () => {
  assert.equal(mapHnStory({ id: 1, type: 'job', title: 'Hiring' }), null)
})

test('mapGithubRepo maps GitHub AWS repository into scored PulseItem', () => {
  const repo = mapGithubRepo({
    id: 99,
    full_name: 'acme/aws-agent-kit',
    html_url: 'https://github.com/acme/aws-agent-kit',
    description: 'Agentic AWS deployment toolkit with security guardrails',
    stargazers_count: 1576,
    language: 'TypeScript',
    created_at: new Date().toISOString(),
    topics: ['aws', 'agent'],
  })
  assert.equal(repo.id, 'pulse-gh-99')
  assert.equal(repo.pulseChannel, 'github')
  assert.match(repo.metricLabel, /1,576/)
  assert.ok((repo.score ?? 0) >= 60)
})
