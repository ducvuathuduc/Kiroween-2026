import { Listbox, ListboxItem } from '@ui-sdk/react/listbox'
import { ArrowUpDown, Star } from 'lucide-react'
import type { FeedItem } from '../lib/feeds'
import { scoreBadgeClass, timeAgo } from '../lib/format'
import type { SortBy } from './TopBar'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { ScrollArea } from './ui/scroll-area'
import { Skeleton } from './ui/skeleton'
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
  loading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  filter: Filter
  onFilterChange: (f: Filter) => void
  sortBy: SortBy
  onSortChange: (sort: SortBy) => void
  query: string
  onQueryChange: (q: string) => void
  readIds: string[]
  savedIds: string[]
  onToggleSave: (id: string) => void
  onRefresh: () => void
}

export default function ItemList({
  items,
  loading,
  selectedId,
  onSelect,
  filter,
  onFilterChange,
  sortBy,
  onSortChange,
  query,
  onQueryChange,
  readIds,
  savedIds,
  onToggleSave,
  onRefresh,
}: ItemListProps) {
  const hasActiveFilter = query.trim() !== '' || filter !== 'all'

  const emptyMessage = (() => {
    if (query.trim()) return `No items match “${query.trim()}”.`
    if (filter === 'high') return 'No high-signal items (≥70) in this view.'
    if (filter === 'unread') return 'All caught up — no unread items here.'
    if (filter === 'saved') {
      return 'No saved items yet. Click the star icon or press s to save one.'
    }
    return 'No items available for the current feed selection.'
  })()

  return (
    <section
      aria-label="Feed items"
      className="flex w-96 shrink-0 flex-col border-r border-zinc-200 bg-white"
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

      <ScrollArea className="min-h-0 flex-1">
        {loading && items.length === 0 ? (
          <div aria-busy="true" aria-label="Loading feed items">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 border-b border-zinc-200 px-3.5 py-3"
              >
                <Skeleton className="mt-0.5 h-5 w-8 shrink-0 rounded-md bg-zinc-100" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-[90%] bg-zinc-100" />
                  <Skeleton className="h-3.5 w-[65%] bg-zinc-100" />
                  <Skeleton className="h-3 w-36 bg-zinc-100" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
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
          </div>
        ) : (
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
            {items.map((item) => {
              const isRead = readIds.includes(item.id)
              const isSaved = savedIds.includes(item.id)
              const isSelected = selectedId === item.id
              const score = item.score ?? 0

              return (
                <div
                  key={item.id}
                  role="none"
                  className={`group flex items-start border-b border-l-2 border-b-zinc-200 transition-colors hover:bg-zinc-50 ${
                    isSelected
                      ? 'border-l-zinc-950 bg-zinc-100/80'
                      : 'border-l-transparent bg-white'
                  }`}
                >
                  <ListboxItem
                    value={item.id}
                    label={item.title}
                    className={`flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 px-3.5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-inset ${
                      isRead && !isSelected ? 'opacity-70' : ''
                    }`}
                  >
                    <Badge
                      variant="outline"
                      title="Deterministic signal score (not AI)"
                      className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0 font-mono text-[11px] font-medium tabular-nums ${scoreBadgeClass(score)}`}
                    >
                      {score}
                    </Badge>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-[13px] leading-snug ${
                          isRead
                            ? 'font-normal text-zinc-600'
                            : 'font-semibold text-zinc-950'
                        }`}
                      >
                        {item.title}
                      </span>
                      <span className="mt-1 block truncate text-xs text-zinc-500">
                        {item.feedTitle} · {timeAgo(item.pubDate)}
                        {item.sample ? ' · SAMPLE' : ''}
                      </span>
                    </span>
                  </ListboxItem>

                  <div role="none" className="pt-2.5 pr-2">
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
                        {isSaved ? 'Remove bookmark (s)' : 'Save item (s)'}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )
            })}
          </Listbox>
        )}
      </ScrollArea>
    </section>
  )
}
