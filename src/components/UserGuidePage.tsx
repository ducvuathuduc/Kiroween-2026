import { ArrowUpRight } from 'lucide-react'
import { routeToPath, type NavigableRoute } from '../lib/routes'
import { KEYBOARD_SHORTCUTS } from '../lib/shortcuts'
import PageShell from './PageShell'
import { Button } from './ui/button'
import { Separator } from './ui/separator'

interface UserGuidePageProps {
  onNavigate: (route: NavigableRoute) => void
  onOpenShortcutsModal: () => void
  onOpenNewsletterModal: () => void
}

const GUIDE_TOC = [
  { id: 'feed', label: '1. Feed & Reader' },
  { id: 'briefing', label: '2. Daily Briefing & Audio' },
  { id: 'radar', label: '3. Signal Radar & Health' },
  { id: 'second-brain', label: '4. Second Brain Resurface' },
  { id: 'newsletters', label: '5. Newsletter-to-Feed' },
  { id: 'mcp-server', label: '6. MCP Server' },
  { id: 'shortcuts', label: '7. Keyboard Shortcuts' },
  { id: 'settings', label: '8. Settings & Exports' },
] as const

function RouteLink({
  route,
  label,
  onNavigate,
}: {
  route: NavigableRoute
  label: string
  onNavigate: (route: NavigableRoute) => void
}) {
  return (
    <a
      href={routeToPath(route)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        onNavigate(route)
      }}
      className="inline-flex items-center gap-1 text-xs font-medium text-zinc-900 underline underline-offset-4 hover:text-zinc-600"
    >
      {label}
      <ArrowUpRight aria-hidden="true" className="size-3" />
    </a>
  )
}

export default function UserGuidePage({
  onNavigate,
  onOpenShortcutsModal,
  onOpenNewsletterModal,
}: UserGuidePageProps) {
  return (
    <PageShell
      label="User Guide"
      currentRoute="guide"
      onNavigate={onNavigate}
      maxWidth="max-w-5xl"
    >
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-6">
        <div>
          <p className="font-mono text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
            User Guide · /guide
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
            Step-by-Step User Guide
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-zinc-600">
            Practical walkthroughs for every workflow in Resurrected Reader—from
            triage in the 3-pane Feed and spoken Daily Briefings to Second Brain
            resurfacing, Newsletter bridges, read-only MCP tools, and local
            backups.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 border-zinc-200 text-xs shadow-none"
          >
            <a
              href={routeToPath('docs')}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                e.preventDefault()
                onNavigate('docs')
              }}
            >
              Technical Docs (/docs)
            </a>
          </Button>
          <Button
            asChild
            size="sm"
            className="h-8 text-xs font-medium"
          >
            <a
              href={routeToPath('feed')}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                e.preventDefault()
                onNavigate('feed')
              }}
            >
              Open Feed
            </a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <aside className="lg:col-span-3">
          <nav
            aria-label="Guide sections"
            className="space-y-1 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 lg:sticky lg:top-6"
          >
            <p className="px-2 pb-1 text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
              Workflows
            </p>
            {GUIDE_TOC.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="block rounded-md px-2 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-white hover:text-zinc-950"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="space-y-10 lg:col-span-9">
          <section id="feed" className="space-y-3 scroll-mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                1. Feed: Subscriptions, Triage &amp; Reading
              </h2>
              <RouteLink route="feed" label="Go to Feed" onNavigate={onNavigate} />
            </div>
            <p className="text-[13.5px] leading-relaxed text-zinc-700">
              The main Feed opens a three-pane layout modeled on classic Google
              Reader: subscriptions on the left, signal-ranked timeline in the
              center, and the article reader on the right.
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-zinc-700">
              <li>
                <strong>Filter &amp; sort:</strong> Switch between{' '}
                <span className="font-medium text-zinc-950">All</span>,{' '}
                <span className="font-medium text-zinc-950">High ≥70</span>,{' '}
                <span className="font-medium text-zinc-950">Unread</span>, and{' '}
                <span className="font-medium text-zinc-950">Saved</span> tabs, or
                sort by deterministic signal score or newest date from the{' '}
                <span className="font-mono text-xs">⋯</span> menu.
              </li>
              <li>
                <strong>Add feeds or import OPML:</strong> Paste any valid{' '}
                <code className="font-mono">http(s)://</code> RSS or Atom URL
                into the sidebar input, or click the upload icon above{' '}
                <span className="font-medium text-zinc-950">Subscriptions</span>{' '}
                to import an existing Google Reader OPML 2.0 file.
              </li>
              <li>
                <strong>Inspect &amp; search:</strong> Type in the header filter
                box (<kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 font-mono text-[11px]">/</kbd>)
                to run keyword or semantic hybrid search when enabled, or press{' '}
                <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 font-mono text-[11px]">⌘K</kbd>{' '}
                to jump across views, feeds, and stories. Click{' '}
                <span className="font-medium text-zinc-950">Ask</span> to query
                today&apos;s public feeds with grounded citations.
              </li>
              <li>
                <strong>Summarize &amp; ship:</strong> In the Reader pane, copy
                the post as Markdown, trigger an AI TL;DR (<kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 font-mono text-[11px]">s</kbd>)
                when a server AI key is configured (falling back cleanly to an
                extractive summary otherwise), or click{' '}
                <span className="font-medium text-zinc-950">→ Kiro task</span> (<kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 font-mono text-[11px]">e</kbd>)
                to preview and download a ready-to-use <code className="font-mono">.zip</code>{' '}
                spec bundle.
              </li>
            </ol>
          </section>

          <Separator />

          <section id="briefing" className="space-y-3 scroll-mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                2. Daily Briefing &amp; Spoken Audio
              </h2>
              <RouteLink
                route="briefing"
                label="Open Daily Briefing"
                onNavigate={onNavigate}
              />
            </div>
            <p className="text-[13.5px] leading-relaxed text-zinc-700">
              Daily Briefing selects the top 5 highest-scoring items across your
              live feeds and prepares structured TL;DRs alongside a single-narrator
              spoken-script audio briefing.
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-zinc-700">
              <li>
                <strong>Review the Top 5 digest:</strong> Each card shows the
                item&apos;s source, age, deterministic score breakdown, and AI or
                extractive TL;DR. Click{' '}
                <span className="font-medium text-zinc-950">Generate remaining TL;DRs</span>{' '}
                if any cards have not synthesized yet.
              </li>
              <li>
                <strong>Choose Voice &amp; Speed:</strong> In the{' '}
                <span className="font-medium text-zinc-950">Audio Briefing</span>{' '}
                bar, pick a voice in <code className="font-mono">Voice</code> and
                adjust <code className="font-mono">Speed</code> from{' '}
                <span className="font-mono tabular-nums">0.5x</span> to{' '}
                <span className="font-mono tabular-nums">2.0x</span>.
              </li>
              <li>
                <strong>Play, Pause, Stop &amp; Transcript:</strong> Click{' '}
                <span className="font-medium text-zinc-950">Play</span>. When a
                server <code className="font-mono">GEMINI_API_KEY</code> is
                configured, the Worker generates a single-narrator spoken script
                and voices an MP3 via <code className="font-mono">gemini-3.8-flash-lite-tts</code>{' '}
                (cached in R2 when bound). When unconfigured, the badge honestly
                labels <code className="font-mono">Web Speech API (Gemini TTS unconfigured)</code>{' '}
                and plays on-device using the exact same spoken script. Expand{' '}
                <span className="font-medium text-zinc-950">Spoken script transcript</span>{' '}
                to read along at any time.
              </li>
            </ol>
          </section>

          <Separator />

          <section id="radar" className="space-y-3 scroll-mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                3. Signal Radar &amp; System Health
              </h2>
              <div className="flex items-center gap-3">
                <RouteLink
                  route="radar"
                  label="Open Signal Radar"
                  onNavigate={onNavigate}
                />
                <RouteLink
                  route="system"
                  label="Open System Health"
                  onNavigate={onNavigate}
                />
              </div>
            </div>
            <p className="text-[13.5px] leading-relaxed text-zinc-700">
              Every score is computed deterministically—never by an LLM—so you
              can audit exactly why any article ranked high or low.
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-zinc-700">
              <li>
                <strong>Inspect any badge:</strong> Click any score pill in the
                Feed, Reader, or Daily Briefing to view the 4-dimension breakdown
                (Relevance 42%, Recency 24%, Authority 18%, Novelty 16%) and the
                matched keywords/rules.
              </li>
              <li>
                <strong>Spot trends in Signal Radar:</strong> Open{' '}
                <code className="font-mono">/radar</code> to view the score
                distribution histogram, high-signal yield per subscribed feed,
                and a 4-axis spider chart for the active item.
              </li>
              <li>
                <strong>Monitor feed status in System &amp; Health:</strong> Open{' '}
                <code className="font-mono">/system</code> to inspect per-feed
                fetch status, last-checked timestamps, item counts, and any
                upstream fetch errors, plus the Mermaid pipeline diagram.
              </li>
            </ol>
          </section>

          <Separator />

          <section id="second-brain" className="space-y-3 scroll-mt-6">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              4. Second Brain Past-Reads Resurface
            </h2>
            <p className="text-[13.5px] leading-relaxed text-zinc-700">
              As you read and bookmark real feed items (up to 300 records stored
              locally in <code className="font-mono">rr.pastReads.v1</code>),
              Resurrected Reader surfaces relevant past context in two places:
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-zinc-700">
              <li>
                <strong>In the Reader pane (&ldquo;From your past reads&rdquo;):</strong>{' '}
                Shows up to 3 previously read or saved articles related to the
                item currently open, including shared topics and a match score.
              </li>
              <li>
                <strong>In the Feed sidebar (&ldquo;Resurfaced today&rdquo;):</strong>{' '}
                Surfaces older articles you read or bookmarked more than 30 days
                ago that connect to today&apos;s top stories.
              </li>
              <li>
                <strong>Transparent match labels:</strong> When semantic
                embeddings (local Web Worker or Vectorize/server embeddings) are
                active, matches display semantic similarity; when no embedding
                pipeline is active, matching falls back to deterministic keyword
                overlap and is labeled honestly as{' '}
                <code className="font-mono">topic-overlap</code>.
              </li>
            </ol>
          </section>

          <Separator />

          <section id="newsletters" className="space-y-3 scroll-mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                5. Newsletter-to-Feed Bridge
              </h2>
              <button
                type="button"
                onClick={onOpenNewsletterModal}
                className="inline-flex items-center gap-1 text-xs font-medium text-zinc-900 underline underline-offset-4 hover:text-zinc-600"
              >
                Open Newsletter modal
                <ArrowUpRight aria-hidden="true" className="size-3" />
              </button>
            </div>
            <p className="text-[13.5px] leading-relaxed text-zinc-700">
              Turn email newsletters into normal scored feed items inside your
              timeline without sharing your personal inbox credentials.
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-zinc-700">
              <li>
                <strong>Create a bridge:</strong> Click the mail icon above{' '}
                <span className="font-medium text-zinc-950">Subscriptions</span>{' '}
                (or open <span className="font-medium text-zinc-950">Newsletter bridges</span>{' '}
                in Settings) and enter a newsletter name.
              </li>
              <li>
                <strong>Import messages:</strong> Paste raw RFC 822 email
                source or upload a <code className="font-mono">.eml</code> file.
                Messages are parsed with <code className="font-mono">postal-mime</code>,
                scored via <code className="font-mono">explainScore()</code>, and
                added directly to that feed.
              </li>
              <li>
                <strong>Subscribe anywhere:</strong> Each bridge receives an
                unguessable 128-bit feed ID served at{' '}
                <code className="font-mono">/rss/:feedId</code>,{' '}
                <code className="font-mono">/atom/:feedId</code>, and{' '}
                <code className="font-mono">/json/:feedId</code>. Live SMTP/MX
                email ingestion uses the separate isolated{' '}
                <code className="font-mono">workers/newsletter/</code> Worker
                when deployed with Cloudflare Email Routing.
              </li>
            </ol>
          </section>

          <Separator />

          <section id="mcp-server" className="space-y-3 scroll-mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                6. Read-Only MCP Server
              </h2>
              <RouteLink
                route="docs"
                label="See full MCP specs"
                onNavigate={onNavigate}
              />
            </div>
            <p className="text-[13.5px] leading-relaxed text-zinc-700">
              AI assistants and MCP clients (such as Kiro or the MCP Inspector)
              can query Resurrected Reader over its stateless{' '}
              <code className="font-mono">/mcp</code> endpoint (MCP spec{' '}
              <code className="font-mono">2026-07-28</code>).
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-zinc-700">
              <li>
                <strong>Connect to <code className="font-mono">/mcp</code>:</strong>{' '}
                Point any Streamable HTTP MCP client at{' '}
                <code className="font-mono">&lt;origin&gt;/mcp</code>. It runs in
                an explicit <strong>authless read-only demo scope</strong> with
                zero write or delete tools.
              </li>
              <li>
                <strong>Available read-only tools:</strong>{' '}
                <code className="font-mono">get_daily_briefing</code>,{' '}
                <code className="font-mono">get_feed_items</code>,{' '}
                <code className="font-mono">get_signal_scores</code>,{' '}
                <code className="font-mono">resurface_past_read</code>, and{' '}
                <code className="font-mono">list_newsletters</code>. All tools
                read shared public/Worker data and never access your private
                browser <code className="font-mono">localStorage</code>.
              </li>
              <li>
                <strong>AWS Docs verification:</strong> Exported Kiro spec
                bundles pair naturally with <code className="font-mono">aws-docs</code>{' '}
                configured in <code className="font-mono">.kiro/settings/mcp.json</code>{' '}
                to verify AWS service APIs and IAM quotas locally.
              </li>
            </ol>
          </section>

          <Separator />

          <section id="shortcuts" className="space-y-3 scroll-mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                7. Keyboard Shortcuts
              </h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onOpenShortcutsModal}
                  className="text-xs font-medium text-zinc-900 underline underline-offset-4 hover:text-zinc-600"
                >
                  Open ? modal
                </button>
                <RouteLink
                  route="shortcuts"
                  label="Full shortcuts table"
                  onNavigate={onNavigate}
                />
              </div>
            </div>
            <p className="text-[13.5px] leading-relaxed text-zinc-700">
              Navigate and act on stories without leaving the keyboard whenever
              focus is outside inputs and dialogs:
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {KEYBOARD_SHORTCUTS.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 text-xs"
                >
                  <span className="font-medium text-zinc-800">{entry.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {entry.keys.map((keyLabel) => (
                      <kbd
                        key={keyLabel}
                        className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-800"
                      >
                        {keyLabel}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          <section id="settings" className="space-y-3 scroll-mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                8. Settings, Personal Ranking &amp; Backups
              </h2>
              <RouteLink
                route="settings"
                label="Open Settings"
                onNavigate={onNavigate}
              />
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-zinc-700">
              <li>
                <strong>Personal ranking:</strong> Toggle on-device taste
                ranking or test with <span className="font-medium text-zinc-950">Demo profile: AWS-builder</span>;{' '}
                <span className="font-medium text-zinc-950">Reset my taste</span>{' '}
                clears your local preference vector without changing
                deterministic signal scores.
              </li>
              <li>
                <strong>Reading layout &amp; alerts:</strong> Choose{' '}
                <span className="font-medium text-zinc-950">Comfortable</span> or{' '}
                <span className="font-medium text-zinc-950">Compact</span> timeline
                density, set your startup filter tab, opt in to browser
                notifications for items scoring ≥85, and choose system or
                reduced motion.
              </li>
              <li>
                <strong>AI provider selection:</strong> Choose your preferred
                server-side summarization/embedding provider. Providers without
                a configured server key stay clearly disabled and never expose
                secrets to the browser.
              </li>
              <li>
                <strong>Portability &amp; reset:</strong> Download a complete
                JSON backup (<code className="font-mono">.json</code>) or OPML
                subscription list (<code className="font-mono">.opml</code>), or
                use the two-step <span className="font-medium text-zinc-950">Clear all local data</span>{' '}
                control to wipe local storage, IndexedDB vectors, and caches.
              </li>
            </ol>
          </section>
        </div>
      </div>
    </PageShell>
  )
}
