import { useMemo, useState } from 'react'
import { AlertCircle, ArrowUpRight, CheckCircle2, Clock, RefreshCw } from 'lucide-react'
import type { FeedHealth } from '../lib/briefing'
import type { FeedItem, FeedSource } from '../lib/feeds'
import { formatRefreshTime, scoreBadgeClass, timeAgo } from '../lib/format'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  buildFeedActivity,
  buildItemRadarData,
  buildScoreHistogram,
  computeRadarSummary,
  getItemDimensions,
} from '../lib/radar'
import { explainScore, SIGNAL_DIMENSION_META } from '../lib/scoring'
import type { NavigableRoute } from '../lib/routes'
import MermaidDiagram from './MermaidDiagram'
import PageShell from './PageShell'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Separator } from './ui/separator'

export const SYSTEM_PIPELINE_MERMAID = `flowchart LR
  A[RSS / Atom & Community Pulse] --> B[Extract Media & Normalize UTC]
  B --> C[4D Deterministic Score]
  C -->|Relevance 42% · Recency 24% · Authority 18% · Novelty 16%| D[Signal Radar & Reader]
  D -->|High Signal >= 70| E[Gemini TL;DR via /api/summarize]
  D --> F[Kiro Spec Bundle .zip]
  F --> G[AWS Docs MCP Search & Ship]`

interface SignalRadarViewProps {
  mode: 'radar' | 'system'
  items: FeedItem[]
  selectedItem: FeedItem | null
  feeds: FeedSource[]
  feedHealth: Record<string, FeedHealth>
  feedErrors: Record<string, string>
  loading: boolean
  onRefresh: () => void
  onSelectFeed: (feedId: string) => void
  onSelectAndOpen: (itemId: string) => void
  onNavigate: (route: NavigableRoute) => void
}

export default function SignalRadarView({
  mode,
  items,
  selectedItem,
  feeds,
  feedHealth,
  feedErrors,
  loading,
  onRefresh,
  onSelectFeed,
  onSelectAndOpen,
  onNavigate,
}: SignalRadarViewProps) {
  const [inspectedId, setInspectedId] = useState<string>('')

  const summary = useMemo(() => computeRadarSummary(items), [items])
  const histogram = useMemo(() => buildScoreHistogram(items), [items])
  const feedActivity = useMemo(() => buildFeedActivity(items), [items])

  const sortedForPicker = useMemo(
    () => [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    [items],
  )

  const focusItem = useMemo(() => {
    if (inspectedId) {
      const explicit = items.find((it) => it.id === inspectedId)
      if (explicit) return explicit
    }
    if (selectedItem && items.some((it) => it.id === selectedItem.id)) {
      return selectedItem
    }
    return sortedForPicker[0] ?? null
  }, [inspectedId, items, selectedItem, sortedForPicker])

  const radarData = useMemo(
    () => (focusItem ? buildItemRadarData(focusItem) : []),
    [focusItem],
  )
  const focusDims = focusItem ? getItemDimensions(focusItem) : null
  const focusBreakdown = focusItem
    ? explainScore(focusItem.title, focusItem.description, focusItem.pubDate, {
        feedId: focusItem.feedId,
        feedTitle: focusItem.feedTitle,
        link: focusItem.link,
      })
    : null

  if (mode === 'system') {
    const healthyCount = feeds.filter((f) => feedHealth[f.id]?.ok).length
    const errorCount = feeds.filter((f) => feedHealth[f.id] && !feedHealth[f.id].ok).length

    return (
      <PageShell
        label="System architecture and feed health"
        currentRoute="system"
        onNavigate={onNavigate}
        maxWidth="max-w-5xl"
      >
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-5">
          <div>
            <p className="font-mono text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
              System &amp; Health · /system
            </p>
            <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-950">
              Feed Health &amp; Signal Pipeline
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-zinc-600">
              Monitor live ingestion health across your subscribed feeds, inspect
              the scoring rubric, and trace how reads become Kiro spec bundles.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={onRefresh}
            className="h-8 gap-1.5 border-zinc-200 text-xs shadow-none"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-3.5 ${loading ? 'animate-spin' : ''}`}
            />
            {loading ? 'Checking feeds…' : 'Refresh all feeds'}
          </Button>
        </div>

        <section aria-label="Feed health dashboard" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-medium tracking-wider text-zinc-500 uppercase">
              Feed Health Dashboard
            </h2>
            <p className="font-mono text-xs tabular-nums text-zinc-600">
              {healthyCount}/{feeds.length} healthy
              {errorCount > 0 ? ` · ${errorCount} failing` : ''}
            </p>
          </div>

          {feeds.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-200 p-8 text-center text-[13px] text-zinc-500">
              No RSS or Atom feeds subscribed yet. Add a feed in the left
              sidebar or import an OPML file.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
                    <th className="px-4 py-2.5">Source</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Items</th>
                    <th className="hidden px-4 py-2.5 sm:table-cell">Last fetched</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 text-xs">
                  {feeds.map((feed) => {
                    const health = feedHealth[feed.id]
                    const errText = health?.error || feedErrors[feed.id]
                    return (
                      <tr key={feed.id} className="hover:bg-zinc-50/60">
                        <td className="max-w-xs px-4 py-3">
                          <p className="truncate font-medium text-zinc-950">
                            {feed.title}
                          </p>
                          <p className="truncate font-mono text-[11px] text-zinc-500">
                            {feed.url}
                          </p>
                          {errText && (
                            <p className="mt-1 text-[11px] text-red-600">
                              Error: {errText}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {!health ? (
                            <span className="inline-flex items-center gap-1 text-zinc-500">
                              <Clock aria-hidden="true" className="size-3.5" />
                              Pending
                            </span>
                          ) : health.ok ? (
                            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                              <CheckCircle2 aria-hidden="true" className="size-3.5" />
                              Healthy
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-medium text-red-600">
                              <AlertCircle aria-hidden="true" className="size-3.5" />
                              Fetch error
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-zinc-900">
                          {health ? health.itemCount : '—'}
                        </td>
                        <td className="hidden px-4 py-3 font-mono tabular-nums text-zinc-600 sm:table-cell">
                          {health
                            ? `${formatRefreshTime(health.lastFetchedAt)} (${timeAgo(health.lastFetchedAt)})`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => onSelectFeed(feed.id)}
                            className="h-7 gap-1 text-xs text-zinc-700 hover:text-zinc-950"
                          >
                            View feed
                            <ArrowUpRight className="size-3" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <MermaidDiagram
          chart={SYSTEM_PIPELINE_MERMAID}
          caption="End-to-end deterministic scoring, Gemini TL;DR summarization, and Kiro spec generation pipeline."
        />

            <section aria-label="Deterministic scoring weights">
              <h2 className="text-xs font-medium tracking-wider text-zinc-500 uppercase">
                4-Dimension Deterministic Rubric (0–100)
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    name: 'Relevance',
                    weight: '42%',
                    detail:
                      'Tracks Kiro, AWS services, Bedrock/AgentCore, MCP, A2A, LLMs, and IAM/security keywords.',
                  },
                  {
                    name: 'Recency',
                    weight: '24%',
                    detail:
                      'Time-decay curve from 100 (≤6h) and 88 (≤24h) down to 14 (>14d).',
                  },
                  {
                    name: 'Authority',
                    weight: '18%',
                    detail:
                      'Weights official AWS engineering feeds, technical API/SDK/IAM depth, and summary length.',
                  },
                  {
                    name: 'Novelty',
                    weight: '16%',
                    detail:
                      'Detects GA launches, releases, hands-on implementation titles, and emerging builder tooling.',
                  },
                ].map((dim) => (
                  <div
                    key={dim.name}
                    className="rounded-lg border border-zinc-200 bg-white p-4"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-semibold text-zinc-950">
                        {dim.name}
                      </span>
                      <span className="font-mono text-xs font-semibold tabular-nums text-zinc-700">
                        {dim.weight}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-600">
                      {dim.detail}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section
              aria-label="Workspace integrations"
              className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-5"
            >
              <h2 className="text-xs font-medium tracking-wider text-zinc-500 uppercase">
                Verified Integrations
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-4 text-xs text-zinc-700 sm:grid-cols-3">
                <div>
                  <p className="font-semibold text-zinc-950">
                    Kiro Spec Bundle + MCP
                  </p>
                  <p className="mt-1 leading-relaxed text-zinc-600">
                    Pure client-side PKZIP download (<code className="font-mono">requirements.md</code>,{' '}
                    <code className="font-mono">design.md</code>,{' '}
                    <code className="font-mono">tasks.md</code>) and{' '}
                    <code className="font-mono">awslabs.aws-documentation-mcp-server</code>{' '}
                    in <code className="font-mono">.kiro/settings/mcp.json</code>.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-950">
                    Server-Side Gemini TL;DR
                  </p>
                  <p className="mt-1 leading-relaxed text-zinc-600">
                    Express route <code className="font-mono">POST /api/summarize</code>{' '}
                    calls <code className="font-mono">@google/genai</code>{' '}
                    without exposing secrets to the browser.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-950">
                    Live Feeds, Pulse & OPML
                  </p>
                  <p className="mt-1 leading-relaxed text-zinc-600">
                    RSS/Atom + Hacker News Firebase + GitHub{' '}
                    <code className="font-mono">topic:aws</code> search, OPML
                    2.0 import/export, Web Share, and <code className="font-mono">og:image</code>{' '}
                    cover extraction.
                  </p>
                </div>
              </div>
            </section>
      </PageShell>
    )
  }

  return (
    <PageShell
      label="Signal radar analytics"
      currentRoute="radar"
      onNavigate={onNavigate}
      maxWidth="max-w-6xl"
    >
      <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-zinc-950">
                Signal Radar
              </h1>
              <p className="mt-0.5 text-[13px] text-zinc-500">
                Live distribution and 4-dimension breakdown across{' '}
                <span className="font-mono font-medium tabular-nums text-zinc-900">
                  {summary.total}
                </span>{' '}
                loaded items.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Total loaded', value: String(summary.total) },
              {
                label: 'High signal (≥70)',
                value: `${summary.highCount} (${summary.highShare}%)`,
              },
              { label: 'Mean signal', value: `${summary.avgScore}/100` },
              { label: 'Peak score', value: `${summary.topScore}/100` },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-3"
              >
                <p className="text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
                  {kpi.label}
                </p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-zinc-950">
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>

          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-200 p-10 text-center text-[13px] text-zinc-500">
              No feed items loaded yet. Refresh feeds to populate Signal Radar.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <section
                aria-label="Score distribution histogram"
                className="rounded-lg border border-zinc-200 bg-white p-4 lg:col-span-6"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-950">
                      Score distribution
                    </h2>
                    <p className="text-xs text-zinc-500">
                      Emerald highlights items crossing the ≥70 high-signal bar
                    </p>
                  </div>
                </div>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={histogram}
                      margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#e4e4e7"
                      />
                      <XAxis
                        dataKey="bucket"
                        tick={{ fontSize: 11, fill: '#52525b' }}
                        axisLine={{ stroke: '#e4e4e7' }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#71717a' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <RechartsTooltip
                        cursor={{ fill: '#f4f4f5' }}
                        contentStyle={{
                          borderRadius: '8px',
                          borderColor: '#e4e4e7',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="count" name="Items" radius={[4, 4, 0, 0]}>
                        {histogram.map((entry) => (
                          <Cell
                            key={entry.bucket}
                            fill={entry.isHigh ? '#059669' : '#18181b'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section
                aria-label="Per-feed activity"
                className="rounded-lg border border-zinc-200 bg-white p-4 lg:col-span-6"
              >
                <div className="mb-3">
                  <h2 className="text-sm font-semibold text-zinc-950">
                    Per-feed activity
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Total items vs high-signal (≥70) yield per source
                  </p>
                </div>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={feedActivity}
                      margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#e4e4e7"
                      />
                      <XAxis
                        dataKey="feed"
                        interval={0}
                        tick={{ fontSize: 11, fill: '#52525b' }}
                        axisLine={{ stroke: '#e4e4e7' }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#71717a' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <RechartsTooltip
                        cursor={{ fill: '#f4f4f5' }}
                        contentStyle={{
                          borderRadius: '8px',
                          borderColor: '#e4e4e7',
                          fontSize: '12px',
                        }}
                      />
                      <Bar
                        dataKey="total"
                        name="Total items"
                        fill="#d4d4d8"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="high"
                        name="High signal (≥70)"
                        fill="#09090b"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {focusItem && focusDims && (
                <section
                  aria-label="4-dimension signal radar for selected item"
                  className="rounded-lg border border-zinc-200 bg-white p-5 lg:col-span-12"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`rounded-md font-mono text-[11px] font-medium tabular-nums ${scoreBadgeClass(focusItem.score ?? 0)}`}
                        >
                          {focusItem.score ?? 0} signal
                        </Badge>
                        <span className="text-xs font-medium text-zinc-500">
                          {focusItem.feedTitle}
                        </span>
                      </div>
                      <h2 className="mt-1.5 text-base font-semibold tracking-tight text-zinc-950">
                        {focusItem.title}
                      </h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor="radar-item-select" className="visually-hidden">
                        Inspect item signal dimensions
                      </label>
                      <select
                        id="radar-item-select"
                        value={focusItem.id}
                        onChange={(e) => setInspectedId(e.target.value)}
                        className="h-8 max-w-xs rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-800 outline-none focus-visible:border-zinc-950"
                      >
                        {sortedForPicker.slice(0, 30).map((it) => (
                          <option key={it.id} value={it.id}>
                            [{it.score ?? 0}] {it.title.slice(0, 56)}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onSelectAndOpen(focusItem.id)}
                        className="h-8 gap-1 border-zinc-200 text-xs shadow-none"
                      >
                        Open in Reader
                        <ArrowUpRight className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-12">
                    <div className="h-64 w-full md:col-span-5">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart
                          cx="50%"
                          cy="50%"
                          outerRadius="66%"
                          data={radarData}
                        >
                          <PolarGrid stroke="#e4e4e7" />
                          <PolarAngleAxis
                            dataKey="dimension"
                            tick={{ fontSize: 12, fill: '#27272a' }}
                          />
                          <PolarRadiusAxis
                            angle={30}
                            domain={[0, 100]}
                            tick={{ fontSize: 10, fill: '#71717a' }}
                          />
                          <Radar
                            name="Signal"
                            dataKey="value"
                            stroke="#09090b"
                            fill="#18181b"
                            fillOpacity={0.14}
                          />
                          <RechartsTooltip
                            contentStyle={{
                              borderRadius: '8px',
                              borderColor: '#e4e4e7',
                              fontSize: '12px',
                            }}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="space-y-4 md:col-span-7">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {SIGNAL_DIMENSION_META.map((dim) => (
                          <div
                            key={dim.key}
                            className="rounded-md border border-zinc-200 bg-zinc-50/60 p-3"
                          >
                            <span className="block text-[11px] text-zinc-500">
                              {dim.label} ({dim.weight}%)
                            </span>
                            <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-zinc-950">
                              {focusDims[dim.key]}/100
                            </span>
                          </div>
                        ))}
                      </div>

                      {focusBreakdown && focusBreakdown.reasons.length > 0 && (
                        <div>
                          <p className="text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
                            Matched deterministic signals
                          </p>
                          <ul className="mt-2 grid grid-cols-1 gap-1.5 text-xs text-zinc-700 sm:grid-cols-2">
                            {focusBreakdown.reasons.map((r) => (
                              <li
                                key={`${r.dimension}-${r.label}`}
                                className="flex items-center justify-between rounded border border-zinc-100 bg-zinc-50/40 px-2.5 py-1.5"
                              >
                                <span className="truncate">{r.label}</span>
                                <span className="ml-2 shrink-0 font-mono font-medium tabular-nums text-zinc-950">
                                  +{r.points}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}
      </div>
    </PageShell>
  )
}
