import test from 'node:test'
import assert from 'node:assert/strict'
import { explainScore, scoreItem } from '../src/lib/scoring'

const now = Date.now()
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString()

test('scoreItem adds keyword weights and today recency bonus', () => {
  const score = scoreItem(
    'Kiro agents build on AWS',
    'Agentic LLM startup security checklist',
    hoursAgo(2),
  )
  // 25 + 15 + 20 + 15 + 10 + 10 + 15 = 110 -> capped at 100
  assert.equal(score, 100)
})

test('scoreItem awards +8 for items within the past week', () => {
  const score = scoreItem('AWS security update', 'Details inside', hoursAgo(72))
  // aws (15) + security (10) + week (8) = 33
  assert.equal(score, 33)
})

test('scoreItem handles invalid pubDate without NaN', () => {
  const score = scoreItem('Kiro workflow', 'Guide', 'not-a-date')
  assert.equal(score, 25)
})

test('explainScore lists deterministic keyword and recency reasons', () => {
  const breakdown = explainScore('Kiro on AWS', 'Agent workflow', hoursAgo(4))
  assert.equal(breakdown.score, 75)
  assert.equal(breakdown.reasons.length, 4)
  assert.deepEqual(
    breakdown.reasons.map((r) => r.points),
    [25, 15, 20, 15],
  )
})
