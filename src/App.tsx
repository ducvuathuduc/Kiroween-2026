import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MotionConfig } from 'motion/react'
import FeedList from './components/FeedList'
import ItemList, { type Filter } from './components/ItemList'
import ReaderPane from './components/ReaderPane'
import SignalRadarView from './components/SignalRadarView'
import TopBar, { type AppView, type SortBy } from './components/TopBar'
import { TooltipProvider } from './components/ui/tooltip'
import {
  DEFAULT_FEEDS,
  fetchFeed,
  type FeedItem,
  type FeedSource,
} from './lib/feeds'
import type { GeminiSummary } from './lib/kiroTask'
import { downloadOpml, parseOpml } from './lib/opml'
import { fetchCommunityPulse, type PulseSnapshot } from './lib/pulse'
import { getSampleItems } from './lib/sampleData'
import { explainScore } from './lib/scoring'

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

async function fetchMissingOgImages(
  candidates: FeedItem[],
): Promise<Record<string, string | null>> {
  const urls = [
    ...new Set(
      candidates
        .filter((it) => !it.imageUrl && /^https?:\/\//i.test(it.link))
        .map((it) => it.link),
    ),
  ].slice(0, 12)
  if (urls.length === 0) return {}
  try {
    const res = await fetch('/api/og-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return {}
    const json = (await res.json()) as {
      images?: Record<string, string | null>
    }
    return json.images ?? {}
  } catch {
    return {}
  }
}

export default function App() {
  const [feeds, setFeeds] = useState<FeedSource[]>(() =>
    load('rr.feeds', DEFAULT_FEEDS),
  )
  const [activeView, setActiveView] = useState<AppView>('feed')
  const [items, setItems] = useState<FeedItem[]>([])
  const [pulse, setPulse] = useState<PulseSnapshot>({
    hn: [],
    github: [],
    fetchedAt: '',
    cached: false,
    errors: {},
  })
  const [pulseLoading, setPulseLoading] = useState(true)
  const [readIds, setReadIds] = useState<string[]>(() => load('rr.read', []))
  const [savedIds, setSavedIds] = useState<string[]>(() => load('rr.saved', []))
  const [summaries, setSummaries] = useState<Record<string, GeminiSummary>>(
    () => load('rr.summaries.v1', {}),
  )
  const [summaryLoadingId, setSummaryLoadingId] = useState<string | null>(null)
  const [summaryErrors, setSummaryErrors] = useState<Record<string, string>>({})
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(() =>
    load('rr.notify', false),
  )
  const notifiedRef = useRef<Set<string>>(new Set(load('rr.notified', [])))
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

  const notifyHighSignal = useCallback(
    (nextItems: FeedItem[], enabled: boolean) => {
      if (
        !enabled ||
        typeof Notification === 'undefined' ||
        Notification.permission !== 'granted'
      ) {
        return
      }
      const candidates = nextItems.filter(
        (it) =>
          !it.sample &&
          (it.score ?? 0) >= 85 &&
          !notifiedRef.current.has(it.id),
      )
      for (const item of candidates.slice(0, 2)) {
        notifiedRef.current.add(item.id)
        try {
          new Notification(`${item.score} signal — ${item.feedTitle}`, {
            body: item.title,
            tag: item.id,
          })
        } catch {
          // Notification constructor unsupported in current context
        }
      }
      if (candidates.length > 0) {
        save('rr.notified', [...notifiedRef.current].slice(-100))
      }
    },
    [],
  )

  const refresh = useCallback(
    async (currentFeeds: FeedSource[], forcePulse = false) => {
      setLoading(true)
      setPulseLoading(true)

      const feedsPromise = Promise.all(
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

      const pulsePromise = fetchCommunityPulse(forcePulse)

      const results = await feedsPromise
      const live = results.flatMap((r) => r.items)
      const errors: Record<string, string> = {}
      for (const r of results) if (r.error) errors[r.feed.id] = r.error
      setFeedErrors(errors)

      let scoredItems: FeedItem[] = []
      if (live.length > 0) {
        scoredItems = live.map((it) => {
          const breakdown = explainScore(it.title, it.description, it.pubDate, {
            feedId: it.feedId,
            feedTitle: it.feedTitle,
            link: it.link,
          })
          return {
            ...it,
            score: breakdown.score,
            scoreDimensions: breakdown.dimensions,
          }
        })
        setItems(scoredItems)
        setUsingSample(false)
        notifyHighSignal(scoredItems, alertsEnabled)
      } else {
        scoredItems = getSampleItems()
        setItems(scoredItems)
        setUsingSample(true)
      }
      setLastRefresh(new Date().toISOString())
      setLoading(false)

      if (live.length > 0) {
        void fetchMissingOgImages(scoredItems).then((imgMap) => {
          if (Object.keys(imgMap).length === 0) return
          setItems((prev) =>
            prev.map((it) =>
              !it.imageUrl && imgMap[it.link]
                ? { ...it, imageUrl: imgMap[it.link] ?? undefined }
                : it,
            ),
          )
        })
      }

      const pulseSnap = await pulsePromise
      setPulse(pulseSnap)
      setPulseLoading(false)

      if (pulseSnap.hn.length > 0) {
        void fetchMissingOgImages(pulseSnap.hn).then((imgMap) => {
          if (Object.keys(imgMap).length === 0) return
          setPulse((prev) => ({
            ...prev,
            hn: prev.hn.map((it) =>
              !it.imageUrl && imgMap[it.link]
                ? { ...it, imageUrl: imgMap[it.link] ?? undefined }
                : it,
            ),
          }))
        })
      }
    },
    [alertsEnabled, notifyHighSignal],
  )

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
    save('rr.notify', alertsEnabled)
  }, [alertsEnabled])

  useEffect(() => {
    void refresh(feeds, false)
    // Fetch once on mount; Refresh button re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeSourceItems: FeedItem[] = useMemo(() => {
    if (selectedFeed === 'pulse:hn') return pulse.hn
    if (selectedFeed === 'pulse:github') return pulse.github
    return items
  }, [selectedFeed, pulse.hn, pulse.github, items])

  const allKnownItems: FeedItem[] = useMemo(
    () => [...items, ...pulse.hn, ...pulse.github],
    [items, pulse.hn, pulse.github],
  )

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    return activeSourceItems
      .filter((it) => {
        if (
          selectedFeed === 'all' ||
          selectedFeed === 'pulse:hn' ||
          selectedFeed === 'pulse:github'
        ) {
          return true
        }
        return it.feedId === selectedFeed
      })
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
  }, [
    activeSourceItems,
    selectedFeed,
    filter,
    sortBy,
    query,
    readIds,
    savedIds,
  ])

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
      if ((e.key === 'j' || e.key === 'k') && activeView === 'feed') {
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
      } else if (e.key === 's' && activeId && activeView === 'feed') {
        e.preventDefault()
        e.stopPropagation()
        toggleSave(activeId)
      } else if (e.key === 'r') {
        e.preventDefault()
        e.stopPropagation()
        void refresh(feeds, true)
      } else if (e.key === '/') {
        e.preventDefault()
        e.stopPropagation()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [activeView, visibleItems, selectedItem, selectItem, toggleSave, refresh, feeds])

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
    void refresh(next, false)
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
    void refresh(DEFAULT_FEEDS, false)
  }

  const handleImportOpml = (xml: string): { ok: boolean; message: string } => {
    try {
      const imported = parseOpml(xml)
      const existingUrls = new Set(feeds.map((f) => f.url))
      const added = imported.filter((f) => !existingUrls.has(f.url))
      if (added.length === 0) {
        return {
          ok: true,
          message: `All ${imported.length} OPML feeds already subscribed.`,
        }
      }
      const next = [...feeds, ...added]
      setFeeds(next)
      void refresh(next, false)
      return {
        ok: true,
        message: `Imported ${added.length} feed${added.length === 1 ? '' : 's'} from OPML.`,
      }
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Invalid OPML file',
      }
    }
  }

  const handleSummarize = async (item: FeedItem) => {
    setSummaryLoadingId(item.id)
    setSummaryErrors((prev) => {
      const next = { ...prev }
      delete next[item.id]
      return next
    })
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          feedTitle: item.feedTitle,
          link: item.link,
          content: item.description,
        }),
      })
      const data = (await res.json()) as Partial<GeminiSummary> & {
        error?: string
      }
      if (!res.ok || !data.tldr) {
        throw new Error(data.error || `HTTP ${res.status} summarizing item`)
      }
      const summaryObj: GeminiSummary = {
        tldr: data.tldr,
        takeaways: Array.isArray(data.takeaways) ? data.takeaways : [],
        whyMatters: data.whyMatters ?? '',
      }
      setSummaries((prev) => {
        const entries = Object.entries({ ...prev, [item.id]: summaryObj })
        const trimmed = Object.fromEntries(entries.slice(-30))
        save('rr.summaries.v1', trimmed)
        return trimmed
      })
    } catch (err) {
      setSummaryErrors((prev) => ({
        ...prev,
        [item.id]:
          err instanceof Error ? err.message : 'Gemini summary unavailable.',
      }))
    } finally {
      setSummaryLoadingId((curr) => (curr === item.id ? null : curr))
    }
  }

  const handleShare = async (
    item: FeedItem,
  ): Promise<'shared' | 'copied' | 'cancelled'> => {
    const shareData = {
      title: item.title,
      text: `${item.title} (${item.score ?? 0} signal · ${item.feedTitle})`,
      url: item.link || window.location.href,
    }
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData)
        return 'shared'
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return 'cancelled'
        }
      }
    }
    try {
      await navigator.clipboard.writeText(
        `${shareData.title}\n${shareData.url}`,
      )
      return 'copied'
    } catch {
      return 'cancelled'
    }
  }

  const handleToggleAlerts = async () => {
    if (alertsEnabled) {
      setAlertsEnabled(false)
      return
    }
    if (typeof Notification === 'undefined') {
      setAlertsEnabled(false)
      return
    }
    if (Notification.permission === 'granted') {
      setAlertsEnabled(true)
      notifyHighSignal(allKnownItems, true)
      return
    }
    if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission()
      if (perm === 'granted') {
        setAlertsEnabled(true)
        notifyHighSignal(allKnownItems, true)
      }
    }
  }

  const isPulseLoading =
    (selectedFeed === 'pulse:hn' || selectedFeed === 'pulse:github') &&
    pulseLoading
  const activePulseError =
    selectedFeed === 'pulse:hn'
      ? pulse.errors.hn
      : selectedFeed === 'pulse:github'
        ? pulse.errors.github
        : undefined

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={250}>
        <div className="flex h-full flex-col bg-white text-zinc-950">
          <TopBar
            activeView={activeView}
            onViewChange={setActiveView}
            total={items.length}
            unread={unreadTotal}
            high={items.filter((it) => (it.score ?? 0) >= 70).length}
            lastRefresh={lastRefresh}
            loading={loading}
            alertsEnabled={alertsEnabled}
            query={query}
            onQueryChange={setQuery}
            searchInputRef={searchInputRef}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onRefresh={() => void refresh(feeds, true)}
            onToggleAlerts={() => void handleToggleAlerts()}
            onExportOpml={() => downloadOpml(feeds)}
            onRestoreDefaults={restoreDefaults}
          />
          {usingSample && (
            <p className="border-b border-zinc-200 bg-amber-50/80 px-4 py-1.5 text-xs text-amber-900">
              Showing sample data — live feeds are unreachable right now. Check
              your connection or add a feed below.
            </p>
          )}
          {activeView === 'feed' ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
              <FeedList
                feeds={feeds}
                unreadCounts={unreadCounts}
                totalUnread={unreadTotal}
                pulseCounts={{
                  hn: pulse.hn.length,
                  github: pulse.github.length,
                }}
                selectedFeed={selectedFeed}
                onSelect={setSelectedFeed}
                onAdd={addFeed}
                onRemove={removeFeed}
                onRestoreDefaults={restoreDefaults}
                onImportOpml={handleImportOpml}
                onExportOpml={() => downloadOpml(feeds)}
                errors={feedErrors}
              />
              <ItemList
                items={visibleItems}
                loading={loading || isPulseLoading}
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
                summaries={summaries}
                onToggleSave={toggleSave}
                onRefresh={() => void refresh(feeds, true)}
                pulseError={activePulseError}
              />
              <ReaderPane
                item={selectedItem}
                saved={selectedItem ? savedIds.includes(selectedItem.id) : false}
                geminiSummary={
                  selectedItem ? summaries[selectedItem.id] : undefined
                }
                summaryLoading={
                  selectedItem ? summaryLoadingId === selectedItem.id : false
                }
                summaryError={
                  selectedItem ? summaryErrors[selectedItem.id] : undefined
                }
                onSummarize={(it) => void handleSummarize(it)}
                onShare={handleShare}
                onToggleSave={toggleSave}
                onMarkUnread={(id) =>
                  setReadIds((prev) => prev.filter((x) => x !== id))
                }
                onOpenRadar={() => setActiveView('radar')}
              />
            </div>
          ) : (
            <SignalRadarView
              mode={activeView}
              items={allKnownItems}
              selectedItem={selectedItem}
              onSelectAndOpen={(id) => {
                if (id.startsWith('pulse-hn-')) setSelectedFeed('pulse:hn')
                else if (id.startsWith('pulse-gh-')) setSelectedFeed('pulse:github')
                else setSelectedFeed('all')
                selectItem(id)
                setActiveView('feed')
              }}
            />
          )}
        </div>
      </TooltipProvider>
    </MotionConfig>
  )
}
