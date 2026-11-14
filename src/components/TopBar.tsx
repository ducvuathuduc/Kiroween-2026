import type { RefObject } from 'react'
import {
  Activity,
  ArrowUpDown,
  Bell,
  BellOff,
  BookOpen,
  Command,
  Download,
  FileJson,
  GitBranch,
  History,
  Info,
  Keyboard,
  Layers,
  MoreHorizontal,
  Newspaper,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Square,
  X,
} from 'lucide-react'
import { motion } from 'motion/react'
import { formatRefreshTime } from '../lib/format'
import type { AppRoute, NavigableRoute } from '../lib/routes'
import type { BriefingPlaybackStatus } from '../lib/tts'
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
export type AppView = NavigableRoute

interface TopBarProps {
  offline: boolean
  updateAvailable: boolean
  onUpdate: () => void
  activeView: AppRoute
  onViewChange: (view: NavigableRoute) => void
  total: number
  unread: number
  high: number
  newCount: number
  lastRefresh: string | null
  loading: boolean
  alertsEnabled: boolean
  query: string
  onQueryChange: (q: string) => void
  searchInputRef: RefObject<HTMLInputElement | null>
  sortBy: SortBy
  onSortChange: (sort: SortBy) => void
  onOpenCommandPalette: () => void
  onOpenAsk: () => void
  onOpenShortcutsModal: () => void
  onRefresh: () => void
  onToggleAlerts: () => void
  onExportOpml: () => void
  onExportJson: () => void
  onRestoreDefaults: () => void
  audioStatus?: BriefingPlaybackStatus
  audioItemIndex?: number
  audioItemTotal?: number
  audioItemTitle?: string
  onAudioTogglePause?: () => void
  onAudioStop?: () => void
}

const NAV_TABS = [
  { id: 'feed', label: 'Feed', icon: Layers },
  { id: 'briefing', label: 'Brief', fullLabel: 'Briefing', icon: Newspaper },
  { id: 'radar', label: 'Radar', fullLabel: 'Signal Radar', icon: Activity },
  { id: 'system', label: 'Sys', fullLabel: 'System', icon: GitBranch },
] as const

export default function TopBar({
  offline,
  updateAvailable,
  onUpdate,
  activeView,
  onViewChange,
  total,
  unread,
  high,
  newCount,
  lastRefresh,
  loading,
  alertsEnabled,
  query,
  onQueryChange,
  searchInputRef,
  sortBy,
  onSortChange,
  onOpenCommandPalette,
  onOpenAsk,
  onOpenShortcutsModal,
  onRefresh,
  onToggleAlerts,
  onExportOpml,
  onExportJson,
  onRestoreDefaults,
  audioStatus = 'idle',
  audioItemIndex = -1,
  audioItemTotal = 0,
  audioItemTitle = '',
  onAudioTogglePause,
  onAudioStop,
}: TopBarProps) {
  const formattedRefresh = lastRefresh ? formatRefreshTime(lastRefresh) : ''
  const showMiniPlayer =
    (audioStatus === 'speaking' || audioStatus === 'paused') &&
    audioItemTotal > 0

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white/75 px-3 backdrop-blur-xl sm:gap-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
        <a
          href="/"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
            e.preventDefault()
            onViewChange('feed')
          }}
          className="flex shrink-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
        >
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-md bg-zinc-950 font-mono text-[11px] font-semibold text-white"
          >
            R
          </span>
          <span className="sr-only truncate text-sm font-semibold tracking-tight text-zinc-950 lg:not-sr-only">
            Resurrected Reader
          </span>
        </a>

        <nav
          aria-label="Primary views"
          className="flex items-center rounded-md border border-zinc-200 bg-zinc-100/70 p-0.5"
        >
          {NAV_TABS.map((tab) => {
            const Icon = tab.icon
            const active = activeView === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onViewChange(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative inline-flex h-6 items-center gap-1 rounded-[5px] px-1.5 text-xs font-medium whitespace-nowrap transition-colors sm:px-2 ${
                  active ? 'text-zinc-950' : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="topbar-active-view"
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-[5px] bg-white shadow-xs"
                  />
                )}
                <span className="relative z-10 inline-flex items-center gap-1">
                  <Icon aria-hidden="true" className="hidden size-3 sm:inline" />
                  <span className="sm:hidden">{tab.label}</span>
                  <span className="hidden sm:inline">
                    {'fullLabel' in tab ? tab.fullLabel : tab.label}
                  </span>
                </span>
              </button>
            )
          })}
        </nav>

        <Separator orientation="vertical" className="hidden h-4 xl:block" />
        <div
          className={`hidden shrink-0 items-center gap-3 whitespace-nowrap font-mono text-xs tabular-nums text-zinc-500 ${offline || updateAvailable ? '2xl:flex' : 'xl:flex'}`}
        >
          <span>
            <strong className="font-medium text-zinc-950">{total}</strong> items
          </span>
          <span>
            <strong className="font-medium text-zinc-950">{unread}</strong> unread
          </span>
          <span>
            <strong className="font-medium text-zinc-950">{high}</strong> ≥70
          </span>
          {newCount > 0 && (
            <span>
              <strong className="font-medium text-zinc-950">{newCount}</strong>{' '}
              new
            </span>
          )}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
        {showMiniPlayer && (
          <div
            role="region"
            aria-label="Audio briefing mini player"
            className="flex min-w-0 items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-xs text-zinc-900"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={!onAudioTogglePause}
              aria-pressed={audioStatus === 'speaking'}
              aria-label={
                audioStatus === 'speaking'
                  ? 'Pause audio briefing'
                  : 'Resume audio briefing'
              }
              onClick={onAudioTogglePause}
              className="text-zinc-900 hover:bg-zinc-200/70"
            >
              {audioStatus === 'speaking' ? (
                <Pause className="size-3" />
              ) : (
                <Play className="size-3" />
              )}
            </Button>

            <button
              type="button"
              onClick={() => onViewChange('briefing')}
              className="flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-zinc-200/60"
            >
              <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-zinc-950">
                item {Math.max(1, audioItemIndex + 1)}/{audioItemTotal}
              </span>
              {audioItemTitle && (
                <span className="hidden max-w-28 truncate text-[11px] text-zinc-600 md:inline">
                  {audioItemTitle}
                </span>
              )}
            </button>

            {onAudioStop && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Stop audio briefing"
                onClick={onAudioStop}
                className="text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-950"
              >
                <Square className="size-2.5" />
              </Button>
            )}
          </div>
        )}

        {offline && (
          <span className="rounded border border-zinc-300 bg-zinc-100 px-1 py-1 font-mono text-[10px] font-semibold text-zinc-800">
            OFFLINE
          </span>
        )}
        {updateAvailable && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onUpdate}
            className="hidden h-8 px-2 text-xs sm:inline-flex"
          >
            Update
          </Button>
        )}
        <div className="relative hidden w-40 sm:block md:w-48">
          <label htmlFor="search-items" className="visually-hidden">
            Search titles and summaries
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-400"
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
            placeholder="Filter…"
            className="h-8 border-zinc-200 bg-white/80 pr-7 pl-8 text-[13px] shadow-none placeholder:text-zinc-400 focus-visible:border-zinc-950 focus-visible:ring-0 [&::-webkit-search-cancel-button]:appearance-none"
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
              className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-zinc-200 bg-zinc-50 px-1 font-mono text-[10px] text-zinc-400"
            >
              /
            </kbd>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpenAsk}
          className="h-8 px-2 text-xs"
        >
          Ask
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenCommandPalette}
              aria-label="Open command palette"
              className="h-8 gap-1 border-zinc-200 bg-white/80 px-2 font-mono text-xs text-zinc-600 shadow-none hover:bg-zinc-100 hover:text-zinc-950"
            >
              <Command aria-hidden="true" className="size-3" />
              <span className="hidden sm:inline">K</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Command palette (⌘K / Ctrl+K)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onOpenShortcutsModal}
              aria-label="Keyboard shortcuts"
              className="hidden font-mono text-xs text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 sm:inline-flex"
            >
              ?
            </Button>
          </TooltipTrigger>
          <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
        </Tooltip>

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
            {updateAvailable && (
              <DropdownMenuItem onSelect={onUpdate}>
                Reload Reader update
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onOpenCommandPalette}>
              <Command className="size-3.5" />
              Command palette
              <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
            </DropdownMenuItem>
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
            <DropdownMenuItem onSelect={onExportJson}>
              <FileJson className="size-3.5" />
              Export digest (.json)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] text-zinc-400">
              Pages
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => onViewChange('about')}>
              <Info className="size-3.5" />
              About
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onViewChange('docs')}>
              <BookOpen className="size-3.5" />
              Documentation
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onViewChange('changelog')}>
              <History className="size-3.5" />
              Changelog
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onViewChange('privacy')}>
              <Shield className="size-3.5" />
              Privacy
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onViewChange('settings')}>
              <Settings className="size-3.5" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onOpenShortcutsModal}>
              <Keyboard className="size-3.5" />
              Keyboard shortcuts
              <DropdownMenuShortcut>?</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onRestoreDefaults}>
              <RotateCcw className="size-3.5" />
              Restore default feeds
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onViewChange('settings')}
              aria-label="Open reader settings"
              className="hidden rounded-full outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 sm:inline-flex"
            >
              <Avatar size="sm" className="border border-zinc-200">
                <AvatarFallback className="bg-zinc-950 font-mono text-[10px] font-semibold text-white">
                  RR
                </AvatarFallback>
              </Avatar>
            </button>
          </TooltipTrigger>
          <TooltipContent>Reader settings</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}