import { useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import type { NavigableRoute } from '../lib/routes'
import PageShell from './PageShell'
import { Button } from './ui/button'
import { Separator } from './ui/separator'

interface PrivacyPolicyPageProps {
  onNavigate: (route: NavigableRoute) => void
  onExportJson: () => void
  onClearAllData: () => void
}

export default function PrivacyPolicyPage({
  onNavigate,
  onExportJson,
  onClearAllData,
}: PrivacyPolicyPageProps) {
  const [confirmReset, setConfirmReset] = useState(false)
  const [notice, setNotice] = useState('')

  return (
    <PageShell
      label="Privacy Policy"
      currentRoute="privacy"
      onNavigate={onNavigate}
    >
      <div className="border-b border-zinc-200 pb-6">
        <p className="font-mono text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
          Privacy Policy · /privacy
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
          Local-first data handling &amp; zero tracking
        </h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-zinc-600">
          Resurrected Reader is designed as a transparent, browser-local reading
          radar. We do not run analytics scripts, ad networks, fingerprinting,
          or user tracking databases.
        </p>
      </div>

      <div className="space-y-6 text-[13.5px] leading-relaxed text-zinc-700">
        <section aria-label="Browser local storage" className="space-y-2.5">
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            1. What stays in your browser (<code className="font-mono">localStorage</code>)
          </h2>
          <p>
            There are no user accounts and no remote database. Your state is
            stored solely inside your browser’s <code className="font-mono">localStorage</code>{' '}
            under explicit, inspectable keys:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-zinc-600">
            <li>
              <code className="font-mono text-zinc-900">rr.feeds</code> — Your subscribed RSS/Atom URLs.
            </li>
            <li>
              <code className="font-mono text-zinc-900">rr.read</code> &amp;{' '}
              <code className="font-mono text-zinc-900">rr.saved</code> — Item IDs you marked read or bookmarked.
            </li>
            <li>
              <code className="font-mono text-zinc-900">rr.summaries.v1</code> — Cached AI TL;DR outputs (up to 30 most recent).
            </li>
            <li>
              <code className="font-mono text-zinc-900">rr.lastVisit.v1</code> &amp;{' '}
              <code className="font-mono text-zinc-900">rr.settings.v1</code> — Last-visit checkpoint and interface preferences.
            </li>
            <li>
              <code className="font-mono text-zinc-900">rr.notify</code> &amp;{' '}
              <code className="font-mono text-zinc-900">rr.notified</code> — Notification opt-in and already-alerted item IDs.
            </li>
          </ul>
        </section>

        <Separator />

        <section aria-label="RSS and pulse network requests" className="space-y-2.5">
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            2. Feed fetching &amp; third-party proxies
          </h2>
          <p>
            To bypass browser CORS restrictions when reading public RSS/Atom
            feeds, requests are sent in this priority order:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-zinc-600">
            <li>
              <strong>Primary:</strong> Same-origin Hono Worker proxy{' '}
              <code className="font-mono text-zinc-900">GET /api/rss?url=...</code>{' '}
              (checks public HTTP(S) hosts and redirects, limits RSS downloads to 2 MiB, and uses a 5-minute in-memory cache).
            </li>
            <li>
              <strong>Client fallbacks:</strong> If the local server route is
              unavailable, the browser falls back to{' '}
              <code className="font-mono text-zinc-900">api.rss2json.com</code>{' '}
              and <code className="font-mono text-zinc-900">api.allorigins.win</code>.
              These services receive the target feed URL and normal network
              metadata, such as your IP address.
            </li>
            <li>
              <strong>Community Pulse &amp; Cover Art:</strong> Public read-only
              requests to Hacker News Firebase API, GitHub public search API, and{' '}
              <code className="font-mono text-zinc-900">POST /api/og-images</code>{' '}
              for <code className="font-mono">og:image</code> meta tags.
            </li>
          </ul>
        </section>

        <Separator />

        <section aria-label="Server-side AI summarization and search" className="space-y-2.5">
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            3. Server-side AI routing (<code className="font-mono">GET /api/providers</code>,{' '}
            <code className="font-mono">POST /api/summarize</code>,{' '}
            <code className="font-mono">POST /api/embed</code>)
          </h2>
          <p>
            Provider credentials (<code className="font-mono">GEMINI_API_KEY</code> and
            optional <code className="font-mono">OPENAI_API_KEY</code>,{' '}
            <code className="font-mono">ANTHROPIC_API_KEY</code>, or AWS Bedrock
            credentials) are configured strictly on the server and are{' '}
            <strong>never</strong> included in the client bundle or provider
            discovery response. <code className="font-mono">GET /api/providers</code>{' '}
            reports availability and model metadata so Settings only unlocks
            configured providers.
          </p>
          <p>
            When you summarize an article (<kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px]">s</kbd>),
            only the article’s title, feed name, canonical URL, and excerpt (up
            to 5,000 characters) are routed through Vercel AI SDK v7. When
            searching (<kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px]">/</kbd> or{' '}
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px]">⌘K</kbd>),
            in-browser semantic search runs locally via a Web Worker (caching model
            weights in <code className="font-mono">transformers-cache</code> and
            384-dim vectors in IndexedDB <code className="font-mono">rr-semantic</code>);
            <code className="font-mono">POST /api/embed</code> is used only as a
            fallback when local WASM is unavailable or still downloading.
          </p>
          <p>
            The stateless <code className="font-mono">/mcp</code> endpoint serves
            the default public feed catalog, not your browser-local reading
            state. Its AI tools send article content or search inputs to
            configured providers and may incur charges. Hosting, proxy, and AI
            services may retain request logs under their own policies; clearing
            browser storage does not erase those external logs.
          </p>
        </section>

        <Separator />

        <section aria-label="Analytics and your controls" className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            4. Zero ads, zero telemetry &amp; data controls
          </h2>
          <p>
            Resurrected Reader contains zero advertisements, zero third-party
            analytics trackers, and zero tracking cookies. You can export or
            erase your browser-local data at any time below:
          </p>
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onExportJson()
                setNotice('Exported full JSON snapshot.')
              }}
              className="h-8 gap-1.5 border-zinc-200 text-xs shadow-none"
            >
              <Download aria-hidden="true" className="size-3.5" />
              Export all data (.json)
            </Button>

            {!confirmReset ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmReset(true)}
                className="h-8 gap-1.5 border-zinc-200 text-xs text-red-700 shadow-none hover:bg-red-50 hover:text-red-800"
              >
                <Trash2 aria-hidden="true" className="size-3.5" />
                Clear local data
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onClearAllData()
                    setConfirmReset(false)
                    setNotice('Local browser storage cleared and defaults restored.')
                  }}
                  className="h-8 bg-red-600 text-xs text-white hover:bg-red-700"
                >
                  Confirm clear
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmReset(false)}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
          {notice && (
            <p role="status" className="text-xs font-medium text-zinc-700">
              {notice}
            </p>
          )}
        </section>
      </div>
    </PageShell>
  )
}
