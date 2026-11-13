import test from 'node:test'
import assert from 'node:assert/strict'
import type { FeedItem } from '../src/lib/feeds'
import {
  buildFeedActivity,
  buildItemRadarData,
  buildScoreHistogram,
  computeRadarSummary,
} from '../src/lib/radar'

const SAMPLE_ITEMS: FeedItem[] = [
  {
    id: '1',
    feedId: 'aws-ml',
    feedTitle: 'AWS Machine Learning Blog',
    title: 'AgentCore on Bedrock',
    link: 'https://aws.amazon.com/blogs/machine-learning/a',
    pubDate: new Date().toISOString(),
    description: 'Agentic AWS Bedrock security IAM architecture guide.',
    score: 88,
    scoreDimensions: { relevance: 90, recency: 100, authority: 86, novelty: 75 },
  },
  {
    id: '2',
    feedId: 'aws-ml',
    feedTitle: 'AWS Machine Learning Blog',
    title: 'Bedrock cost tuning',
    link: 'https://aws.amazon.com/blogs/machine-learning/b',
    pubDate: new Date().toISOString(),
    description: 'Cost optimization on AWS.',
    score: 64,
    scoreDimensions: { relevance: 55, recency: 100, authority: 72, novelty: 40 },
  },
  {
    id: '3',
    feedId: 'hn',
    feedTitle: 'Hacker News',
    title: 'EV sales',
    link: 'https://news.ycombinator.com/',
    pubDate: new Date().toISOString(),
    description: 'Cars.',
    score: 36,
    scoreDimensions: { relevance: 0, recency: 100, authority: 44, novelty: 25 },
  },
]

test('buildScoreHistogram buckets scores accurately including >=70 high flags', () => {
  const hist = buildScoreHistogram(SAMPLE_ITEMS)
  assert.equal(hist.length, 6)
  assert.equal(hist.find((b) => b.bucket === '20–39')?.count, 1)
  assert.equal(hist.find((b) => b.bucket === '60–69')?.count, 1)
  assert.equal(hist.find((b) => b.bucket === '85–100')?.count, 1)
  assert.equal(hist.find((b) => b.bucket === '85–100')?.isHigh, true)
})

test('buildFeedActivity aggregates total and high-signal counts per feed', () => {
  const activity = buildFeedActivity(SAMPLE_ITEMS)
  const ml = activity.find((a) => a.fullTitle === 'AWS Machine Learning Blog')
  assert.ok(ml)
  assert.equal(ml.total, 2)
  assert.equal(ml.high, 1)
  assert.equal(ml.avgScore, 76)
})

test('buildItemRadarData returns all 4 axes and computeRadarSummary totals match', () => {
  const radar = buildItemRadarData(SAMPLE_ITEMS[0])
  assert.deepEqual(
    radar.map((d) => d.dimension),
    ['Relevance', 'Recency', 'Authority', 'Novelty'],
  )
  const summary = computeRadarSummary(SAMPLE_ITEMS)
  assert.equal(summary.total, 3)
  assert.equal(summary.highCount, 1)
  assert.equal(summary.highShare, 33)
  assert.equal(summary.topScore, 88)
})
