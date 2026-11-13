import type { FeedSource } from './feeds'
import { safeHttpUrl } from './format'

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

/** Build a Google Reader-compatible OPML 2.0 XML document from current feed subscriptions. */
export function buildOpml(feeds: FeedSource[]): string {
  const outlines = feeds
    .map((feed) => {
      const title = escapeXml(feed.title)
      const url = escapeXml(feed.url)
      return `      <outline type="rss" text="${title}" title="${title}" xmlUrl="${url}" />`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Resurrected Reader Subscriptions</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
    <outline text="Resurrected Reader" title="Resurrected Reader">
${outlines}
    </outline>
  </body>
</opml>
`
}

/** Download current feed subscriptions as an .opml XML file using a pure client-side Blob. */
export function downloadOpml(feeds: FeedSource[]): void {
  const xml = buildOpml(feeds)
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'resurrected-reader-feeds.opml'
  document.body.append(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Parse Google Reader / standard OPML 1.0/2.0 XML into validated http(s) FeedSources. */
export function parseOpml(xml: string): FeedSource[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid OPML/XML file')
  }

  const outlines = [...doc.querySelectorAll('outline')]
  const seen = new Set<string>()
  const parsed: FeedSource[] = []

  for (const el of outlines) {
    const rawUrl =
      el.getAttribute('xmlUrl') ||
      el.getAttribute('xmlurl') ||
      el.getAttribute('url') ||
      ''
    const validUrl = safeHttpUrl(rawUrl)
    if (!validUrl || seen.has(validUrl)) continue
    seen.add(validUrl)

    const rawTitle =
      el.getAttribute('title')?.trim() ||
      el.getAttribute('text')?.trim() ||
      new URL(validUrl).hostname.replace(/^www\./, '')

    parsed.push({
      id: `opml-${parsed.length}-${validUrl.replace(/[^a-z0-9]/gi, '').slice(-12)}`,
      title: rawTitle,
      url: validUrl,
    })
  }

  if (parsed.length === 0) {
    throw new Error('No valid http(s) RSS feeds found in OPML file')
  }
  return parsed
}
