import test from 'node:test'
import assert from 'node:assert/strict'
import { buildKiroTask } from '../src/lib/kiroTask'
import type { FeedItem } from '../src/lib/feeds'

test('buildKiroTask formats Markdown spec with Goal and Acceptance criteria', () => {
  const item: FeedItem = {
    id: 'test-1',
    feedId: 'aws-news',
    feedTitle: 'AWS News Blog',
    title: 'Kiro agents orchestrate AWS deployments',
    link: 'https://aws.amazon.com/blogs/aws/',
    pubDate: new Date().toISOString(),
    description: 'Walkthrough of spec-driven builds.',
    score: 75,
  }

  const md = buildKiroTask(item)
  assert.match(md, /^# Kiro task — Kiro agents orchestrate AWS deployments/)
  assert.match(md, /\*\*Signal:\*\* 75\/100 \(deterministic score\)/)
  assert.match(md, /## Goal/)
  assert.match(md, /## Acceptance criteria/)
})
