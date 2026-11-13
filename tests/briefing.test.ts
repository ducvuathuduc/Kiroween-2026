import test from 'node:test'
import assert from 'node:assert/strict'
import {
  countNewSince,
  fuzzyMatchScore,
  isNewSince,
  searchCommandTargets,
  selectDailyBriefingItems,
} from '../src/lib/briefing'
import type { FeedItem, FeedSource } from '../src/lib/feeds'
import { SIGNAL_DIMENSION_META } from '../src/lib/scoring'

function makeItem(overrides: Partial<FeedItem> & { id: string }): FeedItem {
  return {
    feedId: 'aws-news',
    feedTitle: 'AWS News Blog',
    title: 'Sample article',
    link: `https://example.com/${overrides.id}`,
    pubDate: '2026-11-13T10:00:00.000Z',
    description: 'AWS builder update.',
    score: 50,
    ...overrides,
  }
}

test('SIGNAL_DIMENSION_META weights sum cleanly to 100', () => {
  const totalWeight = SIGNAL_DIMENSION_META.reduce((acc, d) => acc + d.weight, 0)
  assert.equal(totalWeight, 100)
})

test('isNewSince and countNewSince mark items published strictly after last visit', () => {
  const lastVisit = '2026-11-13T09:00:00.000Z'
  const items = [
    makeItem({ id: '1', pubDate: '2026-11-13T10:00:00.000Z' }),
    makeItem({ id: '2', pubDate: '2026-11-13T09:00:00.000Z' }),
    makeItem({ id: '3', pubDate: '2026-11-13T08:30:00.000Z' }),
  ]
  assert.equal(isNewSince(items[0].pubDate, lastVisit), true)
  assert.equal(isNewSince(items[1].pubDate, lastVisit), false)
  assert.equal(isNewSince(items[2].pubDate, null), false)
  assert.equal(countNewSince(items, lastVisit), 1)
})

test('selectDailyBriefingItems returns top 5 deduped items sorted by score then recency', () => {
  const items = [
    makeItem({ id: 'low', score: 42 }),
    makeItem({ id: 'top1', score: 94, pubDate: '2026-11-13T08:00:00.000Z' }),
    makeItem({ id: 'dup', link: 'https://example.com/top1', score: 92 }),
    makeItem({ id: 'top2', score: 91 }),
    makeItem({ id: 'top3', score: 88 }),
    makeItem({ id: 'top4', score: 85 }),
    makeItem({ id: 'top5', score: 80 }),
    makeItem({ id: 'top6', score: 78 }),
  ]
  const top = selectDailyBriefingItems(items, 5)
  assert.equal(top.length, 5)
  assert.deepEqual(
    top.map((it) => it.id),
    ['top1', 'top2', 'top3', 'top4', 'top5'],
  )
})

test('fuzzyMatchScore ranks exact prefix above subsequence and rejects misses', () => {
  const exact = fuzzyMatchScore('kiro', 'Kiro agents on AWS')
  const middle = fuzzyMatchScore('kiro', 'Build with Kiro spec')
  const subseq = fuzzyMatchScore('bdk', 'Amazon Bedrock')
  const miss = fuzzyMatchScore('zzz', 'Amazon Bedrock')
  assert.ok(exact > middle)
  assert.ok(subseq >= 0)
  assert.equal(miss, -1)
})

test('searchCommandTargets returns matching views, feeds, and items', () => {
  const feeds: FeedSource[] = [
    { id: 'aws-news', title: 'AWS News Blog', url: 'https://aws.amazon.com/blogs/aws/feed/' },
  ]
  const items: FeedItem[] = [
    makeItem({ id: 'b1', title: 'Bedrock AgentCore Gateway Guide', score: 91 }),
  ]
  const results = searchCommandTargets({ feeds, items, query: 'bedrock' })
  assert.ok(results.some((r) => r.kind === 'item' && r.itemId === 'b1'))

  const viewResults = searchCommandTargets({ feeds, items, query: 'briefing' })
  assert.ok(viewResults.some((r) => r.kind === 'view' && r.viewId === 'briefing'))
})
