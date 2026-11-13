import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOpml } from '../src/lib/opml'

test('buildOpml produces escaped OPML 2.0 XML with feed outlines', () => {
  const xml = buildOpml([
    {
      id: 'aws',
      title: 'AWS & Cloud <News>',
      url: 'https://aws.amazon.com/blogs/aws/feed/?a=1&b=2',
    },
  ])
  assert.match(xml, /<opml version="2\.0">/)
  assert.match(xml, /title="AWS &amp; Cloud &lt;News&gt;"/)
  assert.match(
    xml,
    /xmlUrl="https:\/\/aws\.amazon\.com\/blogs\/aws\/feed\/\?a=1&amp;b=2"/,
  )
})
