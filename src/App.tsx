import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import AboutPage from './components/AboutPage'
import ChangelogPage from './components/ChangelogPage'
import CommandPalette from './components/CommandPalette'
import DailyBriefingView from './components/DailyBriefingView'
import DocsPage from './components/DocsPage'
import FeedList from './components/FeedList'
import ItemList, { type Filter } from './components/ItemList'
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal'
import NotFoundPage from './components/NotFoundPage'
import PrivacyPolicyPage from './components/PrivacyPolicyPage'
import ReaderPane from './components/ReaderPane'
import SettingsPage from './components/SettingsPage'
import ShortcutsPage from './components/ShortcutsPage'
import SignalRadarView from './components/SignalRadarView'
import TopBar, { type SortBy } from './components/TopBar'
import { TooltipProvider } from './components/ui/tooltip'
import { countNewSince, type FeedHealth } from './lib/briefing'
import {
  buildFullDataExport,
  downloadJsonExport,
  openExternalUrl,
} from './lib/export'
import {
  DEFAULT_FEEDS,
  fetchFeed,
  type FeedItem,
  type FeedSource,
} from './lib/feeds'
import type { GeminiSummary } from './lib/kiroTask'
import { downloadOpml, parseOpml } from './lib/opml'
import {
  DEFAULT_PROVIDER_STATUSES,
  rankItemsByCosine,
  sanitizeProviderId,
  type AIProviderId,
  type ProviderStatus,
} from './lib/providers'
import { fetchCommunityPulse, type PulseSnapshot } from './lib/pulse'
import {
  getRouteMeta,
  parseRoutePath,
  routeToPath,
  type AppRoute,
  type NavigableRoute,
} from './lib/routes'
import { getSampleItems } from './lib/sampleData'
import { explainScore } from './lib/scoring'
import {
  clearReaderStorage,
  DEFAULT_SETTINGS,
  initSessionVisitTimestamp,
  loadSettings,
  loadStorage,
  recordVisitTimestamp,
  saveStorage,
  SETTINGS_STORAGE_KEY,
  type ReaderSettings,
} from './lib/storage'

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
  const [settings, setSettings] = useState<ReaderSettings>(() => loadSettings())
  const [feeds, setFeeds] = useState<FeedSource[]>(() =>
    loadStorage('rr.feeds', DEFAULT_FEEDS),
  )
  const [activeView, setActiveView] = useState<AppRoute>(() =>
    typeof window !== 'undefined'
      ? parseRoutePath(window.location.pathname)
      : 'feed',
  )
  const [currentPathname, setCurrentPathname] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/',
  )
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [kiroModalOpen, setKiroModalOpen] = useState(false)
  const [lastVisitIso, setLastVisitIso] = useState<string | null>(() =>
    initSessionVisitTimestamp(),
  )
  const [items, setItems] = useState<FeedItem[]>([])
  const [feedHealth, setFeedHealth] = useState<Record<string, FeedHealth>>({})
  const [pulse, setPulse] = useState<PulseSnapshot>({
    hn: [],
    github: [],
    fetchedAt: '',
    cached: false,
    errors: {},
  })
  const [pulseLoading, setPulseLoading] = useState(true)
  const [readIds, setReadIds] = useState<string[]>(() =>
    loadStorage('rr.read', []),
  )
  const [savedIds, setSavedIds] = useState<string[]>(() =>
    loadStorage('rr.saved', []),
  )
  const [summaries, setSummaries] = useState<Record<string, GeminiSummary>>(
    () => loadStorage('rr.summaries.v1', {}),
  )
  const [summaryLoadingIds, setSummaryLoadingIds] = useState<
    Record<string, boolean>
  >({})
  const [summaryErrors, setSummaryErrors] = useState<Record<string, string>>({})
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(() =>
    loadStorage('rr.notify', false),
  )
  const notifiedRef = useRef<Set<string>>(
    new Set(loadStorage('rr.notified', [])),
  )
  const [selectedFeed, setSelectedFeed] = useState('all')
  const [filter, setFilter] = useState<Filter>(() => settings.defaultFilter)
  const [sortBy, setSortBy] = useState<SortBy>('score')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [feedErrors, setFeedErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<string | null>(null)
  const [usingSample, setUsingSample] = useState(false)
  const [providers, setProviders] = useState<ProviderStatus[]>(
    DEFAULT_PROVIDER_STATUSES,
  )
  const [semanticResult, setSemanticResult] = useState<{
    query: string
    provider: AIProviderId | null
    scores: Record<string, number>
  } | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const readerHeadingRef = useRef<HTMLHeadingElement>(null)

  const navigateTo = useCallback((route: NavigableRoute) => {
    const nextPath = routeToPath(route)
    setActiveView(route)
    setCurrentPathname(nextPath)
    if (
      typeof window !== 'undefined' &&
      window.location.pathname !== nextPath
    ) {
      window.history.pushState({ route }, '', nextPath)
    }
  }, [])

  useEffect(() => {
    const onPopState = () => {
      setCurrentPathname(window.location.pathname)
      setActiveView(parseRoutePath(window.location.pathname))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    const meta = getRouteMeta(activeView)
    document.title = meta
      ? meta.documentTitle
      : '404 Not Found — Resurrected Reader'
  }, [activeView])

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
        saveStorage('rr.notified', [...notifiedRef.current].slice(-100))
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
          const checkedAt = new Date().toISOString()
          try {
            const fetched = await fetchFeed(feed)
            return {
              feed,
              items: fetched,
              error: '',
              health: {
                lastFetchedAt: checkedAt,
                itemCount: fetched.length,
                ok: true,
              } satisfies FeedHealth,
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Fetch failed'
            return {
              feed,
              items: [] as FeedItem[],
              error: msg,
              health: {
                lastFetchedAt: checkedAt,
                itemCount: 0,
                ok: false,
                error: msg,
              } satisfies FeedHealth,
            }
          }
        }),
      )

      const pulsePromise = fetchCommunityPulse(forcePulse)

      const results = await feedsPromise
      const live = results.flatMap((r) => r.items)
      const errors: Record<string, string> = {}
      const nextHealth: Record<string, FeedHealth> = {}
      for (const r of results) {
        nextHealth[r.feed.id] = r.health
        if (r.error) errors[r.feed.id] = r.error
      }
      setFeedHealth(nextHealth)
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
    saveStorage(SETTINGS_STORAGE_KEY, settings)
  }, [settings])
  useEffect(() => {
    saveStorage('rr.feeds', feeds)
  }, [feeds])
  useEffect(() => {
    saveStorage('rr.read', readIds)
  }, [readIds])
  useEffect(() => {
    saveStorage('rr.saved', savedIds)
  }, [savedIds])
  useEffect(() => {
    saveStorage('rr.notify', alertsEnabled)
  }, [alertsEnabled])

  useEffect(() => {
    void refresh(feeds, false)
    // Fetch once on mount; Refresh button re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let active = true
    void fetch('/api/providers', { signal: AbortSignal.timeout(4000) })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { providers?: ProviderStatus[] } | null) => {
        if (!active || !data || !Array.isArray(data.providers)) return
        setProviders(data.providers)
      })
      .catch(() => {
        // Keep defaults quietly if providers endpoint is unreachable
      })
    return () => {
      active = false
    }
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

  const hasEmbeddingProvider = useMemo(
    () => providers.some((p) => p.available && p.supportsEmbeddings),
    [providers],
  )

  const feedAndTabItems = useMemo(() => {
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
  }, [activeSourceItems, selectedFeed, filter, readIds, savedIds])

  useEffect(() => {
    const cleanQuery = query.trim().toLowerCase()
    if (cleanQuery.length < 2 || !hasEmbeddingProvider || feedAndTabItems.length === 0) {
      setSemanticResult(null)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const docs = feedAndTabItems.slice(0, 60).map((it) => ({
        id: it.id,
        text: `${it.title}\n${it.description.slice(0, 400)}`,
      }))

      void fetch('/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          query: cleanQuery,
          documents: docs,
          provider: settings.aiProvider,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (
            data: {
              available?: boolean
              provider?: AIProviderId | null
              scores?: Record<string, number>
            } | null,
          ) => {
            if (controller.signal.aborted) return
            if (
              data?.available &&
              data.scores &&
              Object.keys(data.scores).length > 0
            ) {
              setSemanticResult({
                query: cleanQuery,
                provider: data.provider ? sanitizeProviderId(data.provider) : null,
                scores: data.scores,
              })
            } else {
              setSemanticResult(null)
            }
          },
        )
        .catch(() => {
          if (!controller.signal.aborted) setSemanticResult(null)
        })
    }, 280)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [query, hasEmbeddingProvider, feedAndTabItems, settings.aiProvider])

  const semanticActiveForQuery = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (
      q.length >= 2 &&
      semanticResult !== null &&
      semanticResult.query === q &&
      Object.keys(semanticResult.scores).length > 0
    )
  }, [query, semanticResult])

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q !== '' && semanticActiveForQuery && semanticResult) {
      return rankItemsByCosine(
        feedAndTabItems,
        semanticResult.scores,
        (it) =>
          it.title.toLowerCase().includes(q) ||
          it.description.toLowerCase().includes(q),
      )
    }

    return feedAndTabItems
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
  }, [feedAndTabItems, query, sortBy, semanticActiveForQuery, semanticResult])

  const selectedItem =
    visibleItems.find((it) => it.id === selectedId) ??
    visibleItems[0] ??
    null

  const selectItem = useCallback((id: string) => {
    setSelectedId(id)
    setReadIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }, [])

  const openItemInReader = useCallback(
    (id: string) => {
      if (id.startsWith('pulse-hn-')) setSelectedFeed('pulse:hn')
      else if (id.startsWith('pulse-gh-')) setSelectedFeed('pulse:github')
      else setSelectedFeed('all')
      selectItem(id)
      navigateTo('feed')
      requestAnimationFrame(() => readerHeadingRef.current?.focus())
    },
    [selectItem, navigateTo],
  )

  const toggleSave = useCallback((id: string) => {
    setSavedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }, [])

  const handleSummarize = useCallback(
    async (item: FeedItem) => {
      setSummaryLoadingIds((prev) => ({ ...prev, [item.id]: true }))
      setSummaryErrors((prev) => {
        if (!(item.id in prev)) return prev
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
            provider: settings.aiProvider,
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
          provider: data.provider ? sanitizeProviderId(data.provider) : undefined,
        }
        setSummaries((prev) => {
          const entries = Object.entries({ ...prev, [item.id]: summaryObj })
          const trimmed = Object.fromEntries(entries.slice(-30))
          saveStorage('rr.summaries.v1', trimmed)
          return trimmed
        })
      } catch (err) {
        setSummaryErrors((prev) => ({
          ...prev,
          [item.id]:
            err instanceof Error ? err.message : 'AI summary unavailable.',
        }))
      } finally {
        setSummaryLoadingIds((prev) => {
          if (!prev[item.id]) return prev
          const next = { ...prev }
          delete next[item.id]
          return next
        })
      }
    },
    [settings.aiProvider],
  )

  // Keyboard: Cmd/Ctrl+K palette, ? shortcuts modal, j/k move, Enter open, o original, s summarize, e Kiro modal, b bookmark, r refresh, / search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        setPaletteOpen((open) => !open)
        return
      }

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
      if (e.key === '?') {
        e.preventDefault()
        e.stopPropagation()
        setShortcutsOpen((open) => !open)
      } else if ((e.key === 'j' || e.key === 'k') && activeView === 'feed') {
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
      } else if (
        e.key === 'Enter' &&
        activeView === 'feed' &&
        activeId &&
        target?.tagName !== 'BUTTON' &&
        target?.tagName !== 'A'
      ) {
        e.preventDefault()
        e.stopPropagation()
        selectItem(activeId)
        readerHeadingRef.current?.focus()
      } else if (e.key === 'o' && selectedItem && activeView === 'feed') {
        e.preventDefault()
        e.stopPropagation()
        openExternalUrl(selectedItem.link)
      } else if (e.key === 's' && selectedItem && activeView === 'feed') {
        e.preventDefault()
        e.stopPropagation()
        void handleSummarize(selectedItem)
      } else if (e.key === 'e' && selectedItem && activeView === 'feed') {
        e.preventDefault()
        e.stopPropagation()
        setKiroModalOpen(true)
      } else if (e.key === 'b' && activeId && activeView === 'feed') {
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
  }, [
    activeView,
    visibleItems,
    selectedItem,
    selectItem,
    toggleSave,
    refresh,
    feeds,
    handleSummarize,
  ])

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

  const newSinceCount = useMemo(
    () => countNewSince(items, lastVisitIso),
    [items, lastVisitIso],
  )

  const visibleNewCount = useMemo(
    () => countNewSince(visibleItems, lastVisitIso),
    [visibleItems, lastVisitIso],
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

  const handleMarkAllVisited = () => {
    const now = recordVisitTimestamp()
    setLastVisitIso(now)
  }

  const handleExportJson = () => {
    const payload = buildFullDataExport({
      feeds,
      readIds,
      savedIds,
      summaries,
      settings,
      lastVisitIso,
    })
    return downloadJsonExport(payload)
  }

  const handleClearAllData = () => {
    clearReaderStorage()
    setFeeds(DEFAULT_FEEDS)
    setReadIds([])
    setSavedIds([])
    setSummaries({})
    setSummaryErrors({})
    setAlertsEnabled(false)
    setSettings(DEFAULT_SETTINGS)
    setFilter(DEFAULT_SETTINGS.defaultFilter)
    setLastVisitIso(null)
    notifiedRef.current = new Set()
    void refresh(DEFAULT_FEEDS, true)
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
    <MotionConfig
      reducedMotion={settings.reducedMotion === 'reduce' ? 'always' : 'user'}
    >
      <TooltipProvider delayDuration={250}>
        <div className="flex h-full flex-col bg-white text-zinc-950">
          <TopBar
            activeView={activeView}
            onViewChange={navigateTo}
            total={items.length}
            unread={unreadTotal}
            high={items.filter((it) => (it.score ?? 0) >= 70).length}
            newCount={newSinceCount}
            lastRefresh={lastRefresh}
            loading={loading}
            alertsEnabled={alertsEnabled}
            query={query}
            onQueryChange={setQuery}
            searchInputRef={searchInputRef}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onOpenCommandPalette={() => setPaletteOpen(true)}
            onOpenShortcutsModal={() => setShortcutsOpen(true)}
            onRefresh={() => void refresh(feeds, true)}
            onToggleAlerts={() => void handleToggleAlerts()}
            onExportOpml={() => downloadOpml(feeds)}
            onExportJson={() => void handleExportJson()}
            onRestoreDefaults={restoreDefaults}
          />
          {usingSample && (
            <p className="border-b border-zinc-200 bg-amber-50/80 px-4 py-1.5 text-xs text-amber-900">
              Showing sample data — live feeds are unreachable right now. Check
              your connection or add a feed below.
            </p>
          )}
          <AnimatePresence mode="wait" initial={false}>
            {activeView === 'feed' ? (
              <motion.div
                key="view-feed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden"
              >
                <FeedList
                  feeds={feeds}
                  unreadCounts={unreadCounts}
                  totalUnread={unreadTotal}
                  pulseCounts={{
                    hn: pulse.hn.length,
                    github: pulse.github.length,
                  }}
                  feedHealth={feedHealth}
                  selectedFeed={selectedFeed}
                  onSelect={setSelectedFeed}
                  onAdd={addFeed}
                  onRemove={removeFeed}
                  onRestoreDefaults={restoreDefaults}
                  onImportOpml={handleImportOpml}
                  onExportOpml={() => downloadOpml(feeds)}
                  onNavigate={navigateTo}
                  onOpenShortcutsModal={() => setShortcutsOpen(true)}
                  errors={feedErrors}
                />
                <ItemList
                  items={visibleItems}
                  loading={loading || isPulseLoading}
                  selectedId={selectedItem?.id ?? null}
                  onSelect={selectItem}
                  onOpenItem={(id) => {
                    selectItem(id)
                    readerHeadingRef.current?.focus()
                  }}
                  filter={filter}
                  onFilterChange={setFilter}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  query={query}
                  onQueryChange={setQuery}
                  readIds={readIds}
                  savedIds={savedIds}
                  summaries={summaries}
                  lastVisitIso={lastVisitIso}
                  newCount={visibleNewCount}
                  density={settings.density}
                  semanticInfo={{
                    active: semanticActiveForQuery,
                    provider: semanticResult?.provider ?? null,
                  }}
                  onMarkAllVisited={handleMarkAllVisited}
                  onToggleSave={toggleSave}
                  onOpenRadar={() => navigateTo('radar')}
                  onRefresh={() => void refresh(feeds, true)}
                  pulseError={activePulseError}
                />
                <ReaderPane
                  item={selectedItem}
                  saved={
                    selectedItem ? savedIds.includes(selectedItem.id) : false
                  }
                  lastVisitIso={lastVisitIso}
                  density={settings.density}
                  geminiSummary={
                    selectedItem ? summaries[selectedItem.id] : undefined
                  }
                  summaryLoading={
                    selectedItem ? Boolean(summaryLoadingIds[selectedItem.id]) : false
                  }
                  summaryError={
                    selectedItem ? summaryErrors[selectedItem.id] : undefined
                  }
                  kiroModalOpen={kiroModalOpen}
                  onKiroModalOpenChange={setKiroModalOpen}
                  readerHeadingRef={readerHeadingRef}
                  onSummarize={(it) => void handleSummarize(it)}
                  onShare={handleShare}
                  onToggleSave={toggleSave}
                  onMarkUnread={(id) =>
                    setReadIds((prev) => prev.filter((x) => x !== id))
                  }
                  onOpenRadar={() => navigateTo('radar')}
                />
              </motion.div>
            ) : activeView === 'briefing' ? (
              <motion.div
                key="view-briefing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <DailyBriefingView
                  items={allKnownItems}
                  summaries={summaries}
                  summaryLoadingIds={summaryLoadingIds}
                  summaryErrors={summaryErrors}
                  lastVisitIso={lastVisitIso}
                  onSummarize={handleSummarize}
                  onOpenInReader={openItemInReader}
                  onOpenRadar={() => navigateTo('radar')}
                  onNavigate={navigateTo}
                />
              </motion.div>
            ) : activeView === 'radar' || activeView === 'system' ? (
              <motion.div
                key={`view-${activeView}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <SignalRadarView
                  mode={activeView}
                  items={allKnownItems}
                  selectedItem={selectedItem}
                  feeds={feeds}
                  feedHealth={feedHealth}
                  feedErrors={feedErrors}
                  loading={loading}
                  onRefresh={() => void refresh(feeds, true)}
                  onSelectFeed={(feedId) => {
                    setSelectedFeed(feedId)
                    navigateTo('feed')
                  }}
                  onSelectAndOpen={openItemInReader}
                  onNavigate={navigateTo}
                />
              </motion.div>
            ) : activeView === 'docs' ? (
              <motion.div
                key="view-docs"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <DocsPage
                  onNavigate={navigateTo}
                  onOpenShortcutsModal={() => setShortcutsOpen(true)}
                />
              </motion.div>
            ) : activeView === 'shortcuts' ? (
              <motion.div
                key="view-shortcuts"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <ShortcutsPage
                  onNavigate={navigateTo}
                  onOpenModal={() => setShortcutsOpen(true)}
                />
              </motion.div>
            ) : activeView === 'about' ? (
              <motion.div
                key="view-about"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <AboutPage onNavigate={navigateTo} />
              </motion.div>
            ) : activeView === 'changelog' ? (
              <motion.div
                key="view-changelog"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <ChangelogPage onNavigate={navigateTo} />
              </motion.div>
            ) : activeView === 'privacy' ? (
              <motion.div
                key="view-privacy"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <PrivacyPolicyPage
                  onNavigate={navigateTo}
                  onExportJson={() => void handleExportJson()}
                  onClearAllData={handleClearAllData}
                />
              </motion.div>
            ) : activeView === 'settings' ? (
              <motion.div
                key="view-settings"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <SettingsPage
                  settings={settings}
                  providers={providers}
                  onUpdateSettings={setSettings}
                  onApplyDefaultFilterNow={setFilter}
                  alertsEnabled={alertsEnabled}
                  onToggleAlerts={() => void handleToggleAlerts()}
                  stats={{
                    feedsCount: feeds.length,
                    readCount: readIds.length,
                    savedCount: savedIds.length,
                    summariesCount: Object.keys(summaries).length,
                  }}
                  onExportJson={handleExportJson}
                  onExportOpml={() => downloadOpml(feeds)}
                  onClearAllData={handleClearAllData}
                  onNavigate={navigateTo}
                />
              </motion.div>
            ) : (
              <motion.div
                key="view-404"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <NotFoundPage
                  pathname={currentPathname}
                  onNavigate={navigateTo}
                  onOpenCommandPalette={() => setPaletteOpen(true)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <CommandPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            feeds={feeds}
            items={allKnownItems}
            onSelectView={(view) => navigateTo(view)}
            onSelectFeed={(feedId) => {
              setSelectedFeed(feedId)
              navigateTo('feed')
            }}
            onSelectItem={openItemInReader}
          />

          <KeyboardShortcutsModal
            open={shortcutsOpen}
            onOpenChange={setShortcutsOpen}
            onNavigate={navigateTo}
          />
        </div>
      </TooltipProvider>
    </MotionConfig>
  )
}
