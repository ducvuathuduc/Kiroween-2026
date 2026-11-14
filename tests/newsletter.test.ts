import assert from 'node:assert/strict'
import test from 'node:test'
import {
  computeFeedEtag,
  createMemoryNewsletterStore,
  createNewsletterFeedRecord,
  generateFeedId,
  htmlToPlainText,
  isValidFeedId,
  MAX_RAW_EMAIL_BYTES,
  newsletterEntryToFeedItem,
  newsletterFeedToFeedSource,
  parseRawEmail,
  renderAtomFeed,
  renderJsonFeed,
  renderRssFeed,
  stripIllegalXmlChars,
} from '../src/lib/newsletter'
import { explainScore } from '../src/lib/scoring'
import {
  createNewsletterWorkerApp,
  handleInboundEmail,
} from '../workers/newsletter/src/index.ts'

const MULTIPART_NEWSLETTER_FIXTURE = [
  'From: "AWS Weekly Dispatch" <dispatch@example.com>',
  'To: cobalt.lantern.42@newsletter.resurrected-reader.invalid',
  'Subject: =?UTF-8?B?Q2xhdWRlICYgS2lybyBvbiBBV1MgQmVkcm9jayDigJQgQXJjaGl0ZWN0dXJlIE5vdGVz?=',
  'Date: Fri, 14 Nov 2026 09:30:00 +0000',
  'Message-ID: <aws-weekly-2026-11-14@example.com>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/alternative; boundary="nl-boundary-01"',
  '',
  '--nl-boundary-01',
  'Content-Type: text/plain; charset="utf-8"',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Build deterministic Kiro workflows with Amazon Bedrock Agents and MCP tools.',
  'Read the full architecture guide: https://aws.amazon.com/blogs/aws/bedrock-agents/',
  '',
  '--nl-boundary-01',
  'Content-Type: text/html; charset="utf-8"',
  '',
  '<html><head><style>.hidden{display:none}</style></head><body>',
  '<p>Build deterministic <strong>Kiro</strong> workflows with Amazon Bedrock Agents and MCP tools.</p>',
  '<p><a href="https://example.com/unsubscribe">Unsubscribe</a></p>',
  '<p><a href="https://aws.amazon.com/blogs/aws/bedrock-agents/">Read architecture guide</a></p>',
  '<img src="https://aws.amazon.com/blogs/aws/hero.png" alt="Architecture diagram" />',
  '<script>alert("xss")</script>',
  '</body></html>',
  '--nl-boundary-01--',
].join('\r\n')

const HTML_ONLY_FIXTURE = [
  'From: Server Watch <ops@example.com>',
  'Subject: Amazon ECS & Lambda deployment checklist',
  'Date: Fri, 14 Nov 2026 10:00:00 +0000',
  'Message-ID: <ecs-lambda-2026@example.com>',
  'MIME-Version: 1.0',
  'Content-Type: text/html; charset="utf-8"',
  '',
  '<div><style>body{color:#000}</style><h1>ECS &amp; Lambda Checklist</h1><p>Zero-downtime rollouts with IAM least privilege.</p><script>evil()</script></div>',
].join('\r\n')

test('generateFeedId produces unguessable 128-bit base64url IDs decoupled from mailboxId', () => {
  const ids = new Set<string>()
  for (let i = 0; i < 100; i += 1) {
    const id = generateFeedId()
    assert.equal(id.length, 22)
    assert.ok(isValidFeedId(id), `Expected valid feedId, got ${id}`)
    assert.match(id, /^[A-Za-z0-9_-]{22}$/)
    ids.add(id)
  }
  assert.equal(ids.size, 100)

  const record = createNewsletterFeedRecord({ title: 'AWS Digest' })
  assert.ok(!record.inboundAddress.includes(record.id))
  assert.ok(!record.id.includes(record.mailboxId))
  assert.equal(newsletterFeedToFeedSource(record).kind, 'newsletter')
  assert.equal(newsletterFeedToFeedSource(record).url, `/rss/${record.id}`)
})

test('parseRawEmail decodes RFC 2047 UTF-8 headers, multipart HTML/text, and extracts safe links & cover images', async () => {
  const entry = await parseRawEmail(MULTIPART_NEWSLETTER_FIXTURE)
  assert.equal(
    entry.subject,
    'Claude & Kiro on AWS Bedrock — Architecture Notes',
  )
  assert.equal(entry.from, 'AWS Weekly Dispatch <dispatch@example.com>')
  assert.equal(entry.fromAddress, 'dispatch@example.com')
  assert.equal(entry.messageId, '<aws-weekly-2026-11-14@example.com>')
  assert.equal(entry.receivedAt, '2026-11-14T09:30:00.000Z')
  assert.equal(
    entry.link,
    'https://aws.amazon.com/blogs/aws/bedrock-agents/',
  )
  assert.match(entry.text, /Amazon Bedrock Agents and MCP tools/)

  const feed = createNewsletterFeedRecord({ title: 'AWS Weekly Dispatch' })
  const feedItem = newsletterEntryToFeedItem(
    entry,
    feed,
    'https://reader.example.com',
  )
  assert.equal(feedItem.imageUrl, 'https://aws.amazon.com/blogs/aws/hero.png')

  const scored = explainScore(
    feedItem.title,
    feedItem.description,
    feedItem.pubDate,
    feedItem,
  )
  assert.ok(scored.score >= 70, `Expected high signal score, got ${scored.score}`)
})

test('htmlToPlainText strips styles/scripts cleanly and parseRawEmail rejects empty or oversized input', async () => {
  const htmlEntry = await parseRawEmail(HTML_ONLY_FIXTURE)
  assert.doesNotMatch(htmlEntry.text, /color:#000|evil\(\)/)
  assert.match(htmlEntry.text, /ECS & Lambda Checklist/)
  assert.match(htmlEntry.text, /IAM least privilege/)

  const cleaned = htmlToPlainText(
    '<style>p{margin:0}</style><p>Hello&nbsp;&amp;&nbsp;world</p><script>bad()</script>',
  )
  assert.equal(cleaned, 'Hello & world')

  await assert.rejects(() => parseRawEmail('   '), /empty/i)
  await assert.rejects(
    () => parseRawEmail('X-Empty: 1\r\n\r\n'),
    /subject or body/i,
  )
  const oversized = new Uint8Array(MAX_RAW_EMAIL_BYTES + 1).fill(65)
  await assert.rejects(() => parseRawEmail(oversized), /1 MiB/i)
})

test('store deduplicates duplicate imports and renderers strip XML control chars', async () => {
  const store = createMemoryNewsletterStore()
  const feed = await store.createFeed({ title: 'Security\u0000 Dispatch\u0007' })
  assert.equal(stripIllegalXmlChars('A\u0000B\u001FC'), 'ABC')

  const first = await store.importEmail(feed.id, MULTIPART_NEWSLETTER_FIXTURE)
  assert.ok(first && !first.duplicate)
  const second = await store.importEmail(feed.id, MULTIPART_NEWSLETTER_FIXTURE)
  assert.ok(second && second.duplicate)
  assert.equal(second.feed.entries.length, 1)

  const rss = renderRssFeed(second.feed, 'https://reader.example.com')
  assert.ok(rss.includes('<rss version="2.0"'))
  assert.equal(stripIllegalXmlChars(rss), rss)
  assert.ok(rss.includes('Claude &amp; Kiro on AWS Bedrock'))

  const atom = renderAtomFeed(second.feed, 'https://reader.example.com')
  assert.ok(atom.includes('<feed xmlns="http://www.w3.org/2005/Atom">'))
  assert.ok(atom.includes('<email>dispatch@example.com</email>'))

  const jsonFeed = JSON.parse(
    renderJsonFeed(second.feed, 'https://reader.example.com'),
  ) as { version: string; items: Array<{ title: string }> }
  assert.equal(jsonFeed.version, 'https://jsonfeed.org/version/1.1')
  assert.equal(jsonFeed.items.length, 1)
  assert.ok(computeFeedEtag(second.feed).startsWith('"nl-'))
})

test('sibling newsletter Worker serves RSS/Atom/JSON, supports 304 ETag, handles email(), and 404s after deletion', async () => {
  const store = createMemoryNewsletterStore()
  const app = createNewsletterWorkerApp(() => store)

  const createRes = await app.request('/api/v1/feeds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'AWS Serverless Briefing' }),
  })
  assert.equal(createRes.status, 201)
  const { feed } = (await createRes.json()) as {
    feed: { id: string; mailboxId: string; inboundAddress: string }
  }
  assert.ok(isValidFeedId(feed.id))

  const importRes = await app.request(`/api/v1/feeds/${feed.id}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: MULTIPART_NEWSLETTER_FIXTURE }),
  })
  assert.equal(importRes.status, 201)

  // Verify email() inbound delivery to the feed's decoupled mailbox address
  let rejectedReason = ''
  const delivered = await handleInboundEmail(
    {
      from: 'ops@example.com',
      to: feed.inboundAddress,
      raw: HTML_ONLY_FIXTURE,
      setReject(reason) {
        rejectedReason = reason
      },
    },
    store,
  )
  assert.equal(delivered.accepted, true)
  assert.equal(rejectedReason, '')

  const unknown = await handleInboundEmail(
    {
      from: 'ops@example.com',
      to: 'unknown.person.99@newsletter.resurrected-reader.invalid',
      raw: HTML_ONLY_FIXTURE,
      setReject(reason) {
        rejectedReason = reason
      },
    },
    store,
  )
  assert.equal(unknown.accepted, false)
  assert.match(rejectedReason, /Unknown newsletter recipient/)

  const rssRes = await app.request(`/rss/${feed.id}`)
  assert.equal(rssRes.status, 200)
  const etag = rssRes.headers.get('etag')
  assert.ok(etag)
  const rssBody = await rssRes.text()
  assert.match(rssBody, /AWS Serverless Briefing/)
  assert.match(rssBody, /Amazon ECS &amp; Lambda/)

  const notModified = await app.request(`/rss/${feed.id}`, {
    headers: { 'If-None-Match': etag },
  })
  assert.equal(notModified.status, 304)

  const atomRes = await app.request(`/atom/${feed.id}`)
  assert.equal(atomRes.status, 200)
  const jsonRes = await app.request(`/json/${feed.id}`)
  assert.equal(jsonRes.status, 200)

  const deleteRes = await app.request(`/api/v1/feeds/${feed.id}`, {
    method: 'DELETE',
  })
  assert.equal(deleteRes.status, 200)

  const afterDelete = await app.request(`/rss/${feed.id}`)
  assert.equal(afterDelete.status, 404)
})
