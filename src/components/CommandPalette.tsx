import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  BookOpen,
  CornerDownLeft,
  FileText,
  GitBranch,
  History,
  Info,
  Keyboard,
  Layers,
  Newspaper,
  Rss,
  Search,
  Settings,
  Shield,
} from 'lucide-react'
import {
  searchCommandTargets,
  type CommandTarget,
  type CommandViewId,
} from '../lib/briefing'
import type { FeedItem, FeedSource } from '../lib/feeds'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  feeds: FeedSource[]
  items: FeedItem[]
  onSelectView: (view: CommandViewId) => void
  onSelectFeed: (feedId: string) => void
  onSelectItem: (itemId: string) => void
}

function targetIcon(target: CommandTarget) {
  if (target.kind === 'view') {
    if (target.viewId === 'briefing') return Newspaper
    if (target.viewId === 'radar') return Activity
    if (target.viewId === 'system') return GitBranch
    if (target.viewId === 'docs') return BookOpen
    if (target.viewId === 'shortcuts') return Keyboard
    if (target.viewId === 'settings') return Settings
    if (target.viewId === 'about') return Info
    if (target.viewId === 'changelog') return History
    if (target.viewId === 'privacy') return Shield
    return Layers
  }
  if (target.kind === 'feed') return Rss
  return FileText
}

export default function CommandPalette({
  open,
  onOpenChange,
  feeds,
  items,
  onSelectView,
  onSelectFeed,
  onSelectItem,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(
    () => searchCommandTargets({ feeds, items, query, limit: 14 }),
    [feeds, items, query],
  )

  const safeIndex =
    results.length === 0 ? 0 : Math.min(highlighted, results.length - 1)

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20)
    return () => window.clearTimeout(timer)
  }, [open])

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery('')
      setHighlighted(0)
    }
    onOpenChange(next)
  }

  const runTarget = (target: CommandTarget) => {
    if (target.kind === 'view' && target.viewId) {
      onSelectView(target.viewId)
    } else if (target.kind === 'feed' && target.feedId) {
      onSelectFeed(target.feedId)
    } else if (target.kind === 'item' && target.itemId) {
      onSelectItem(target.itemId)
    }
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[22%] translate-y-0 gap-0 overflow-hidden border-zinc-200/90 bg-white/90 p-0 shadow-[0_16px_48px_rgba(0,0,0,0.14)] backdrop-blur-xl sm:max-w-xl"
      >
        <DialogHeader className="visually-hidden">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>
            Fuzzy search feeds, views, and articles.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2.5 border-b border-zinc-200 px-3.5 py-2.5">
          <Search aria-hidden="true" className="size-4 shrink-0 text-zinc-400" />
          <Input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls="command-palette-list"
            aria-activedescendant={
              results[safeIndex] ? results[safeIndex].id : undefined
            }
            aria-label="Jump to view, feed, or item"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setHighlighted(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHighlighted((i) =>
                  results.length === 0 ? 0 : (i + 1) % results.length,
                )
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHighlighted((i) =>
                  results.length === 0
                    ? 0
                    : (i - 1 + results.length) % results.length,
                )
              } else if (e.key === 'Enter' && results[safeIndex]) {
                e.preventDefault()
                runTarget(results[safeIndex])
              }
            }}
            placeholder="Jump to view, feed, or article…"
            className="h-7 border-0 bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0"
          />
          <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
            Esc
          </kbd>
        </div>

        <ScrollArea className="max-h-80">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-zinc-500">
              No matching feeds or articles for “{query.trim()}”.
            </p>
          ) : (
            <ul
              id="command-palette-list"
              role="listbox"
              aria-label="Command results"
              className="p-1.5"
            >
              {results.map((target, idx) => {
                const Icon = targetIcon(target)
                const active = idx === safeIndex
                return (
                  <li
                    key={target.id}
                    id={target.id}
                    role="option"
                    aria-selected={active}
                  >
                    <button
                      type="button"
                      onMouseEnter={() => setHighlighted(idx)}
                      onClick={() => runTarget(target)}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors ${
                        active
                          ? 'bg-zinc-950 text-white'
                          : 'text-zinc-800 hover:bg-zinc-100'
                      }`}
                    >
                      <Icon
                        aria-hidden="true"
                        className={`size-3.5 shrink-0 ${
                          active ? 'text-zinc-300' : 'text-zinc-400'
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">
                          {target.label}
                        </span>
                        <span
                          className={`block truncate text-[11px] ${
                            active ? 'text-zinc-300' : 'text-zinc-500'
                          }`}
                        >
                          {target.subtitle}
                        </span>
                      </span>
                      {target.badge && (
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums ${
                            active
                              ? 'bg-zinc-800 text-zinc-200'
                              : 'bg-zinc-100 text-zinc-600'
                          }`}
                        >
                          {target.badge}
                        </span>
                      )}
                      {active && (
                        <CornerDownLeft
                          aria-hidden="true"
                          className="size-3 shrink-0 text-zinc-400"
                        />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>

        <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50/70 px-3.5 py-2 font-mono text-[11px] text-zinc-500">
          <span>↑↓ navigate · Enter open</span>
          <span>⌘K / Ctrl+K</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
