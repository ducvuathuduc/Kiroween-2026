import { ArrowUpRight } from 'lucide-react'
import { routeToPath, type NavigableRoute } from '../lib/routes'
import { SIGNAL_DIMENSION_META } from '../lib/scoring'
import { KEYBOARD_SHORTCUTS } from '../lib/shortcuts'
import PageShell from './PageShell'
import { Button } from './ui/button'
import { Separator } from './ui/separator'

interface DocsPageProps {
  onNavigate: (route: NavigableRoute) => void
  onOpenShortcutsModal: () => void
}

const TOC_ITEMS = [
  { id: 'getting-started', label: 'Getting started' },
  { id: 'adding-feeds', label: 'Adding & proxying feeds' },
  { id: 'ai-providers', label: 'AI providers & semantic search' },
  { id: 'scoring-model', label: 'Deterministic scoring' },
  { id: 'opml', label: 'OPML import & export' },
  { id: 'kiro-export', label: 'Kiro task & .zip export' },
  { id: 'shortcuts', label: 'Keyboard shortcuts' },
  { id: 'mcp-tools', label: 'AWS Docs MCP tools' },
]

export default function DocsPage({
  onNavigate,
  onOpenShortcutsModal,
}: DocsPageProps) {
  return (
    <PageShell
      label="Documentation"
      currentRoute="docs"
      onNavigate={onNavigate}
      maxWidth="max-w-5xl"
    >
      <div className="border-b border-zinc-200 pb-6">
        <p className="font-mono text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
          Documentation · /docs
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
          Resurrected Reader Guide
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-zinc-600">
          Everything you need to ingest AWS & engineering feeds, inspect the
          deterministic 4-dimension scoring model, export Kiro spec bundles, and
          triage purely from the keyboard.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <aside className="lg:col-span-3">
          <nav
            aria-label="Documentation sections"
            className="space-y-1 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 lg:sticky lg:top-6"
          >
            <p className="px-2 pb-1 text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
              On this page
            </p>
            {TOC_ITEMS.map((item) => (
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
          <section id="getting-started" className="space-y-3 scroll-mt-6">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              1. Getting started
            </h2>
            <p className="text-[13.5px] leading-relaxed text-zinc-700">
              Resurrected Reader opens directly into a 3-pane Google Reader
              layout: <strong>Subscriptions &amp; Pulse</strong> on the left,{' '}
              <strong>Signal-ranked Timeline</strong> in the center, and{' '}
              <strong>Reader &amp; Action Pane</strong> on the right. Every item
              is automatically scored 0–100 on load so high-signal AWS and AI
              builder articles surface first.
            </p>
            <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3">
              {[
                {
                  title: 'Feed (/)' ,
                  body: 'Read, filter (All / High ≥70 / Unread / Saved), summarize, copy Markdown, and export Kiro specs.',
                  route: 'feed' as const,
                },
                {
                  title: 'Daily Briefing (/briefing)',
                  body: 'Synthesizes the top 5 highest-signal reads into structured Gemini TL;DRs with key takeaways.',
                  route: 'briefing' as const,
                },
                {
                  title: 'Signal Radar (/radar)',
                  body: 'Inspect live Recharts histograms, per-feed high-signal yield, and 4-axis item spider charts.',
                  route: 'radar' as const,
                },
              ].map((card) => (
                <div
                  key={card.route}
                  className="flex flex-col justify-between rounded-lg border border-zinc-200 p-4"
                >
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-950">
                      {card.title}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">
                      {card.body}
                    </p>
                  </div>
                  <a
                    href={routeToPath(card.route)}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                        return
                      }
                      e.preventDefault()
                      onNavigate(card.route)
                    }}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-zinc-900 hover:underline"
                  >
                    Open view
                    <ArrowUpRight className="size-3" />
                  </a>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          <section id="adding-feeds" className="space-y-3 scroll-mt-6">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              2. Adding &amp; proxying feeds
            </h2>
            <p className="text-[13.5px] leading-relaxed text-zinc-700">
              Paste any valid <code className="font-mono">http://</code> or{' '}
              <code className="font-mono">https://</code> RSS 2.0 or Atom feed
              URL into the sidebar input. URLs are validated with{' '}
              <code className="font-mono">safeHttpUrl()</code> before fetching,
              and per-feed failures are isolated so one unreachable source never
              breaks the rest of your subscriptions.
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-zinc-600">
              <li>
                <strong>Primary bridge:</strong> Same-origin Express route{' '}
                <code className="font-mono">GET /api/rss?url=...</code> with
                public-host SSRF validation, a 2 MB size cap, and a 5-minute TTL
                cache.
              </li>
              <li>
                <strong>Client fallbacks:</strong> Automatic failover to{' '}
                <code className="font-mono">api.rss2json.com</code> and{' '}
                <code className="font-mono">api.allorigins.win</code>{' '}
                <code className="font-mono">DOMParser</code> if the local route
                is unavailable in static hosting.
              </li>
              <li>
                <strong>Media extraction:</strong> Extracts real post covers
                from <code className="font-mono">media:content</code>,{' '}
                <code className="font-mono">media:thumbnail</code>,{' '}
                <code className="font-mono">enclosure</code>, inline HTML{' '}
                <code className="font-mono">&lt;img&gt;</code>, and cached{' '}
                <code className="font-mono">POST /api/og-images</code> lookups.
              </li>
            </ul>
          </section>

          <Separator />

          <section id="ai-providers" className="space-y-3 scroll-mt-6">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              3. AI providers &amp; semantic search
            </h2>
            <p className="text-[13.5px] leading-relaxed text-zinc-700">
              AI capabilities run server-side through Vercel AI SDK v7 above the
              direct <code className="font-mono">@google/genai</code> path.
              Gemini stays the default provider, with silent failover down{' '}
              <strong>Gemini → OpenAI → Anthropic → Amazon Bedrock</strong>{' '}
              whenever optional server keys are set. Unconfigured providers are
              skipped silently with zero errors or mock output.
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-zinc-600">
              <li>
                <strong>Provider discovery:</strong>{' '}
                <code className="font-mono">GET /api/providers</code> returns
                availability booleans to <strong>Settings</strong> without ever
                exposing keys to the browser.
              </li>
              <li>
                <strong>Structured TL;DRs:</strong>{' '}
                <code className="font-mono">POST /api/summarize</code> enforces{' '}
                <code className="font-mono">{'{ tldr, takeaways, whyMatters }'}</code>{' '}
                via <code className="font-mono">generateObject</code> with{' '}
                <code className="font-mono">generateText</code> and direct Gemini
                resilience.
              </li>
              <li>
                <strong>Semantic cosine search:</strong> Typing 2+ characters
                in the search box calls{' '}
                <code className="font-mono">POST /api/embed</code> using AI SDK{' '}
                <code className="font-mono">embed</code> +{' '}
                <code className="font-mono">cosineSimilarity</code>, falling
                back automatically to local keyword search when unavailable.
              </li>
            </ul>
          </section>

          <Separator />

          <section id="scoring-model" className="space-y-3 scroll-mt-6">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              4. How deterministic scoring works
            </h2>
            <p className="text-[13.5px] leading-relaxed text-zinc-700">
              Signal scores are <strong>100% deterministic</strong> — no LLM,
              API key, or opaque ranking runs in the scoring loop. Every item is
              evaluated across four normalized 0–100 dimensions via{' '}
              <code className="font-mono">explainScore()</code>:
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SIGNAL_DIMENSION_META.map((dim) => (
                <div
                  key={dim.key}
                  className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3.5"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-zinc-950">
                      {dim.label}
                    </span>
                    <span className="font-mono text-xs font-semibold tabular-nums text-zinc-700">
                      {dim.weight}%
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600">
                    {dim.key === 'relevance' &&
                      'Kiro (+45), AWS services (+35), Agent/MCP/A2A (+30), LLM/AI coding (+25), IAM/security (+20), builder ops (+15).'}
                    {dim.key === 'recency' &&
                      'Stepwise decay from 100 (≤6h) and 88 (≤24h) down to 14 (>14 days).'}
                    {dim.key === 'authority' &&
                      'Official AWS domain/feed bonuses, technical API/SDK cues, and summary depth.'}
                    {dim.key === 'novelty' &&
                      'Launch/GA announcements, actionable how-to verbs, and emerging builder patterns.'}
                  </p>
                </div>
              ))}
            </div>
            <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-100">
              <code>
                score = clamp(0, 100, round(0.42 * relevance + 0.24 * recency + 0.18 * authority + 0.16 * novelty))
              </code>
            </pre>
            <p className="text-xs text-zinc-500">
              Click any score badge in the Feed, Reader, or Daily Briefing to
              inspect the live <strong>Why this score</strong> breakdown popover.
            </p>
          </section>

          <Separator />

          <section id="opml" className="space-y-3 scroll-mt-6">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              5. OPML import &amp; export
            </h2>
            <p className="text-[13.5px] leading-relaxed text-zinc-700">
              Bring your classic Google Reader{' '}
              <code className="font-mono">subscriptions.xml</code> or any
              standard OPML 2.0 outline file. Use the upload/download icons
              above Subscriptions in the sidebar, or export from the header menu
              and Settings page. Duplicate URLs are skipped cleanly and invalid
              protocols are rejected.
            </p>
          </section>

          <Separator />

          <section id="kiro-export" className="space-y-3 scroll-mt-6">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              6. Kiro task &amp; .zip spec export
            </h2>
            <p className="text-[13.5px] leading-relaxed text-zinc-700">
              Clicking <strong>→ Kiro task</strong> (or pressing{' '}
              <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px]">
                e
              </kbd>
              ) opens a spec preview modal with four tabs:{' '}
              <code className="font-mono">tasks.md</code>,{' '}
              <code className="font-mono">requirements.md</code>,{' '}
              <code className="font-mono">design.md</code>, and a live Mermaid{' '}
              <code className="font-mono">pipeline</code> diagram. You can copy
              any file to the clipboard or download a pure client-side{' '}
              <code className="font-mono">&lt;slug&gt;-kiro-spec.zip</code>{' '}
              archive built with IEEE 802.3 CRC-32 PKZIP framing — ready to
              unzip directly under <code className="font-mono">.kiro/specs/</code>.
            </p>
          </section>

          <Separator />

          <section id="shortcuts" className="space-y-3 scroll-mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                7. Keyboard shortcuts
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onOpenShortcutsModal}
                  className="h-7 text-xs shadow-none"
                >
                  Open ? modal
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigate('shortcuts')}
                  className="h-7 text-xs shadow-none"
                >
                  Full reference
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {KEYBOARD_SHORTCUTS.slice(0, 8).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-xs"
                >
                  <span className="font-medium text-zinc-800">{s.label}</span>
                  <span className="flex items-center gap-1">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-800"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          <section id="mcp-tools" className="space-y-3 scroll-mt-6">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              8. AWS Documentation MCP tools
            </h2>
            <p className="text-[13.5px] leading-relaxed text-zinc-700">
              This repository configures the official AWS Documentation MCP
              server inside{' '}
              <code className="font-mono">.kiro/settings/mcp.json</code> so
              exported specs can verify live AWS APIs, quotas, and IAM guidance
              using read-only tools (<code className="font-mono">search_documentation</code>,{' '}
              <code className="font-mono">read_documentation</code>, and{' '}
              <code className="font-mono">recommend</code>):
            </p>
            <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-100">
              <code>{`{
  "mcpServers": {
    "aws-docs": {
      "command": "uvx",
      "args": ["awslabs.aws-documentation-mcp-server@latest"],
      "env": {
        "FASTMCP_LOG_LEVEL": "ERROR",
        "AWS_DOCUMENTATION_PARTITION": "aws"
      }
    }
  }
}`}</code>
            </pre>
          </section>
        </div>
      </div>
    </PageShell>
  )
}
