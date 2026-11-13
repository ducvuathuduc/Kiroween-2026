import type { RefObject } from 'react'
import {
  Activity,
  ArrowUpDown,
  Bell,
  BellOff,
  Download,
  GitBranch,
  Layers,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from 'lucide-react'
import { formatRefreshTime } from '../lib/format'
import { Avatar, AvatarFallback } from './ui/avatar'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Input } from './ui/input'
import { Separator } from './ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

export type SortBy = 'score' | 'date'
export type AppView = 'feed' | 'radar' | 'system'

interface TopBarProps {
  activeView: AppView
  onViewChange: (view: AppView) => void
  total: number
  unread: number
  high: number
  lastRefresh: string | null
  loading: boolean
  alertsEnabled: boolean
  query: string
  onQueryChange: (q: string) => void
  searchInputRef: RefObject<HTMLInputElement | null>
  sortBy: SortBy
  onSortChange: (sort: SortBy) => void
  onRefresh: () => void
  onToggleAlerts: () => void
  onExportOpml: () => void
  onRestoreDefaults: () => void
}

export default function TopBar({
  activeView,
  onViewChange,
  total,
  unread,
  high,
  lastRefresh,
  loading,
  alertsEnabled,
  query,
  onQueryChange,
  searchInputRef,
  sortBy,
  onSortChange,
  onRefresh,
  onToggleAlerts,
  onExportOpml,
  onRestoreDefaults,
}: TopBarProps) {
  const formattedRefresh = lastRefresh ? formatRefreshTime(lastRefresh) : ''

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white/75 px-3 backdrop-blur-xl sm:gap-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-md bg-zinc-950 font-mono text-[11px] font-semibold text-white"
        >
          R
        </span>
        <span className="sr-only truncate text-sm font-semibold tracking-tight text-zinc-950 sm:not-sr-only">
          Resurrected Reader
        </span>

        <nav
          aria-label="Primary views"
          className="flex items-center rounded-md border border-zinc-200 bg-zinc-100/70 p-0.5"
        >
          {(
            [
              { id: 'feed', label: 'Feed', icon: Layers },
              { id: 'radar', label: 'Radar', fullLabel: 'Signal Radar', icon: Activity },
              { id: 'system', label: 'System', icon: GitBranch },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon
            const active = activeView === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onViewChange(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex h-6 items-center gap-1 rounded-[5px] px-2 text-xs font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                <Icon aria-hidden="true" className="hidden size-3 sm:inline" />
                <span className="sm:hidden">{tab.label}</span>
                <span className="hidden sm:inline">
                  {'fullLabel' in tab ? tab.fullLabel : tab.label}
                </span>
              </button>
            )
          })}
        </nav>

        <Separator orientation="vertical" className="hidden h-4 xl:block" />
        <div className="hidden items-center gap-3 font-mono text-xs tabular-nums text-zinc-500 xl:flex">
          <span>
            <strong className="font-medium text-zinc-950">{total}</strong> items
          </span>
          <span>
            <strong className="font-medium text-zinc-950">{unread}</strong> unread
          </span>
          <span>
            <strong className="font-medium text-zinc-950">{high}</strong> ≥70
          </span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <div className="relative w-24 sm:w-48 md:w-56">
          <label htmlFor="search-items" className="visually-hidden">
            Search titles and summaries
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-zinc-400 sm:left-2.5"
          />
          <Input
            ref={searchInputRef}
            id="search-items"
            type="search"
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value)
              if (activeView !== 'feed') onViewChange('feed')
            }}
            placeholder="Search…"
            className="h-8 border-zinc-200 bg-white/80 pr-7 pl-7 text-[13px] shadow-none placeholder:text-zinc-400 focus-visible:border-zinc-950 focus-visible:ring-0 sm:pr-8 sm:pl-8"
          />
          {query ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Clear search"
              onClick={() => {
                onQueryChange('')
                searchInputRef.current?.focus()
              }}
              className="absolute top-1/2 right-1 -translate-y-1/2 text-zinc-400 hover:text-zinc-950"
            >
              <X className="size-3.5" />
            </Button>
          ) : (
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-zinc-200 bg-zinc-50 px-1 font-mono text-[10px] text-zinc-400 sm:inline-block"
            >
              /
            </kbd>
          )}
        </div>

        {formattedRefresh && (
          <time
            dateTime={lastRefresh ?? undefined}
            title="Last refreshed"
            className="hidden font-mono text-xs tabular-nums text-zinc-500 2xl:inline"
          >
            {formattedRefresh}
          </time>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-pressed={alertsEnabled}
              aria-label={
                alertsEnabled
                  ? 'Disable high-signal notifications'
                  : 'Enable high-signal notifications (≥85)'
              }
              onClick={onToggleAlerts}
              className={`hidden sm:inline-flex ${
                alertsEnabled
                  ? 'bg-zinc-100 text-zinc-950 hover:bg-zinc-200/70'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950'
              }`}
            >
              {alertsEnabled ? (
                <Bell className="size-3.5" />
              ) : (
                <BellOff className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {alertsEnabled
              ? 'High-signal alerts (≥85) on'
              : 'Notify on items scoring ≥85'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Refresh feeds"
              className="h-8 gap-1.5 px-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 sm:px-2.5"
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-3.5 ${loading ? 'animate-spin' : ''}`}
              />
              <span className="hidden md:inline">
                {loading ? 'Fetching…' : 'Refresh'}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh all feeds (r)</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Reader options and sort"
                  className="text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Sort, OPML & feed options</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-zinc-500">
              <ArrowUpDown className="size-3.5" />
              Sort items by
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sortBy}
              onValueChange={(v) => onSortChange(v as SortBy)}
            >
              <DropdownMenuRadioItem value="score">
                Signal score (highest)
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="date">
                Newest published
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onRefresh}>
              <RefreshCw className="size-3.5" />
              Refresh all feeds
              <DropdownMenuShortcut>r</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onToggleAlerts}>
              {alertsEnabled ? (
                <Bell className="size-3.5" />
              ) : (
                <BellOff className="size-3.5" />
              )}
              {alertsEnabled ? 'Alerts on (≥85)' : 'Enable alerts (≥85)'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onExportOpml}>
              <Download className="size-3.5" />
              Export feeds (.opml)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onRestoreDefaults}>
              <RotateCcw className="size-3.5" />
              Restore default feeds
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-normal text-zinc-500">
              Keys: ↑/↓ or j/k move · s save · / search
            </DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Avatar size="sm" className="hidden border border-zinc-200 sm:flex">
              <AvatarFallback className="bg-zinc-100 font-mono text-[10px] font-semibold text-zinc-800">
                AW
              </AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent>AWS Builder Radar</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
