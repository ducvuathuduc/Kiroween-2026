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
  Sparkles,
} from 'lucide-react'
import {
  searchCommandTargets,
  type CommandTarget,
  type CommandViewId,
} from '../lib/briefing'
import type { FeedItem, FeedSource } from '../lib/feeds'
import type { AIProviderId } from '../lib/providers'
import {
  isLocalSemanticSupported,
  rankItemsHybrid,
  type SemanticProgressState,
  type SemanticSearchClient,
} from '../lib/semanticSearch'
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
  onOpenAsk?: (question: string) => void
  semanticEnabled?: boolean
  onToggleSemantic?: () => void
  semanticClient?: SemanticSearchClient
  semanticProgress?: SemanticProgressState
  hasServerEmbedProvider?: boolean
  preferredProvider?: AIProviderId
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
  onOpenAsk,
  semanticEnabled = false,
  onToggleSemantic,
  semanticClient,
  semanticProgress,
  hasServerEmbedProvider = false,
  preferredProvider = 'gemini',
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const [paletteScores, setPaletteScores] = useState<{
    query: string
    scores: Record<string, number>
  } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])
  const itemCount = items.length

  useEffect(() => {
    const clean = query.trim().toLowerCase()
    const currentItems = itemsRef.current
    if (!open || !semanticEnabled || clean.length < 2 || currentItems.length === 0) {
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      if (semanticClient && isLocalSemanticSupported()) {
        void semanticClient
          .search(clean, currentItems, controller.signal)
          .then((res) => {
            if (controller.signal.aborted) return
            if (Object.keys(res.scores).length > 0) {
              setPaletteScores({ query: clean, scores: res.scores })
            }
          })
          .catch(() => {
            // fallback handled below if server provider is available
          })
      }

      if (
        (!semanticClient ||
          !isLocalSemanticSupported() ||
          !semanticClient.getState().modelReady) &&
        hasServerEmbedProvider &&
        navigator.onLine
      ) {
        const docs = currentItems.slice(0, 60).map((it) => ({
          id: it.id,
          text: `${it.title}\n${it.description.slice(0, 400)}`,
        }))
        void fetch('/api/embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            query: clean,
            documents: docs,
            provider: preferredProvider,
          }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data: { available?: boolean; scores?: Record<string, number> } | null) => {
            if (controller.signal.aborted) return
            if (data?.available && data.scores) {
              setPaletteScores((prev) =>
                prev && prev.query === clean ? prev : { query: clean, scores: data.scores ?? {} },
              )
            }
          })
          .catch(() => {
            /* ignore fallback errors */
          })
      }
    }, 200)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [
    open,
    query,
    semanticEnabled,
    itemCount,
    semanticClient,
    hasServerEmbedProvider,
    preferredProvider,
  ])

  const results = useMemo(() => {
    const base = searchCommandTargets({ feeds, items, query, limit: 14 })
    const clean = query.trim().toLowerCase()
    if (
      !semanticEnabled ||
      clean.length < 2 ||
      !paletteScores ||
      paletteScores.query !== clean
    ) {
      return base
    }

    const nonItemTargets = base.filter((t) => t.kind !== 'item')
    const semanticItems = rankItemsHybrid(items, paletteScores.scores, clean)
      .slice(0, 10)
      .map((entry): CommandTarget => ({
        id: `cmd-item-${entry.item.id}`,
        kind: 'item',
        label: entry.item.title,
        subtitle: entry.item.feedTitle,
        badge: entry.isSemanticMatch
          ? `semantic match ${entry.similarity.toFixed(2)}`
          : `${entry.item.score ?? 0}`,
        itemId: entry.item.id,
        matchScore: 200 + entry.combinedScore * 800,
      }))

    return [...nonItemTargets, ...semanticItems]
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 14)
  }, [feeds, items, query, semanticEnabled, paletteScores])

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
      setPaletteScores(null)
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
        className="top-[22%] flex translate-y-0 flex-col gap-0 overflow-hidden border-zinc-200/90 bg-white/90 p-0 shadow-[0_16px_48px_rgba(0,0,0,0.14)] backdrop-blur-xl sm:max-w-xl"
      >
        <DialogHeader className="visually-hidden">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>
            Fuzzy search feeds, views, and articles.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 items-center gap-2.5 border-b border-zinc-200 px-3.5 py-2.5">
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
            className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {onToggleSemantic && (
            <button
              type="button"
              aria-pressed={semanticEnabled}
              aria-label={
                semanticEnabled
                  ? 'Disable semantic search in command palette'
                  : 'Enable semantic search in command palette'
              }
              onClick={onToggleSemantic}
              className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[10px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950 aria-[pressed=true]:border-zinc-950 aria-[pressed=true]:bg-zinc-950 aria-[pressed=true]:text-white"
            >
              <Sparkles aria-hidden="true" className="size-2.5" />
              Semantic
            </button>
          )}
          <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
            Esc
          </kbd>
        </div>

        {semanticEnabled &&
          query.trim().length >= 2 &&
          semanticProgress?.status === 'downloading' &&
          !semanticProgress.modelReady && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3.5 py-1.5 text-[11px] text-zinc-600"
            >
              <span>model downloading…</span>
              <span className="inline-flex items-center gap-2 font-mono text-[10px] tabular-nums">
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
            </div>
          )}

        <ScrollArea className="max-h-80 min-w-0 overflow-hidden [&_[data-slot=scroll-area-viewport]]:max-h-80 [&_[data-slot=scroll-area-viewport]>div]:!block">
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

        {onOpenAsk && (
          <button
            type="button"
            className="border-t border-zinc-200 px-4 py-3 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            onClick={() => {
              onOpenAsk(query.trim().slice(0, 500))
              handleOpenChange(false)
            }}
          >
            Ask today’s public feeds{query.trim() ? ` about “${query.trim().slice(0, 80)}”` : ''}
          </button>
        )}

        <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50/70 px-3.5 py-2 font-mono text-[11px] text-zinc-500">
          <span>↑↓ navigate · Enter open</span>
          <span>⌘K / Ctrl+K</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
