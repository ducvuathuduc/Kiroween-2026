import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDate, parseRss2Json } from '../src/lib/feeds'

test('normalizeDate interprets rss2json space-separated timestamps as UTC', () => {
  assert.equal(normalizeDate('2026-11-11 19:00:44'), '2026-11-11T19:00:44.000Z')
  assert.equal(
    normalizeDate('Fri, 13 Nov 2026 11:34:25 +0000'),
    '2026-11-13T11:34:25.000Z',
  )
})

test('parseRss2Json parses items and sanitizes unsafe links', () => {
  const source = {
    id: 'aws-news',
    title: 'AWS News Blog',
    url: 'https://aws.amazon.com/blogs/aws/feed/',
  }

  const items = parseRss2Json(
    {
      status: 'ok',
      items: [
        {
          title: 'Deploy AI agents on AWS',
          pubDate: '2026-11-12 10:00:00',
          link: 'https://aws.amazon.com/blogs/aws/deploy-ai-agents/',
          description: 'Walkthrough of agentic builds.',
          content: '<p>Walkthrough of <strong>agentic</strong> builds.</p>',
        },
        {
          title: 'Bad link item',
          pubDate: '2026-11-12 09:00:00',
          link: 'javascript:alert(1)',
          description: 'Should drop javascript: URL.',
        },
      ],
    },
    source,
  )

  assert.equal(items.length, 2)
  assert.equal(items[0].feedId, 'aws-news')
  assert.equal(items[0].pubDate, '2026-11-12T10:00:00.000Z')
  assert.equal(
    items[0].link,
    'https://aws.amazon.com/blogs/aws/deploy-ai-agents/',
  )
  assert.equal(items[0].description, 'Walkthrough of agentic builds.')
  assert.equal(items[1].link, '')
})

test('parseRss2Json throws when status is not ok', () => {
  assert.throws(() =>
    parseRss2Json(
      { status: 'error', message: 'Feed could not be parsed' },
      { id: 'x', title: 'X', url: 'https://example.com/feed' },
    ),
  )
})
