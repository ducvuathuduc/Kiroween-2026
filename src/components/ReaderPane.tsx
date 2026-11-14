import { useRef, useState, type RefObject } from 'react'
import {
  Activity,
  Check,
  Copy,
  ExternalLink,
  RotateCcw,
  Share2,
  Sparkles,
  Star,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { isNewSince } from '../lib/briefing'
import { copyPlainText, formatItemAsMarkdown } from '../lib/export'
import type { FeedItem } from '../lib/feeds'
import {
  feedMonogram,
  safeHttpUrl,
  summarize,
  timeAgo,
} from '../lib/format'
import type { GeminiSummary } from '../lib/kiroTask'
import { getProviderDisplayName } from '../lib/providers'
import type { ReaderDensity } from '../lib/storage'
import ItemThumbnail from './ItemThumbnail'
import KiroTaskModal from './KiroTaskModal'
import SafeHtml from './SafeHtml'
import ScoreBreakdownPopover from './ScoreBreakdownPopover'
import { Avatar, AvatarFallback } from './ui/avatar'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Separator } from './ui/separator'
import { Skeleton } from './ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface ReaderPaneProps {
  item: FeedItem | null
  extractedHtml?: string
  saved: boolean
  lastVisitIso: string | null
  density?: ReaderDensity
  geminiSummary?: GeminiSummary
  summaryLoading?: boolean
  summaryError?: string
  kiroModalOpen: boolean
  onKiroModalOpenChange: (open: boolean) => void
  readerHeadingRef?: RefObject<HTMLHeadingElement | null>
  onSummarize: (item: FeedItem) => void
  onShare: (item: FeedItem) => Promise<'shared' | 'copied' | 'cancelled'>
  onToggleSave: (id: string) => void
  onMarkUnread: (id: string) => void
  onOpenRadar?: () => void
}

export default function ReaderPane({
  item,
  extractedHtml,
  saved,
  lastVisitIso,
  density = 'comfortable',
  geminiSummary,
  summaryLoading,
  summaryError,
  kiroModalOpen,
  onKiroModalOpenChange,
  readerHeadingRef,
  onSummarize,
  onShare,
  onToggleSave,
  onMarkUnread,
  onOpenRadar,
}: ReaderPaneProps) {
  const [actionStatus, setActionStatus] = useState('')
  const statusTimerRef = useRef<number | null>(null)

  if (!item) {
    return (
      <main
        aria-label="Article reader"
        className="flex flex-1 items-center justify-center bg-white p-8 text-center"
      >
        <div className="max-w-sm">
          <h1 className="text-base font-semibold tracking-tight text-zinc-950">
            Ready to scan
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
            Select an item to read it here. Use{' '}
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700">
              j
            </kbd>{' '}
            /{' '}
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700">
              k
            </kbd>{' '}
            to move,{' '}
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700">
              Enter
            </kbd>{' '}
            to focus reader,{' '}
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700">
              ⌘K
            </kbd>{' '}
            to jump.
          </p>
        </div>
      </main>
    )
  }

  const originalUrl = safeHttpUrl(item.link)
  const summary = summarize(item.description)
  const isNew = isNewSince(item.pubDate, lastVisitIso)
  const metricLabel =
    'metricLabel' in item && typeof item.metricLabel === 'string'
      ? item.metricLabel
      : null
  const hasRichOrExtraHtml =
    Boolean(item.descriptionHtml) &&
    (/<[a-z][\s\S]*>/i.test(item.descriptionHtml ?? '') ||
      item.description.length > summary.length + 20)

  const flashStatus = (msg: string) => {
    if (statusTimerRef.current !== null) {
      window.clearTimeout(statusTimerRef.current)
    }
    setActionStatus(msg)
    statusTimerRef.current = window.setTimeout(() => {
      setActionStatus('')
      statusTimerRef.current = null
    }, 2000)
  }

  const handleShareClick = async () => {
    const result = await onShare(item)
    if (result === 'cancelled') return
    flashStatus(result === 'shared' ? 'Shared' : 'Link copied')
  }

  const handleCopyMarkdownClick = async () => {
    const md = formatItemAsMarkdown(item, geminiSummary)
    const ok = await copyPlainText(md)
    flashStatus(ok ? 'Markdown copied' : 'Copy failed')
  }

  return (
    <main aria-label="Article reader" className="flex min-w-0 flex-1 flex-col bg-white">
      <ScrollArea className="min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={`mx-auto max-w-3xl px-6 sm:px-8 ${
              density === 'compact' ? 'py-5' : 'py-7 sm:py-8'
            }`}
          >
            <article>
              <ItemThumbnail
                src={item.imageUrl}
                title={item.title}
                feedTitle={item.feedTitle}
                variant="cover"
                className="mb-5"
              />

              {item.sample && (
                <Badge
                  variant="outline"
                  className="mb-3 rounded-md border-amber-200 bg-amber-50 font-mono text-[11px] font-medium text-amber-800"
                >
                  SAMPLE DATA — offline fallback
                </Badge>
              )}

              <div className="flex flex-wrap items-center gap-2 text-[13px] text-zinc-500">
                <Avatar size="sm" className="size-5 border border-zinc-200">
                  <AvatarFallback className="bg-zinc-100 font-mono text-[9px] font-semibold text-zinc-800">
                    {feedMonogram(item.feedTitle)}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-zinc-900">{item.feedTitle}</span>
                <span aria-hidden="true" className="text-zinc-300">
                  ·
                </span>
                <time dateTime={item.pubDate}>{timeAgo(item.pubDate)}</time>
                {isNew && (
                  <>
                    <span aria-hidden="true" className="text-zinc-300">
                      ·
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-zinc-950">
                      New
                    </span>
                  </>
                )}
                {metricLabel && (
                  <>
                    <span aria-hidden="true" className="text-zinc-300">
                      ·
                    </span>
                    <span className="font-mono text-xs text-zinc-600">
                      {metricLabel}
                    </span>
                  </>
                )}
                <span aria-hidden="true" className="text-zinc-300">
                  ·
                </span>

                <ScoreBreakdownPopover
                  item={item}
                  animate
                  showLabel
                  onOpenRadar={onOpenRadar}
                />

                {onOpenRadar && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={onOpenRadar}
                    className="h-6 gap-1 px-1.5 text-[11px] text-zinc-500 hover:text-zinc-950"
                  >
                    <Activity aria-hidden="true" className="size-3" />
                    4D chart
                  </Button>
                )}
              </div>

              <h1
                ref={readerHeadingRef}
                tabIndex={-1}
                className="mt-3 text-[20px] leading-snug font-semibold tracking-tight text-zinc-950 outline-none"
              >
                {item.title}
              </h1>

              <div className="mt-5 flex flex-wrap items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onKiroModalOpenChange(true)}
                      className="h-8 gap-1.5 text-xs font-medium"
                    >
                      → Kiro task
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Export Kiro spec (e)</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={summaryLoading}
                      onClick={() => onSummarize(item)}
                      className="h-8 gap-1.5 border-zinc-200 text-xs font-medium shadow-none"
                    >
                      <Sparkles
                        aria-hidden="true"
                        className="size-3.5 text-zinc-600"
                      />
                      {summaryLoading
                        ? 'Summarizing…'
                        : geminiSummary
                          ? 'Re-summarize'
                          : 'Summarize'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Summarize article (s)</TooltipContent>
                </Tooltip>

                {originalUrl ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 border-zinc-200 text-xs font-medium shadow-none"
                      >
                        <a
                          href={originalUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          Open original
                          <ExternalLink aria-hidden="true" className="size-3.5" />
                        </a>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open original post (o)</TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled
                    className="h-8 text-xs"
                  >
                    No source URL
                  </Button>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-pressed={saved}
                      onClick={() => onToggleSave(item.id)}
                      className="h-8 gap-1.5 border-zinc-200 text-xs font-medium shadow-none"
                    >
                      <Star
                        aria-hidden="true"
                        className={`size-3.5 ${saved ? 'fill-zinc-950 text-zinc-950' : 'text-zinc-500'}`}
                      />
                      {saved ? 'Saved' : 'Save'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Toggle bookmark (b)</TooltipContent>
                </Tooltip>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleCopyMarkdownClick()}
                  className="h-8 gap-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
                >
                  {actionStatus === 'Markdown copied' ? (
                    <>
                      <Check aria-hidden="true" className="size-3.5" />
                      Markdown copied
                    </>
                  ) : (
                    <>
                      <Copy aria-hidden="true" className="size-3.5" />
                      Copy Markdown
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleShareClick()}
                  className="h-8 gap-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
                >
                  {actionStatus === 'Shared' || actionStatus === 'Link copied' ? (
                    <>
                      <Check aria-hidden="true" className="size-3.5" />
                      {actionStatus}
                    </>
                  ) : (
                    <>
                      <Share2 aria-hidden="true" className="size-3.5" />
                      Share
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onMarkUnread(item.id)}
                  className="h-8 gap-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
                >
                  <RotateCcw aria-hidden="true" className="size-3.5" />
                  Mark unread
                </Button>

                <span role="status" aria-live="polite" className="visually-hidden">
                  {actionStatus}
                </span>
              </div>

              {(summaryLoading || geminiSummary || summaryError) && (
                <section
                  aria-label="AI summary"
                  className="mt-5 rounded-md border border-zinc-200 bg-zinc-50/70 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-zinc-600 uppercase">
                      <Sparkles aria-hidden="true" className="size-3" />
                      {geminiSummary?.provider
                        ? `${getProviderDisplayName(geminiSummary.provider)} TL;DR`
                        : 'Gemini TL;DR'}
                    </span>
                    <Badge
                      variant="outline"
                      className="h-4 rounded px-1.5 font-mono text-[10px] font-normal text-zinc-500"
                    >
                      server-side
                    </Badge>
                  </div>

                  {summaryLoading ? (
                    <div className="mt-3 space-y-2" aria-busy="true">
                      <Skeleton className="h-3.5 w-[92%] bg-zinc-200/70" />
                      <Skeleton className="h-3.5 w-[78%] bg-zinc-200/70" />
                      <Skeleton className="h-3 w-[64%] bg-zinc-200/70" />
                    </div>
                  ) : summaryError ? (
                    <p role="alert" className="mt-2 text-xs text-red-600">
                      {summaryError}
                    </p>
                  ) : (
                    geminiSummary && (
                      <div className="mt-2.5 space-y-2.5 text-[13.5px] leading-relaxed text-zinc-800">
                        <p className="font-medium text-zinc-950">
                          {geminiSummary.tldr}
                        </p>
                        {geminiSummary.takeaways.length > 0 && (
                          <ul className="list-disc space-y-1 pl-4 text-[13px] text-zinc-700">
                            {geminiSummary.takeaways.map((point) => (
                              <li key={point}>{point}</li>
                            ))}
                          </ul>
                        )}
                        {geminiSummary.whyMatters && (
                          <p className="border-t border-zinc-200/80 pt-2 text-xs text-zinc-600">
                            <strong className="font-medium text-zinc-900">
                              Builder relevance:
                            </strong>{' '}
                            {geminiSummary.whyMatters}
                          </p>
                        )}
                      </div>
                    )
                  )}
                </section>
              )}

              <Separator className="my-6" />

              <p className="border-l-2 border-zinc-950 pl-4 text-[14.5px] leading-[1.7] text-zinc-800">
                {summary}
              </p>

              {extractedHtml ? (
                <section aria-label="Full article" className="mt-7">
                  <Separator className="mb-5" />
                  <h2 className="text-[11px] font-medium tracking-wider text-zinc-500 uppercase">Full article</h2>
                  <SafeHtml html={extractedHtml} className="feed-excerpt mt-3 text-[14px]" />
                </section>
              ) : hasRichOrExtraHtml && item.descriptionHtml && (
                <section aria-label="Full feed excerpt" className="mt-7">
                  <Separator className="mb-5" />
                  <h2 className="text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
                    Feed excerpt
                  </h2>
                  <SafeHtml
                    html={item.descriptionHtml}
                    className="feed-excerpt mt-3 text-[14px]"
                  />
                </section>
              )}
            </article>
          </motion.div>
        </AnimatePresence>
      </ScrollArea>

      <KiroTaskModal
        key={item.id}
        item={item}
        geminiSummary={geminiSummary}
        open={kiroModalOpen}
        onClose={() => onKiroModalOpenChange(false)}
      />
    </main>
  )
}
