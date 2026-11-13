import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MotionConfig } from 'motion/react'
import FeedList from './components/FeedList'
import ItemList, { type Filter } from './components/ItemList'
import ReaderPane from './components/ReaderPane'
import TopBar, { type SortBy } from './components/TopBar'
import { TooltipProvider } from './components/ui/tooltip'
import {
  DEFAULT_FEEDS,
  fetchFeed,
  type FeedItem,
  type FeedSource,
} from './lib/feeds'
import { getSampleItems } from './lib/sampleData'
import { scoreItem } from './lib/scoring'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage full or unavailable — app keeps working in-memory
  }
}

export default function App() {
  const [feeds, setFeeds] = useState<FeedSource[]>(() =>
    load('rr.feeds', DEFAULT_FEEDS),
  )
  const [items, setItems] = useState<FeedItem[]>([])
  const [readIds, setReadIds] = useState<string[]>(() => load('rr.read', []))
  const [savedIds, setSavedIds] = useState<string[]>(() => load('rr.saved', []))
  const [selectedFeed, setSelectedFeed] = useState('all')
  const [filter, setFilter] = useState<Filter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('score')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [feedErrors, setFeedErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<string | null>(null)
  const [usingSample, setUsingSample] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async (currentFeeds: FeedSource[]) => {
    setLoading(true)
    const results = await Promise.all(
      currentFeeds.map(async (feed) => {
        try {
          return { feed, items: await fetchFeed(feed), error: '' }
        } catch (e) {
          return {
            feed,
            items: [] as FeedItem[],
            error: e instanceof Error ? e.message : 'Fetch failed',
          }
        }
      }),
    )
    const live = results.flatMap((r) => r.items)
    const errors: Record<string, string> = {}
    for (const r of results) if (r.error) errors[r.feed.id] = r.error
    setFeedErrors(errors)
    if (live.length > 0) {
      setItems(
        live.map((it) => ({
          ...it,
          score: scoreItem(it.title, it.description, it.pubDate),
        })),
      )
      setUsingSample(false)
    } else {
      setItems(getSampleItems())
      setUsingSample(true)
    }
    setLastRefresh(new Date().toISOString())
    setLoading(false)
  }, [])

  useEffect(() => {
    save('rr.feeds', feeds)
  }, [feeds])
  useEffect(() => {
    save('rr.read', readIds)
  }, [readIds])
  useEffect(() => {
    save('rr.saved', savedIds)
  }, [savedIds])

  useEffect(() => {
    void refresh(feeds)
    // Fetch once on mount; Refresh button re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter((it) => selectedFeed === 'all' || it.feedId === selectedFeed)
      .filter((it) => {
        if (filter === 'high') return (it.score ?? 0) >= 70
        if (filter === 'unread') return !readIds.includes(it.id)
        if (filter === 'saved') return savedIds.includes(it.id)
        return true
      })
      .filter(
        (it) =>
          q === '' ||
          it.title.toLowerCase().includes(q) ||
          it.description.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        if (sortBy === 'date') {
          return (
            new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime() ||
            (b.score ?? 0) - (a.score ?? 0)
          )
        }
        return (
          (b.score ?? 0) - (a.score ?? 0) ||
          new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
        )
      })
  }, [items, selectedFeed, filter, sortBy, query, readIds, savedIds])

  const selectedItem =
    visibleItems.find((it) => it.id === selectedId) ??
    visibleItems[0] ??
    null

  const selectItem = useCallback((id: string) => {
    setSelectedId(id)
    setReadIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }, [])

  const toggleSave = useCallback((id: string) => {
    setSavedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }, [])

  // Keyboard: j/k move, s save/unsave, r refresh, / focus search
  // Capture phase prevents Listbox typeahead from hijacking j/k/s/r/slash.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('[role="dialog"]')) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      const activeId = selectedItem?.id ?? null
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault()
        e.stopPropagation()
        if (visibleItems.length === 0) return
        const idx = visibleItems.findIndex((it) => it.id === activeId)
        const next =
          e.key === 'j'
            ? Math.min(visibleItems.length - 1, idx + 1)
            : Math.max(0, idx - 1)
        const item = visibleItems[next]
        if (item) selectItem(item.id)
      } else if (e.key === 's' && activeId) {
        e.preventDefault()
        e.stopPropagation()
        toggleSave(activeId)
      } else if (e.key === 'r') {
        e.preventDefault()
        e.stopPropagation()
        void refresh(feeds)
      } else if (e.key === '/') {
        e.preventDefault()
        e.stopPropagation()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [visibleItems, selectedItem, selectItem, toggleSave, refresh, feeds])

  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const it of items) {
      if (readIds.includes(it.id)) continue
      counts[it.feedId] = (counts[it.feedId] ?? 0) + 1
    }
    return counts
  }, [items, readIds])

  const unreadTotal = useMemo(
    () => items.filter((it) => !readIds.includes(it.id)).length,
    [items, readIds],
  )

  const addFeed = (url: string): { ok: boolean; error?: string } => {
    if (feeds.some((f) => f.url === url)) {
      return { ok: false, error: 'This feed is already in your list' }
    }
    const title = new URL(url).hostname.replace(/^www\./, '')
    const feed: FeedSource = { id: `custom-${Date.now()}`, title, url }
    const next = [...feeds, feed]
    setFeeds(next)
    void refresh(next)
    return { ok: true }
  }

  const removeFeed = (feedId: string) => {
    const next = feeds.filter((f) => f.id !== feedId)
    setFeeds(next)
    setItems((prev) => prev.filter((it) => it.feedId !== feedId))
    if (selectedFeed === feedId) setSelectedFeed('all')
  }

  const restoreDefaults = () => {
    setFeeds(DEFAULT_FEEDS)
    void refresh(DEFAULT_FEEDS)
  }

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={250}>
        <div className="flex h-full flex-col bg-white text-zinc-950">
          <TopBar
            total={items.length}
            unread={unreadTotal}
            high={items.filter((it) => (it.score ?? 0) >= 70).length}
            lastRefresh={lastRefresh}
            loading={loading}
            query={query}
            onQueryChange={setQuery}
            searchInputRef={searchInputRef}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onRefresh={() => void refresh(feeds)}
            onRestoreDefaults={restoreDefaults}
          />
          {usingSample && (
            <p className="border-b border-zinc-200 bg-amber-50/80 px-4 py-1.5 text-xs text-amber-900">
              Showing sample data — live feeds are unreachable right now. Check
              your connection or add a feed below.
            </p>
          )}
          <div className="flex min-h-0 flex-1">
            <FeedList
              feeds={feeds}
              unreadCounts={unreadCounts}
              totalUnread={unreadTotal}
              selectedFeed={selectedFeed}
              onSelect={setSelectedFeed}
              onAdd={addFeed}
              onRemove={removeFeed}
              onRestoreDefaults={restoreDefaults}
              errors={feedErrors}
            />
            <ItemList
              items={visibleItems}
              loading={loading}
              selectedId={selectedItem?.id ?? null}
              onSelect={selectItem}
              filter={filter}
              onFilterChange={setFilter}
              sortBy={sortBy}
              onSortChange={setSortBy}
              query={query}
              onQueryChange={setQuery}
              readIds={readIds}
              savedIds={savedIds}
              onToggleSave={toggleSave}
              onRefresh={() => void refresh(feeds)}
            />
            <ReaderPane
              item={selectedItem}
              saved={selectedItem ? savedIds.includes(selectedItem.id) : false}
              onToggleSave={toggleSave}
              onMarkUnread={(id) =>
                setReadIds((prev) => prev.filter((x) => x !== id))
              }
            />
          </div>
        </div>
      </TooltipProvider>
    </MotionConfig>
  )
}
