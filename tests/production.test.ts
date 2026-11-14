import test from 'node:test'
import assert from 'node:assert/strict'
import { searchCommandTargets } from '../src/lib/briefing'
import { buildFullDataExport, formatItemAsMarkdown } from '../src/lib/export'
import type { FeedItem, FeedSource } from '../src/lib/feeds'
import { normalizePathname, parseRoutePath, routeToPath } from '../src/lib/routes'
import { KEYBOARD_SHORTCUTS } from '../src/lib/shortcuts'
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/lib/storage'

const sampleFeed: FeedSource = {
  id: 'aws-news',
  title: 'AWS News Blog',
  url: 'https://aws.amazon.com/blogs/aws/feed/',
}

const sampleItem: FeedItem = {
  id: 'it-1',
  feedId: 'aws-news',
  feedTitle: 'AWS News Blog',
  title: 'Agentic workflows with Amazon Bedrock',
  link: 'https://aws.amazon.com/blogs/aws/bedrock-agents/',
  pubDate: '2026-11-13T10:00:00.000Z',
  description: 'Build multi-step agentic workflows using Amazon Bedrock and MCP.',
  score: 92,
}

test('parseRoutePath and routeToPath handle real routes, trailing slashes, and 404s', () => {
  assert.equal(normalizePathname('/Docs/'), '/docs')
  assert.equal(parseRoutePath('/'), 'feed')
  assert.equal(parseRoutePath('/docs'), 'docs')
  assert.equal(parseRoutePath('/privacy/'), 'privacy')
  assert.equal(parseRoutePath('/shortcuts'), 'shortcuts')
  assert.equal(parseRoutePath('/about'), 'about')
  assert.equal(parseRoutePath('/changelog'), 'changelog')
  assert.equal(parseRoutePath('/settings'), 'settings')
  assert.equal(parseRoutePath('/unknown-route-xyz'), 'not-found')
  assert.equal(routeToPath('privacy'), '/privacy')
  assert.equal(routeToPath('feed'), '/')
})

test('sanitizeSettings falls back safely on malformed input and preserves valid preferences', () => {
  assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS)
  assert.deepEqual(
    sanitizeSettings({
      density: 'compact',
      defaultFilter: 'high',
      reducedMotion: 'reduce',
    }),
    {
      density: 'compact',
      defaultFilter: 'high',
      reducedMotion: 'reduce',
      aiProvider: 'gemini',
      personalBoostEnabled: true,
    },
  )
  assert.deepEqual(
    sanitizeSettings({ density: 'huge', defaultFilter: 'bogus', reducedMotion: 42 }),
    DEFAULT_SETTINGS,
  )
})

test('formatItemAsMarkdown renders valid Markdown with score and optional Gemini TL;DR', () => {
  const md = formatItemAsMarkdown(sampleItem, {
    tldr: 'Concise AI summary.',
    takeaways: ['Takeaway one', 'Takeaway two'],
    whyMatters: 'Accelerates Kiro agent specs.',
  })
  assert.match(md, /^# Agentic workflows with Amazon Bedrock/m)
  assert.match(md, /\*\*Signal score:\*\* 92\/100/)
  assert.match(md, /## Gemini TL;DR/)
  assert.match(md, /- Takeaway one/)
  assert.match(md, /\*\*Why it matters:\*\* Accelerates Kiro agent specs\./)
})

test('buildFullDataExport outputs complete schema v1 JSON payload', () => {
  const payload = buildFullDataExport({
    feeds: [sampleFeed],
    readIds: ['it-1'],
    savedIds: ['it-1'],
    summaries: {},
    settings: DEFAULT_SETTINGS,
    lastVisitIso: '2026-11-13T00:00:00.000Z',
    exportedAt: '2026-11-13T12:00:00.000Z',
  })
  assert.equal(payload.app, 'Resurrected Reader')
  assert.equal(payload.schemaVersion, 1)
  assert.equal(payload.feeds.length, 1)
  assert.deepEqual(payload.savedIds, ['it-1'])
})

test('KEYBOARD_SHORTCUTS lists all required interactive bindings', () => {
  const allKeys = KEYBOARD_SHORTCUTS.flatMap((s) => s.keys)
  for (const required of ['j', 'k', 'Enter', '/', '⌘K', 'o', 's', 'e', 'b', 'r', '?']) {
    assert.ok(allKeys.includes(required), `Missing key ${required}`)
  }
})

test('Command Palette search finds new production pages', () => {
  for (const query of ['privacy', 'docs', 'settings', 'changelog', 'shortcuts', 'about']) {
    const matches = searchCommandTargets({ feeds: [sampleFeed], items: [sampleItem], query })
    assert.ok(matches.length > 0, `Expected command target for ${query}`)
    assert.equal(matches[0]?.kind, 'view')
  }
})
