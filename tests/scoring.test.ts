import test from 'node:test'
import assert from 'node:assert/strict'
import { explainScore, scoreItem } from '../src/lib/scoring'

const now = Date.now()
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString()

test('scoreItem scores high-relevance recent AWS/Kiro/agent articles >= 70', () => {
  const score = scoreItem(
    'How to deploy agentic workflows with Kiro on AWS Bedrock',
    'Build secure AI coding workflows using IAM, Bedrock AgentCore, and MCP servers in production.',
    hoursAgo(2),
    { feedId: 'aws-ml', feedTitle: 'AWS Machine Learning Blog' },
  )
  assert.ok(score >= 85 && score <= 100, `Expected high score, got ${score}`)
})

test('scoreItem applies smooth recency decay across hours vs days', () => {
  const fresh = explainScore('AWS security update', 'Details inside', hoursAgo(4), {
    feedId: 'aws-news',
  })
  const weekOld = explainScore('AWS security update', 'Details inside', hoursAgo(120), {
    feedId: 'aws-news',
  })
  assert.ok(fresh.dimensions.recency > weekOld.dimensions.recency)
  assert.ok(fresh.score > weekOld.score)
})

test('scoreItem handles invalid pubDate without NaN and returns valid dimensions', () => {
  const breakdown = explainScore('Kiro workflow', 'Guide', 'not-a-date')
  assert.equal(Number.isFinite(breakdown.score), true)
  assert.equal(breakdown.dimensions.recency, 14)
  assert.ok(breakdown.score > 0 && breakdown.score <= 100)
})

test('explainScore returns 4 normalized dimensions and clear reasons', () => {
  const breakdown = explainScore(
    'Introducing Kiro on AWS',
    'New agentic workflow launch with IAM security baseline.',
    hoursAgo(4),
    { feedId: 'aws-news' },
  )
  assert.ok(breakdown.dimensions.relevance >= 70)
  assert.equal(breakdown.dimensions.recency, 100)
  assert.ok(breakdown.dimensions.authority >= 72)
  assert.ok(breakdown.dimensions.novelty >= 50)
  assert.ok(breakdown.reasons.length >= 4)
})
