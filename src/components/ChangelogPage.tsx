import type { NavigableRoute } from '../lib/routes'
import PageShell from './PageShell'

interface ChangelogPageProps {
  onNavigate: (route: NavigableRoute) => void
}

interface ReleaseEntry {
  version: string
  title: string
  summary: string
  changes: string[]
}

const RELEASES: ReadonlyArray<ReleaseEntry> = [
  {
    version: 'v0.7.0',
    title: 'Vercel AI SDK v7 Multi-Provider Router & Semantic Cosine Search',
    summary:
      'Layered Vercel AI SDK v7 above @google/genai with a silent server-side fallback chain and embedding-powered search.',
    changes: [
      'Integrated ai@7.0.172 alongside @ai-sdk/google, @ai-sdk/openai, @ai-sdk/anthropic, @ai-sdk/amazon-bedrock, and @ai-sdk/react while preserving @google/genai as the direct Gemini path.',
      'Rewrote POST /api/summarize using generateObject and generateText across Gemini → OpenAI → Anthropic → Amazon Bedrock, silently skipping unconfigured providers.',
      'Added GET /api/providers and a live Settings provider picker that unlocks OpenAI, Anthropic, and Bedrock only when server credentials are configured.',
      'Added POST /api/embed using AI SDK embed/embedMany and cosineSimilarity for timeline search with automatic keyword fallback.',
    ],
  },
  {
    version: 'v0.6.0',
    title: 'Production routes, Settings, Feed Health & Developer Ergonomics',
    summary:
      'Added full History-routed documentation and operational pages alongside developer-friendly shortcuts and data portability.',
    changes: [
      'Real History API routes for /docs, /shortcuts, /settings, /about, /changelog, /privacy, and a 404 Not Found view.',
      'Complete keyboard command set: j/k navigate, Enter focus reader, / search, ⌘K palette, o open source, s summarize, e export Kiro task, b bookmark, r refresh, ? shortcuts modal.',
      'Copy item as formatted Markdown directly from the Reader pane.',
      'Full browser backup export as JSON plus two-step local data reset.',
      'Per-feed health dashboard inside /system showing status, last fetched clock, item count, and error messages.',
      'Settings page controlling timeline density (comfortable/compact), default startup filter, high-signal alerts (≥85), and reduced motion.',
    ],
  },
  {
    version: 'v0.5.0',
    title: 'Daily Briefing, Cmd+K Command Palette & Why-This-Score Breakdown',
    summary:
      'Turned the radar into a keyboard-first daily briefing workspace with transparent deterministic score explanations.',
    changes: [
      'Added Cmd+K / Ctrl+K fuzzy Command Palette across views, feeds, Community Pulse, and live articles.',
      'Built Daily Briefing view synthesizing top 5 high-signal items with concurrent Gemini TL;DR generation.',
      'Shared ScoreBreakdownPopover inspecting Relevance (42%), Recency (24%), Authority (18%), Novelty (16%), and matched signals.',
      'Added rr.lastVisit.v1 session markers ("New" badges and "Mark caught up" bar) and feed health HoverCards.',
    ],
  },
  {
    version: 'v0.4.0',
    title: 'Visual Signal Radar, Mermaid Architecture & Live Feed Thumbnails',
    summary:
      'Replaced walls of text with real RSS media extraction, server-cached OpenGraph enrichment, and Recharts analytics.',
    changes: [
      'Extracted real feed images (media:content, media:thumbnail, enclosure, inline HTML img) plus server-side /api/og-images.',
      'Recalibrated deterministic 4-dimension scoring model so AWS & AI coding posts naturally cross the ≥70 signal threshold.',
      'Built Signal Radar view (Recharts score histogram, per-feed yield chart, and 4D item spider chart) and Mermaid pipeline diagrams.',
      'Added motion/react animated score count-up, skeleton shimmer, and reduced-motion aware pane transitions.',
    ],
  },
  {
    version: 'v0.3.0',
    title: 'Kiro Spec .zip Bundles, AWS Docs MCP, Gemini TL;DR & Pulse',
    summary:
      'Connected high-signal reads straight into Kiro specs, live developer pulse, and server-side AI summaries.',
    changes: [
      'Pure client-side PKZIP generator exporting requirements.md, design.md, and tasks.md into <slug>-kiro-spec.zip.',
      'Registered awslabs.aws-documentation-mcp-server inside .kiro/settings/mcp.json.',
      'Added Express server route POST /api/summarize (@google/genai) keeping GEMINI_API_KEY strictly on the server.',
      'Integrated Hacker News Firebase top stories, GitHub topic:aws repositories, Google Reader OPML 2.0 import/export, Web Share, and browser Notifications.',
    ],
  },
  {
    version: 'v0.2.0',
    title: 'Vercel Geist UI & shadcn/ui Overhaul',
    summary:
      'Rebuilt the interface on Vercel monochrome tokens, self-hosted Geist fonts, and Radix primitives.',
    changes: [
      'Self-hosted @fontsource-variable/geist and @fontsource-variable/geist-mono typography with tabular numerals.',
      'Installed shadcn/ui primitives (Avatar, Badge, Button, Dialog, DropdownMenu, HoverCard, Input, ScrollArea, Separator, Skeleton, Tabs, Tooltip).',
      'Integrated @ui-sdk/react Listbox roving focus navigation and translucent backdrop-blur glass TopBar & Dialogs.',
    ],
  },
  {
    version: 'v0.1.0',
    title: 'Resurrected Reader v1 Core',
    summary:
      'Initial 3-pane RSS/Atom reader scaffold with deterministic scoring, DOMParser ingestion, localStorage persistence, and offline sample fallback.',
    changes: [
      '3-pane Google Reader shell (Subscriptions / Timeline / Reader Pane) built with React 19, Vite 8, TypeScript strict, and Tailwind CSS v4.',
      'Sanitized RSS excerpt rendering and initial Spec Kit + Kiro steering setup.',
    ],
  },
]

export default function ChangelogPage({ onNavigate }: ChangelogPageProps) {
  return (
    <PageShell
      label="Changelog"
      currentRoute="changelog"
      onNavigate={onNavigate}
    >
      <div className="border-b border-zinc-200 pb-6">
        <p className="font-mono text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
          Changelog · /changelog
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
          Release &amp; Build History
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-zinc-600">
          Verified engineering milestones recorded from the Resurrected Reader
          specification and build history.
        </p>
      </div>

      <ol className="space-y-6">
        {RELEASES.map((release) => (
          <li
            key={release.version}
            className="rounded-lg border border-zinc-200 bg-white p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="font-mono text-xs font-semibold text-zinc-950">
                {release.version}
              </span>
              <span aria-hidden="true" className="text-zinc-300">
                ·
              </span>
              <h2 className="text-base font-semibold tracking-tight text-zinc-950">
                {release.title}
              </h2>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-600">
              {release.summary}
            </p>
            <ul className="mt-3.5 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-zinc-700">
              {release.changes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </PageShell>
  )
}
