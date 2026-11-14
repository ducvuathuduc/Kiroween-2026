import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SUMMARY_JSON_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  buildSummaryPrompt,
} from '../server/summaryPrompt.ts'
import { explainScore } from '../src/lib/scoring.ts'
import {
  MAX_SUMMARY_WORDS,
  countSummaryWords,
  findInventedUrls,
  validateDeterministicSummary,
  validateGoldenScoreOutput,
} from '../evals/validators.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const summaries = JSON.parse(
  fs.readFileSync(path.join(here, '../evals/golden/summaries.json'), 'utf8'),
)
const scoring = JSON.parse(
  fs.readFileSync(path.join(here, '../evals/golden/scoring.json'), 'utf8'),
)

test('shared summary prompt exports system prompt and builder consistently', () => {
  assert.ok(SUMMARY_SYSTEM_PROMPT.includes('TL;DR'))
  assert.ok(SUMMARY_JSON_SYSTEM_PROMPT.includes(SUMMARY_SYSTEM_PROMPT))
  const prompt = buildSummaryPrompt({
    title: 'Kiro workflows',
    feedTitle: 'AWS News Blog',
    link: 'https://aws.amazon.com/blogs/aws/',
    content: 'Example technical body.',
  })
  assert.ok(prompt.includes('Title: Kiro workflows'))
  assert.ok(prompt.includes('URL: https://aws.amazon.com/blogs/aws/'))
  assert.ok(prompt.includes('Example technical body.'))
})

test('validateDeterministicSummary rejects >100-word summary and invented URLs', () => {
  const longWords = Array.from({ length: 105 }, (_, i) => `word${i}`).join(' ')
  const tooLong = JSON.stringify({
    tldr: longWords,
    takeaways: ['Point one', 'Point two', 'Point three'],
    whyMatters: 'Matters for builders.',
  })
  const longRes = validateDeterministicSummary(tooLong, {
    vars: {
      link: 'https://aws.amazon.com/blogs/aws/',
      content: 'Short AWS article.',
    },
  })
  assert.equal(longRes.pass, false)
  assert.match(longRes.reason, /exceeds 100-word ceiling/)

  const hallucinatedUrl = JSON.stringify({
    tldr: 'Concise summary referencing https://invented-evil.example.com/benchmark directly.',
    takeaways: ['First point', 'Second point', 'Third point'],
    whyMatters: 'Helpful for builders.',
  })
  const urlRes = validateDeterministicSummary(hallucinatedUrl, {
    vars: {
      link: 'https://aws.amazon.com/blogs/aws/',
      content: 'Short AWS article.',
    },
  })
  assert.equal(urlRes.pass, false)
  assert.match(urlRes.reason, /invented URL/)
  assert.deepEqual(
    findInventedUrls(hallucinatedUrl, ['https://aws.amazon.com/blogs/aws/']),
    ['https://invented-evil.example.com/benchmark'],
  )
})

test('curated golden summary fixtures satisfy <=100 words and zero invented URLs', () => {
  assert.ok(summaries.length >= 10 && summaries.length <= 20)
  for (const item of summaries) {
    assert.ok(countSummaryWords(item.candidateSummary) <= MAX_SUMMARY_WORDS, item.id)
    const res = validateDeterministicSummary(
      JSON.stringify(item.candidateSummary),
      { vars: item },
    )
    assert.equal(res.pass, true, `${item.id}: ${res.reason}`)
  }
})

test('curated golden scoring fixtures match real explainScore outputs', () => {
  assert.ok(scoring.length >= 10)
  const now = Date.now()
  for (const item of scoring) {
    const pubDate =
      typeof item.pubDateOverride === 'string'
        ? item.pubDateOverride
        : new Date(now - Number(item.hoursAgo ?? 2) * 3_600_000).toISOString()
    const breakdown = explainScore(item.title, item.content, pubDate, {
      feedId: item.feedId,
      feedTitle: item.feedTitle,
      link: item.link,
    })
    const payload =
      typeof item.staleHoursAgo === 'number'
        ? (() => {
            const stale = explainScore(
              item.title,
              item.content,
              new Date(now - item.staleHoursAgo * 3_600_000).toISOString(),
              { feedId: item.feedId, feedTitle: item.feedTitle, link: item.link },
            )
            return {
              ...breakdown,
              staleScore: stale.score,
              staleRecency: stale.dimensions.recency,
            }
          })()
        : breakdown

    const res = validateGoldenScoreOutput(JSON.stringify(payload), item.expected)
    assert.equal(res.pass, true, `${item.id}: ${res.reason}`)
  }
})
