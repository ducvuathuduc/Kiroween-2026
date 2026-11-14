import test from 'node:test'
import assert from 'node:assert/strict'
import { demoProfile, emptyProfile, explainBoost, personalBoost, recordFeedback } from '../src/lib/personalize'
import { applyPersonalBoost } from '../src/lib/scoring'
import { sanitizeSettings } from '../src/lib/storage'

test('feedback favors related topics and empty profiles have no boost', () => {
  const a = { id: 'a', title: 'Amazon Bedrock agents', description: 'Build Bedrock agents on AWS' }
  const b = { id: 'b', title: 'Gardening tips', description: 'Plant flowers in a garden' }
  let profile = emptyProfile()
  assert.equal(personalBoost(a, profile), 0)
  for (let i = 0; i < 3; i++) profile = recordFeedback('a', 'read', a, profile)
  for (let i = 0; i < 2; i++) profile = recordFeedback('b', 'skip', b, profile)
  assert.ok(personalBoost(a, profile) > personalBoost(b, profile))
  assert.match(explainBoost(a, profile), /Bedrock|AWS|Agents/)
  assert.equal(personalBoost(a, emptyProfile()), 0)
  assert.throws(() => recordFeedback('other', 'read', a, profile))
})

test('demo and settings are bounded and reset to the unchanged signal', () => {
  const item = { id: 'a', title: 'AWS Bedrock agents', description: 'Build Bedrock applications' }
  const boost = personalBoost(item, demoProfile())
  assert.ok(boost > 0 && boost <= 10)
  assert.equal(applyPersonalBoost(50, personalBoost(item, emptyProfile())), 50)
  assert.equal(applyPersonalBoost(98, 99), 100)
  assert.equal(sanitizeSettings({}).personalBoostEnabled, true)
  assert.equal(sanitizeSettings({ personalBoostEnabled: false }).personalBoostEnabled, false)
})
