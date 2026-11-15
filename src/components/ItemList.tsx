import { useEffect, useRef } from 'react'
import { Listbox, ListboxItem } from '@ui-sdk/react/listbox'
import { ArrowUpDown, Sparkles, Star } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { isNewSince } from '../lib/briefing'
import type { FeedItem } from '../lib/feeds'
import { summarize, timeAgo } from '../lib/format'
import type { GeminiSummary } from '../lib/kiroTask'
import type { TasteProfile } from '../lib/personalize'
import { getProviderDisplayName, type AIProviderId } from '../lib/providers'
import {
  DEFAULT_MIN_SIMILARITY,
  type SemanticProgressState,
} from '../lib/semanticSearch'
import type { ReaderDensity } from '../lib/storage'
import ItemThumbnail from './ItemThumbnail'
import ScoreBreakdownPopover from './ScoreBreakdownPopover'
import type { SortBy } from './TopBar'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { ScrollArea } from './ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

export type Filter = 'all' | 'high' | 'unread' | 'saved'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'high', label: 'High ≥70' },
  { id: 'unread', label: 'Unread' },
  { id: 'saved', label: 'Saved' },
]

interface ItemListProps {
  items: FeedItem[]
  profile?: TasteProfile
  loading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenItem: (id: string) => void
  filter: Filter
  onFilterChange: (f: Filter) => void
  sortBy: SortBy
  onSortChange: (sort: SortBy) => void
  query: string
  onQueryChange: (q: string) => void
  readIds: string[]
  savedIds: string[]
  summaries: Record<string, GeminiSummary>
  lastVisitIso: string | null
  newCount: number
  density?: ReaderDensity
  semanticEnabled?: boolean
  onToggleSemantic?: () => void
  semanticProgress?: SemanticProgressState
  semanticSimilarityById?: Record<string, number>
  semanticInfo?: {
    active: boolean
    mode: 'local' | 'server'
    provider: AIProviderId | null
  }
  onMarkAllVisited: () => void
  onToggleSave: (id: string) => void
  onOpenRadar: () => void
  onRefresh: () => void
  pulseError?: string
  exploreSlotItemId?: string | null
}

function firstLine(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  const sentence = clean.match(/^[^.!?]+[.!?]/)
  return sentence ? sentence[0].trim() : clean
}

export default function ItemList({
  items,
  profile,
  loading,
  selectedId,
  onSelect,
  onOpenItem,
  filter,
  onFilterChange,
  sortBy,
  onSortChange,
  query,
  onQueryChange,
  readIds,
  savedIds,
  summaries,
  lastVisitIso,
  newCount,
  density = 'comfortable',
  semanticEnabled = true,
  onToggleSemantic,
  semanticProgress,
  semanticSimilarityById,
  semanticInfo,
  onMarkAllVisited,
  onToggleSave,
  onOpenRadar,
  onRefresh,
  pulseError,
  exploreSlotItemId,
}: ItemListProps) {
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const hasActiveFilter = query.trim() !== '' || filter !== 'all'

  useEffect(() => {
    if (!selectedId) return
    const row = rowRefs.current.get(selectedId)
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId])

  const emptyMessage = (() => {
    if (query.trim()) return `No items match “${query.trim()}”.`
    if (filter === 'high') return 'No high-signal items (≥70) in this view.'
    if (filter === 'unread') return 'All caught up — no unread items here.'
    if (filter === 'saved') {
      return 'No saved items yet. Click the star icon or press b to save one.'
    }
    return 'No items available for the current feed selection.'
  })()

  return (
    <section
      aria-label="Feed items"
      className="flex w-full shrink-0 flex-col border-b border-zinc-200 bg-white md:w-80 md:border-r md:border-b-0 lg:w-96"
    >
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2">
        <Tabs
          value={filter}
          onValueChange={(v) => onFilterChange(v as Filter)}
          className="min-w-0 flex-1"
        >
          <TabsList className="grid h-8 w-full grid-cols-4 bg-zinc-100/80 p-0.5">
            {FILTERS.map((f) => (
              <TabsTrigger
                key={f.id}
                value={f.id}
                className="h-7 px-1.5 text-xs font-medium text-zinc-600 data-[state=active]:bg-white data-[state=active]:text-zinc-950 data-[state=active]:shadow-xs"
              >
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {onToggleSemantic && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-pressed={semanticEnabled}
                aria-label={
                  semanticEnabled
                    ? 'Disable in-browser semantic search'
                    : 'Enable in-browser semantic search'
                }
                onClick={onToggleSemantic}
                className="shrink-0 border-zinc-200 bg-white text-zinc-600 shadow-none hover:bg-zinc-100 hover:text-zinc-950 aria-[pressed=true]:border-zinc-950 aria-[pressed=true]:bg-zinc-950 aria-[pressed=true]:text-white aria-[pressed=true]:hover:bg-zinc-800"
              >
                <Sparkles aria-hidden="true" className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {semanticEnabled
                ? 'Semantic search ON (0.6 semantic + 0.4 keyword) — click for keyword-only'
                : 'Semantic search OFF (keyword-only) — click to enable'}
            </TooltipContent>
          </Tooltip>
        )}

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Sort timeline"
                  className="shrink-0 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
                >
                  <ArrowUpDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              Sort: {sortBy === 'score' ? 'Signal score' : 'Newest'}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuRadioGroup
              value={sortBy}
              onValueChange={(v) => onSortChange(v as SortBy)}
            >
              <DropdownMenuRadioItem value="score">
                Signal score
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="date">
                Newest first
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {newCount > 0 && (
        <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/80 px-3.5 py-1.5 text-[11px] text-zinc-600">
          <span>
            <strong className="font-mono font-semibold tabular-nums text-zinc-950">
              {newCount}
            </strong>{' '}
            new since last visit
          </span>
          <button
            type="button"
            onClick={onMarkAllVisited}
            className="font-medium text-zinc-900 underline-offset-2 hover:underline"
          >
            Mark caught up
          </button>
        </div>
      )}

      {query.trim().length >= 2 && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/80 px-3.5 py-1.5 text-[11px] text-zinc-600"
        >
          {!semanticEnabled ? (
            <>
              <span>Keyword search only</span>
              {onToggleSemantic && (
                <button
                  type="button"
                  onClick={onToggleSemantic}
                  className="font-medium text-zinc-950 underline-offset-2 hover:underline"
                >
                  Enable semantic
                </button>
              )}
            </>
          ) : semanticProgress?.status === 'downloading' &&
            !semanticProgress.modelReady ? (
            <>
              <span className="inline-flex items-center gap-1.5 font-medium text-zinc-800">
                <Sparkles aria-hidden="true" className="size-3 text-zinc-700" />
                model downloading…
              </span>
              <span className="inline-flex items-center gap-2 font-mono text-[10px] tabular-nums text-zinc-600">
                <progress
                  className="rr-progress h-1.5 w-20"
                  aria-label="Semantic model download progress"
                  max={100}
                  value={
                    semanticProgress.progress > 0
                      ? semanticProgress.progress
                      : undefined
                  }
                />
                {semanticProgress.progress > 0
                  ? `${semanticProgress.progress}%`
                  : ''}
              </span>
            </>
          ) : semanticInfo?.active ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <Sparkles aria-hidden="true" className="size-3 text-zinc-700" />
                {semanticInfo.mode === 'local' ? (
                  <>
                    In-browser semantic ·{' '}
                    <strong className="font-medium text-zinc-950">
                      all-MiniLM-L6-v2
                    </strong>
                  </>
                ) : (
                  <>
                    Semantic fallback ·{' '}
                    <strong className="font-medium text-zinc-950">
                      {semanticInfo.provider
                        ? getProviderDisplayName(semanticInfo.provider)
                        : 'Server'}
                    </strong>
                  </>
                )}
              </span>
              <span className="font-mono text-[10px] text-zinc-500">
                0.6/0.4
              </span>
            </>
          ) : semanticProgress?.status === 'error' ? (
            <>
              <span>Keyword search · local model offline/unavailable</span>
              <span className="font-mono text-[10px] text-zinc-500">
                fallback
              </span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5">
                <Sparkles aria-hidden="true" className="size-3 text-zinc-500" />
                Searching…
              </span>
              <span className="font-mono text-[10px] text-zinc-500">
                hybrid
              </span>
            </>
          )}
        </div>
      )}

      {pulseError && (
        <p
          role="status"
          className="border-b border-zinc-200 bg-red-50/70 px-3.5 py-1.5 text-xs text-red-700"
        >
          Pulse notice: {pulseError}
        </p>
      )}

      <ScrollArea className="min-h-0 flex-1">
        {loading && items.length === 0 ? (
          <div aria-busy="true" aria-label="Loading feed items">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 border-b border-zinc-200 px-3.5 py-3"
              >
                <div className="skeleton-shimmer size-12 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="skeleton-shimmer h-3.5 w-[90%] rounded" />
                  <div className="skeleton-shimmer h-3 w-[78%] rounded" />
                  <div className="skeleton-shimmer h-3 w-36 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="flex flex-col items-center justify-center px-6 py-16 text-center"
          >
            <p className="max-w-xs text-[13px] leading-relaxed text-zinc-500">
              {emptyMessage}
            </p>
            {hasActiveFilter ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onQueryChange('')
                  onFilterChange('all')
                }}
                className="mt-4 h-8 border-zinc-200 text-xs font-medium text-zinc-900 shadow-none"
              >
                Reset filters
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRefresh}
                className="mt-4 h-8 border-zinc-200 text-xs font-medium text-zinc-900 shadow-none"
              >
                Refresh feeds
              </Button>
            )}
          </motion.div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${filter}-${sortBy}`}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <Listbox
                aria-label="Feed items list"
                value={selectedId}
                onValueChange={(nextId) => {
                  if (nextId) onSelect(nextId)
                }}
                orientation="vertical"
                activation="automatic"
                loop
                className="outline-none"
              >
                {items.map((item, idx) => {
                  const isRead = readIds.includes(item.id)
                  const isSaved = savedIds.includes(item.id)
                  const isSelected = selectedId === item.id
                  const isNew = isNewSince(item.pubDate, lastVisitIso)
                  const aiSummary = summaries[item.id]
                  const oneLine = aiSummary?.tldr
                    ? firstLine(aiSummary.tldr)
                    : summarize(item.description, 1)
                  const metricLabel =
                    'metricLabel' in item && typeof item.metricLabel === 'string'
                      ? item.metricLabel
                      : null

                  return (
                    <motion.div
                      key={item.id}
                      ref={(el) => {
                        if (el) rowRefs.current.set(item.id, el)
                        else rowRefs.current.delete(item.id)
                      }}
                      role="none"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ y: -1 }}
                      transition={{
                        duration: 0.16,
                        delay: Math.min(idx, 8) * 0.02,
                        ease: 'easeOut',
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target === e.currentTarget.querySelector('[role="option"]')) {
                          onOpenItem(item.id)
                        }
                      }}
                      className={`group relative flex items-start border-b border-b-zinc-200 transition-colors hover:bg-zinc-50/90 ${
                        isSelected ? 'bg-zinc-100/80' : 'bg-white'
                      }`}
                    >
                      {isSelected && (
                        <motion.span
                          layoutId="itemlist-active-bar"
                          aria-hidden="true"
                          transition={{ duration: 0.18, ease: 'easeOut' }}
                          className="absolute inset-y-0 left-0 w-0.5 bg-zinc-950"
                        />
                      )}

                      <ListboxItem
                        value={item.id}
                        label={item.title}
                        className={`flex min-w-0 flex-1 cursor-pointer items-start gap-3 pr-2 pl-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-inset ${
                          density === 'compact' ? 'py-2' : 'py-3'
                        } ${isRead && !isSelected ? 'opacity-75' : ''}`}
                      >
                        <ItemThumbnail
                          src={item.imageUrl}
                          title={item.title}
                          feedTitle={item.feedTitle}
                          className={density === 'compact' ? 'size-10' : ''}
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block line-clamp-2 text-[13px] leading-snug ${
                              isRead
                                ? 'font-normal text-zinc-700'
                                : 'font-semibold text-zinc-950'
                            }`}
                          >
                            {item.title}
                          </span>
                          <span
                            className={`mt-1 flex items-center gap-1 text-xs ${
                              aiSummary
                                ? 'font-medium text-zinc-700'
                                : 'text-zinc-500'
                            }`}
                          >
                            {aiSummary && (
                              <Sparkles
                                aria-hidden="true"
                                className="size-3 shrink-0 text-zinc-700"
                              />
                            )}
                            <span className="min-w-0 truncate">{oneLine}</span>
                          </span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                            <span className="min-w-0 truncate">
                              {item.feedTitle}
                              {metricLabel ? ` · ${metricLabel}` : ''} ·{' '}
                              {timeAgo(item.pubDate)}
                              {item.sample ? ' · SAMPLE' : ''}
                            </span>
                            {isNew && (
                              <span
                                aria-label="New since last visit"
                                className="shrink-0 font-mono text-[10px] font-semibold text-zinc-950"
                              >
                                · New
                              </span>
                            )}
                            {exploreSlotItemId === item.id && (
                              <span
                                data-explore-slot="true"
                                className="shrink-0 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-700"
                              >
                                Explore
                              </span>
                            )}
                            {semanticEnabled &&
                              query.trim().length >= 2 &&
                              typeof semanticSimilarityById?.[item.id] ===
                                'number' &&
                              semanticSimilarityById[item.id] >=
                                DEFAULT_MIN_SIMILARITY && (
                                <span
                                  data-semantic-chip="true"
                                  className="shrink-0 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-zinc-700"
                                >
                                  semantic match{' '}
                                  {semanticSimilarityById[item.id].toFixed(2)}
                                </span>
                              )}
                          </span>
                        </span>
                      </ListboxItem>

                      <div
                        role="none"
                        className={`flex shrink-0 flex-col items-end gap-1.5 pr-2.5 ${
                          density === 'compact' ? 'pt-2' : 'pt-3'
                        }`}
                      >
                        <ScoreBreakdownPopover
                          item={item}
                          profile={profile}
                          align="end"
                          onSelectItem={onSelect}
                          onOpenRadar={onOpenRadar}
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label={
                                isSaved
                                  ? `Unsave ${item.title}`
                                  : `Save ${item.title}`
                              }
                              aria-pressed={isSaved}
                              onClick={(e) => {
                                e.stopPropagation()
                                onToggleSave(item.id)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.stopPropagation()
                                }
                              }}
                              className={
                                isSaved
                                  ? 'text-zinc-950 hover:bg-zinc-200/70'
                                  : 'text-zinc-300 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-zinc-700 focus-visible:opacity-100'
                              }
                            >
                              <Star
                                className={`size-3.5 ${isSaved ? 'fill-zinc-950' : ''}`}
                              />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {isSaved ? 'Remove bookmark (b)' : 'Save item (b)'}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </motion.div>
                  )
                })}
              </Listbox>
            </motion.div>
          </AnimatePresence>
        )}
      </ScrollArea>
    </section>
  )
}
