import { useState } from 'react'
import { ExternalLink, RotateCcw, Star } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { FeedItem } from '../lib/feeds'
import {
  feedMonogram,
  safeHttpUrl,
  scoreBadgeClass,
  summarize,
  timeAgo,
} from '../lib/format'
import { explainScore } from '../lib/scoring'
import KiroTaskModal from './KiroTaskModal'
import SafeHtml from './SafeHtml'
import { Avatar, AvatarFallback } from './ui/avatar'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card'
import { ScrollArea } from './ui/scroll-area'
import { Separator } from './ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface ReaderPaneProps {
  item: FeedItem | null
  saved: boolean
  onToggleSave: (id: string) => void
  onMarkUnread: (id: string) => void
}

export default function ReaderPane({
  item,
  saved,
  onToggleSave,
  onMarkUnread,
}: ReaderPaneProps) {
  const [modalOpen, setModalOpen] = useState(false)

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
              ↑
            </kbd>{' '}
            /{' '}
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700">
              ↓
            </kbd>{' '}
            or{' '}
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700">
              j
            </kbd>{' '}
            /{' '}
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700">
              k
            </kbd>{' '}
            to move,{' '}
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700">
              s
            </kbd>{' '}
            to save,{' '}
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700">
              r
            </kbd>{' '}
            to refresh.
          </p>
        </div>
      </main>
    )
  }

  const originalUrl = safeHttpUrl(item.link)
  const summary = summarize(item.description)
  const breakdown = explainScore(item.title, item.description, item.pubDate)
  const score = item.score ?? breakdown.score
  const hasRichOrExtraHtml =
    Boolean(item.descriptionHtml) &&
    (/<[a-z][\s\S]*>/i.test(item.descriptionHtml ?? '') ||
      item.description.length > summary.length + 20)

  return (
    <main aria-label="Article reader" className="flex min-w-0 flex-1 flex-col bg-white">
      <ScrollArea className="min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="mx-auto max-w-2xl px-8 py-8"
          >
            <article>
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
                <span aria-hidden="true" className="text-zinc-300">
                  ·
                </span>

                <HoverCard openDelay={150} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Signal score ${score} breakdown`}
                      className="inline-flex cursor-help items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                    >
                      <Badge
                        variant="outline"
                        className={`rounded-md font-mono text-[11px] font-medium tabular-nums ${scoreBadgeClass(score)}`}
                      >
                        {score} signal
                      </Badge>
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    className="pointer-events-none w-64 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-950">
                        Deterministic signal score
                      </span>
                      <span className="font-mono text-xs font-semibold text-zinc-950">
                        {score}/100
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Keyword & recency formula (no LLM).
                    </p>
                    <Separator className="my-2" />
                    {breakdown.reasons.length === 0 ? (
                      <p className="text-xs text-zinc-500">
                        No tracked keywords or recent boost matched.
                      </p>
                    ) : (
                      <ul className="space-y-1 text-xs">
                        {breakdown.reasons.map((r) => (
                          <li
                            key={r.label}
                            className="flex items-center justify-between text-zinc-700"
                          >
                            <span>{r.label}</span>
                            <span className="font-mono text-zinc-950">
                              +{r.points}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </HoverCardContent>
                </HoverCard>
              </div>

              <h1 className="mt-3 text-[20px] leading-snug font-semibold tracking-tight text-zinc-950">
                {item.title}
              </h1>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {originalUrl ? (
                  <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
                    <a
                      href={originalUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Open original
                      <ExternalLink aria-hidden="true" className="size-3.5" />
                    </a>
                  </Button>
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
                  <TooltipContent>Toggle bookmark (s)</TooltipContent>
                </Tooltip>

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

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalOpen(true)}
                  className="h-8 border-zinc-300 text-xs font-medium text-zinc-950 shadow-none hover:bg-zinc-100"
                >
                  → Kiro task
                </Button>
              </div>

              <Separator className="my-6" />

              <p className="border-l-2 border-zinc-950 pl-4 text-[14.5px] leading-[1.7] text-zinc-800">
                {summary}
              </p>

              {hasRichOrExtraHtml && item.descriptionHtml && (
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
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </main>
  )
}
