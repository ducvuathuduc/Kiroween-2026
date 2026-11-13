import test from 'node:test'
import assert from 'node:assert/strict'
import {
  feedMonogram,
  formatRefreshTime,
  safeHttpUrl,
  scoreBadgeClass,
  summarize,
  timeAgo,
} from '../src/lib/format'

test('scoreBadgeClass maps thresholds cleanly', () => {
  assert.match(scoreBadgeClass(70), /emerald/)
  assert.match(scoreBadgeClass(40), /amber/)
  assert.match(scoreBadgeClass(10), /zinc/)
})

test('feedMonogram generates concise two-letter initials', () => {
  assert.equal(feedMonogram('AWS News Blog'), 'AN')
  assert.equal(feedMonogram('Hacker News'), 'HN')
  assert.equal(feedMonogram('Changelog'), 'CH')
})

test('safeHttpUrl allows http/https and rejects unsafe protocols', () => {
  assert.equal(safeHttpUrl('https://aws.amazon.com/blogs/aws/'), 'https://aws.amazon.com/blogs/aws/')
  assert.equal(safeHttpUrl('http://example.com/feed.xml'), 'http://example.com/feed.xml')
  assert.equal(safeHttpUrl('javascript:alert(1)'), null)
  assert.equal(safeHttpUrl('data:text/html,<script>alert(1)</script>'), null)
  assert.equal(safeHttpUrl('not a url'), null)
})

test('timeAgo and formatRefreshTime handle valid and invalid ISO dates', () => {
  const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString()
  assert.match(timeAgo(threeHoursAgo), /3 hours ago/)
  assert.equal(timeAgo('bad-date'), 'Unknown date')
  assert.match(formatRefreshTime(threeHoursAgo), /^\d{2}:\d{2}:\d{2}$/)
  assert.equal(formatRefreshTime('bad-date'), '')
})

test('summarize returns up to N sentences or fallback message', () => {
  assert.equal(summarize(''), 'No summary available for this item.')
  assert.equal(
    summarize('First sentence. Second sentence. Third sentence. Fourth sentence.', 2),
    'First sentence. Second sentence.',
  )
})
