import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, RefreshCw, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { isNewSince, runWithConcurrency, selectDailyBriefingItems } from '../lib/briefing'
import type { FeedItem } from '../lib/feeds'
import { summarize, timeAgo } from '../lib/format'
import type { GeminiSummary } from '../lib/kiroTask'
import type { NavigableRoute } from '../lib/routes'
import ItemThumbnail from './ItemThumbnail'
import KiroTaskModal from './KiroTaskModal'
import PageShell from './PageShell'
import ScoreBreakdownPopover from './ScoreBreakdownPopover'
import { Button } from './ui/button'
import { Skeleton } from './ui/skeleton'

interface DailyBriefingViewProps {
  items: FeedItem[]
  summaries: Record<string, GeminiSummary>
  summaryLoadingIds: Record<string, boolean>
  summaryErrors: Record<string, string>
  lastVisitIso: string | null
  onSummarize: (item: FeedItem) => Promise<void>
  onOpenInReader: (itemId: string) => void
  onOpenRadar: () => void
  onNavigate: (route: NavigableRoute) => void
}

export default function DailyBriefingView({
  items,
  summaries,
  summaryLoadingIds,
  summaryErrors,
  lastVisitIso,
  onSummarize,
  onOpenInReader,
  onOpenRadar,
  onNavigate,
}: DailyBriefingViewProps) {
  const topFive = useMemo(() => selectDailyBriefingItems(items, 5), [items])
  const [modalItem, setModalItem] = useState<FeedItem | null>(null)
  const [batchRunning, setBatchRunning] = useState(false)
  const autoAttemptedRef = useRef<Set<string>>(new Set())

  const readyCount = topFive.filter((it) => Boolean(summaries[it.id])).length
  const anyTopLoading = topFive.some((it) => Boolean(summaryLoadingIds[it.id]))

  // Synthesize missing Gemini TL;DRs with bounded concurrency when Briefing opens
  useEffect(() => {
    const missing = topFive.filter(
      (it) =>
        !summaries[it.id] &&
        !summaryErrors[it.id] &&
        !summaryLoadingIds[it.id] &&
        !autoAttemptedRef.current.has(it.id),
    )
    if (missing.length === 0) return

    for (const item of missing) {
      autoAttemptedRef.current.add(item.id)
    }
    void runWithConcurrency(missing, 2, onSummarize)
  }, [topFive, summaries, summaryErrors, summaryLoadingIds, onSummarize])

  const handleGenerateMissing = async () => {
    const missing = topFive.filter(
      (it) => !summaries[it.id] && !summaryLoadingIds[it.id],
    )
    if (missing.length === 0) return
    setBatchRunning(true)
    try {
      await runWithConcurrency(missing, 2, onSummarize)
    } finally {
      setBatchRunning(false)
    }
  }

  return (
    <PageShell
      label="Daily briefing digest"
      currentRoute="briefing"
      onNavigate={onNavigate}
    >
      <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-5">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-zinc-950">
                Daily Briefing
              </h1>
              <p className="mt-1 text-[13px] text-zinc-500">
                Top 5 highest-signal reads distilled into Gemini TL;DRs (
                <span className="font-mono font-medium tabular-nums text-zinc-900">
                  {readyCount}/{topFive.length}
                </span>{' '}
                synthesized).
              </p>
            </div>

            {topFive.some((it) => !summaries[it.id]) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={batchRunning || anyTopLoading}
                onClick={() => void handleGenerateMissing()}
                className="h-8 gap-1.5 border-zinc-200 text-xs font-medium shadow-none"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={`size-3.5 ${batchRunning || anyTopLoading ? 'animate-spin' : ''}`}
                />
                Generate remaining TL;DRs
              </Button>
            )}
          </div>

          {topFive.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-200 p-10 text-center text-[13px] text-zinc-500">
              No feed items loaded yet. Refresh feeds to generate your Daily Briefing.
            </div>
          ) : (
            <ol className="space-y-4">
              {topFive.map((item, idx) => {
                const aiSummary = summaries[item.id]
                const isLoading = Boolean(summaryLoadingIds[item.id])
                const err = summaryErrors[item.id]
                const isNew = isNewSince(item.pubDate, lastVisitIso)

                return (
                  <motion.li
                    key={item.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.18,
                      delay: idx * 0.04,
                      ease: 'easeOut',
                    }}
                    className="rounded-lg border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="flex items-center gap-3 sm:block">
                        <span className="font-mono text-xs font-semibold tabular-nums text-zinc-400">
                          0{idx + 1}
                        </span>
                        <ItemThumbnail
                          src={item.imageUrl}
                          title={item.title}
                          feedTitle={item.feedTitle}
                          className="sm:mt-2"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                            <span className="font-medium text-zinc-800">
                              {item.feedTitle}
                            </span>
                            <span aria-hidden="true" className="text-zinc-300">
                              ·
                            </span>
                            <time dateTime={item.pubDate}>
                              {timeAgo(item.pubDate)}
                            </time>
                            {isNew && (
                              <>
                                <span
                                  aria-hidden="true"
                                  className="text-zinc-300"
                                >
                                  ·
                                </span>
                                <span className="font-mono text-[11px] font-semibold text-zinc-950">
                                  New
                                </span>
                              </>
                            )}
                          </div>

                          <ScoreBreakdownPopover
                            item={item}
                            showLabel
                            align="end"
                            onOpenRadar={onOpenRadar}
                          />
                        </div>

                        <h2 className="mt-2 text-base font-semibold leading-snug tracking-tight text-zinc-950">
                          {item.title}
                        </h2>

                        <div className="mt-3">
                          {isLoading ? (
                            <div className="space-y-2" aria-busy="true">
                              <Skeleton className="h-3.5 w-[92%] bg-zinc-200/70" />
                              <Skeleton className="h-3.5 w-[76%] bg-zinc-200/70" />
                            </div>
                          ) : aiSummary ? (
                            <div className="space-y-2 text-[13.5px] leading-relaxed text-zinc-800">
                              <p className="flex items-start gap-1.5 font-medium text-zinc-900">
                                <Sparkles
                                  aria-hidden="true"
                                  className="mt-1 size-3.5 shrink-0 text-zinc-600"
                                />
                                <span>{aiSummary.tldr}</span>
                              </p>
                              {aiSummary.takeaways.length > 0 && (
                                <ul className="list-disc space-y-1 pl-5 text-[13px] text-zinc-600">
                                  {aiSummary.takeaways.slice(0, 3).map((pt) => (
                                    <li key={pt}>{pt}</li>
                                  ))}
                                </ul>
                              )}
                              {aiSummary.whyMatters && (
                                <p className="text-xs text-zinc-500">
                                  <strong className="font-medium text-zinc-800">
                                    Why it matters:
                                  </strong>{' '}
                                  {aiSummary.whyMatters}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <p className="text-[13.5px] leading-relaxed text-zinc-600">
                                {summarize(item.description, 2)}
                              </p>
                              {err && (
                                <p className="text-[11px] text-zinc-500">
                                  AI TL;DR unavailable ({err}). Showing extractive summary.
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setModalItem(item)}
                            className="h-7 px-2.5 text-xs font-medium"
                          >
                            → Kiro task
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenInReader(item.id)}
                            className="h-7 gap-1 border-zinc-200 px-2.5 text-xs shadow-none"
                          >
                            Open in Reader
                            <ArrowUpRight className="size-3.5" />
                          </Button>
                          {!aiSummary && !isLoading && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => void onSummarize(item)}
                              className="h-7 gap-1 px-2.5 text-xs text-zinc-600 hover:text-zinc-950"
                            >
                              <Sparkles aria-hidden="true" className="size-3" />
                              Summarize
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.li>
                )
              })}
            </ol>
          )}
      </div>

      <KiroTaskModal
        key={modalItem?.id ?? 'none'}
        item={modalItem}
        geminiSummary={modalItem ? summaries[modalItem.id] : undefined}
        open={Boolean(modalItem)}
        onClose={() => setModalItem(null)}
      />
    </PageShell>
  )
}
