import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import AboutPage from './components/AboutPage'
import AskPanel from './components/AskPanel'
import ChangelogPage from './components/ChangelogPage'
import CommandPalette from './components/CommandPalette'
import ContactPage from './components/ContactPage'
import DailyBriefingView from './components/DailyBriefingView'
import DocsPage from './components/DocsPage'
import FaqPage from './components/FaqPage'
import FeedList from './components/FeedList'
import ItemList, { type Filter } from './components/ItemList'
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal'
import NewsletterModal from './components/NewsletterModal'
import NotFoundPage from './components/NotFoundPage'
import PrivacyPolicyPage from './components/PrivacyPolicyPage'
import ReaderPane from './components/ReaderPane'
import SettingsPage from './components/SettingsPage'
import ShortcutsPage from './components/ShortcutsPage'
import SignalRadarView from './components/SignalRadarView'
import TermsPage from './components/TermsPage'
import TopBar, { type SortBy } from './components/TopBar'
import UserGuidePage from './components/UserGuidePage'
import { TooltipProvider } from './components/ui/tooltip'
import {
  countNewSince,
  runWithConcurrency,
  selectDailyBriefingItems,
  type FeedHealth,
} from './lib/briefing'
import {
  buildFullDataExport,
  downloadJsonExport,
  openExternalUrl,
} from './lib/export'
import { extract, type ExtractedArticle } from './lib/extract'
import {
  DEFAULT_FEEDS,
  fetchFeed,
  type FeedItem,
  type FeedSource,
} from './lib/feeds'
import type { GeminiSummary } from './lib/kiroTask'
import {
  addEntryToFeed,
  createNewsletterFeedRecord,
  newsletterEntryToFeedItem,
  newsletterFeedToFeedSource,
  parseRawEmail,
  type NewsletterFeedRecord,
} from './lib/newsletter'
import { downloadOpml, parseOpml } from './lib/opml'
import { demoProfile, emptyProfile, personalBoost, recordFeedback, type Feedback, type TasteProfile } from './lib/personalize'
import {
  DEFAULT_PROVIDER_STATUSES,
  sanitizeProviderId,
  type AIProviderId,
  type ProviderStatus,
} from './lib/providers'
import { fetchCommunityPulse, type PulseSnapshot } from './lib/pulse'
import { reloadPwa, startPwaUpdates, type UpdateState } from './lib/pwa/updates'
import {
  getRouteMeta,
  parseRoutePath,
  routeToPath,
  type AppRoute,
  type NavigableRoute,
} from './lib/routes'
import { getSampleItems } from './lib/sampleData'
import { applyPersonalBoost, explainScore } from './lib/scoring'
import {
  createSemanticSearchClient,
  formatItemEmbeddingText,
  isLocalSemanticSupported,
  rankItemsHybrid,
  type SemanticProgressState,
} from './lib/semanticSearch'
import {
  findResurfacedReads,
  pastReadToFeedItem,
  rankRelatedPastReads,
  type PastReadRecord,
  type ResurfacedMatch,
  type SecondBrainMatch,
} from './lib/secondBrain'
import {
  computeDecayWeightedTasteVector,
  rankFeedWithTasteVector,
} from './lib/tasteVector'
import {
  cachedCoverImages,
  clearReaderStorage,
  DEFAULT_SETTINGS,
  initSessionVisitTimestamp,
  loadNewsletterFeeds,
  loadPastReads,
  loadSettings,
  loadTasteProfile,
  loadReaderSnapshot,
  loadStorage,
  recordVisitTimestamp,
  saveNewsletterFeeds,
  savePastReads,
  saveStorage,
  saveTasteProfile,
  saveReaderSnapshot,
  SETTINGS_STORAGE_KEY,
  unmarkSavedPastRead,
  upsertPastRead,
  type ReaderSettings,
} from './lib/storage'
import { isJsonResponse, parseSummarizeResponse } from './lib/summarize'
import { buildSpokenBriefingScript } from './lib/spokenScript'
import {
  clampSpeechRate,
  createBriefingPlayer,
  isGeminiVoiceSelection,
  type AudioPlaybackEngineMode,
  type BriefingPlaybackStatus,
  type BriefingPlayer,
  type BriefingTtsStatus,
  type DailyBriefingItem,
} from './lib/tts'

async function fetchMissingOgImages(
  candidates: FeedItem[],
  onFresh: (images: Record<string, string | null>) => void,
): Promise<Record<string, string | null>> {
  const urls = [
    ...new Set(
      candidates
        .filter(
          (it) =>
            !it.imageUrl &&
            /^https?:\/\//i.test(it.link) &&
            !it.link.includes('/rss/'),
        )
        .map((it) => it.link),
    ),
  ].slice(0, 12)
  if (urls.length === 0) return {}
  return cachedCoverImages(urls, onFresh)
}

export default function App() {
  const [settings, setSettings] = useState<ReaderSettings>(() => loadSettings())
  const [taste, setTaste] = useState<TasteProfile>(emptyProfile)
  const [tasteReady, setTasteReady] = useState(false)
  const [tasteStatus, setTasteStatus] = useState('')
  const tasteRef = useRef(taste)
  const tasteWrites = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => {
    let active = true
    void loadTasteProfile().then((profile) => {
      if (!active) return
      tasteRef.current = profile
      setTaste(profile)
      setTasteReady(true)
    })
    return () => { active = false }
  }, [])
  const updateTaste = useCallback((profile: TasteProfile, message: string) => {
    tasteRef.current = profile
    setTaste(profile)
    tasteWrites.current = tasteWrites.current.then(async () => {
      const saved = await saveTasteProfile(profile)
      setTasteStatus(saved ? message : 'Could not save taste locally; changes are temporary.')
    })
  }, [])
  const learn = useCallback((item: FeedItem | undefined, feedback: Feedback) => {
    if (!tasteReady || !settings.personalBoostEnabled || !item || item.sample) return
    updateTaste(recordFeedback(item.id, feedback, item, tasteRef.current), 'Taste updated on this device.')
  }, [tasteReady, settings.personalBoostEnabled, updateTaste])

  const briefingPlayerRef = useRef<BriefingPlayer | null>(null)
  const mp3AudioRef = useRef<HTMLAudioElement | null>(null)
  const mp3ObjectUrlRef = useRef<string | null>(null)
  const mp3ItemsRef = useRef<DailyBriefingItem[]>([])
  const audioRunIdRef = useRef<number>(0)
  const audioAbortRef = useRef<AbortController | null>(null)
  const [audioStatus, setAudioStatus] = useState<BriefingPlaybackStatus>('idle')
  const [audioPreparing, setAudioPreparing] = useState(false)
  const [audioItemIndex, setAudioItemIndex] = useState<number>(-1)
  const [audioItemId, setAudioItemId] = useState<string | null>(null)
  const [audioItemTotal, setAudioItemTotal] = useState<number>(0)
  const [audioItemTitle, setAudioItemTitle] = useState<string>('')
  const [audioError, setAudioError] = useState<string | null>(null)
  const [audioCacheStatus, setAudioCacheStatus] = useState<'HIT' | 'MISS' | 'BYPASS' | null>(null)
  const [audioModeNote, setAudioModeNote] = useState<string | null>(null)
  const [activeAudioEngine, setActiveAudioEngine] = useState<AudioPlaybackEngineMode | null>(null)
  const [ttsStatus, setTtsStatus] = useState<BriefingTtsStatus>({
    available: false,
    model: 'gemini-3.8-flash-lite-tts',
    r2Bound: false,
    defaultVoice: 'Kore',
    voices: [],
  })

  const releaseMp3Audio = useCallback(() => {
    if (mp3AudioRef.current) {
      mp3AudioRef.current.pause()
      mp3AudioRef.current.onended = null
      mp3AudioRef.current.onerror = null
      mp3AudioRef.current.ontimeupdate = null
      mp3AudioRef.current.src = ''
      mp3AudioRef.current = null
    }
    if (mp3ObjectUrlRef.current) {
      URL.revokeObjectURL(mp3ObjectUrlRef.current)
      mp3ObjectUrlRef.current = null
    }
    mp3ItemsRef.current = []
  }, [])

  useEffect(() => {
    const player = createBriefingPlayer()
    briefingPlayerRef.current = player
    const unsubscribe = player.subscribe({
      onStateChange: (status) => {
        setAudioStatus(status)
        if (status === 'idle') {
          setAudioItemIndex(-1)
          setAudioItemId(null)
          setAudioItemTotal(0)
          setAudioItemTitle('')
        }
      },
      onItemChange: (index, item) => {
        setAudioItemIndex(index)
        setAudioItemId(item.id)
        setAudioItemTitle(item.title)
      },
      onError: (message) => {
        setAudioError(message)
      },
    })
    return () => {
      unsubscribe()
      audioAbortRef.current?.abort()
      player.stop()
      releaseMp3Audio()
      briefingPlayerRef.current = null
    }
  }, [releaseMp3Audio])

  useEffect(() => {
    briefingPlayerRef.current?.setOptions({
      voiceURI: isGeminiVoiceSelection(settings.audioVoiceURI)
        ? null
        : settings.audioVoiceURI,
      rate: settings.audioRate,
    })
    if (mp3AudioRef.current) {
      mp3AudioRef.current.playbackRate = clampSpeechRate(settings.audioRate)
    }
  }, [settings.audioVoiceURI, settings.audioRate])

  const startWebSpeechSpokenFallback = useCallback(
    (briefingItems: DailyBriefingItem[], note: string | null) => {
      const built = buildSpokenBriefingScript(briefingItems)
      const enriched = briefingItems.map((item, idx) => ({
        ...item,
        spokenText: built.segments[idx]?.text ?? `${item.title}. ${item.tldr}`,
      }))
      setAudioCacheStatus(null)
      setAudioModeNote(note)
      setActiveAudioEngine('web-speech')
      setAudioItemTotal(enriched.length)
      briefingPlayerRef.current?.play(enriched, {
        voiceURI: isGeminiVoiceSelection(settings.audioVoiceURI)
          ? null
          : settings.audioVoiceURI,
        rate: settings.audioRate,
      })
    },
    [settings.audioVoiceURI, settings.audioRate],
  )

  const handlePlayBriefing = useCallback(
    (briefingItems: DailyBriefingItem[]) => {
      if (briefingItems.length === 0) return
      audioRunIdRef.current += 1
      const runId = audioRunIdRef.current
      audioAbortRef.current?.abort()
      briefingPlayerRef.current?.stop()
      releaseMp3Audio()
      setAudioError(null)
      setAudioCacheStatus(null)
      setAudioModeNote(null)

      const selectedVoice = settings.audioVoiceURI
      const wantsGemini =
        ttsStatus.available &&
        navigator.onLine &&
        (isGeminiVoiceSelection(selectedVoice) || selectedVoice === null)

      if (!wantsGemini) {
        const note = !ttsStatus.available
          ? 'Gemini 3.8 Flash-Lite TTS unavailable (no server key configured) — playing spoken script via on-device Web Speech API.'
          : !navigator.onLine
            ? 'Offline — playing spoken script via on-device Web Speech API.'
            : 'Playing spoken script with selected on-device Web Speech voice.'
        startWebSpeechSpokenFallback(briefingItems, note)
        return
      }

      const built = buildSpokenBriefingScript(briefingItems)
      const voiceName = isGeminiVoiceSelection(selectedVoice)
        ? selectedVoice!.replace(/^gemini:/i, '')
        : ttsStatus.defaultVoice || 'Kore'
      const controller = new AbortController()
      audioAbortRef.current = controller
      setAudioPreparing(true)
      setAudioItemTotal(briefingItems.length)

      void (async () => {
        try {
          const res = await fetch('/api/briefing/audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              items: briefingItems,
              script: built.script,
              voice: voiceName,
            }),
          })
          if (controller.signal.aborted || runId !== audioRunIdRef.current) {
            return
          }

          const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
          if (!res.ok || !contentType.includes('audio/')) {
            let reason = `HTTP ${res.status}`
            if (contentType.includes('application/json')) {
              const payload = (await res.json().catch(() => null)) as {
                error?: string
              } | null
              if (payload?.error) reason = payload.error
            }
            setAudioPreparing(false)
            startWebSpeechSpokenFallback(
              briefingItems,
              `${reason} — playing spoken script via on-device Web Speech API.`,
            )
            return
          }

          const blob = await res.blob()
          if (controller.signal.aborted || runId !== audioRunIdRef.current) {
            return
          }

          const cacheHeader = res.headers.get('x-briefing-cache')
          const resolvedCache =
            cacheHeader === 'HIT' || cacheHeader === 'MISS' || cacheHeader === 'BYPASS'
              ? cacheHeader
              : null
          const objectUrl = URL.createObjectURL(blob)
          const audio = new Audio(objectUrl)
          audio.playbackRate = clampSpeechRate(settings.audioRate)

          mp3AudioRef.current = audio
          mp3ObjectUrlRef.current = objectUrl
          mp3ItemsRef.current = [...briefingItems]

          audio.ontimeupdate = () => {
            if (runId !== audioRunIdRef.current) return
            const totalItems = mp3ItemsRef.current.length
            if (!totalItems || !Number.isFinite(audio.duration) || audio.duration <= 0) {
              return
            }
            const ratio = Math.min(0.999, Math.max(0, audio.currentTime / audio.duration))
            const idx = Math.min(totalItems - 1, Math.floor(ratio * totalItems))
            const item = mp3ItemsRef.current[idx]
            if (item) {
              setAudioItemIndex(idx)
              setAudioItemId(item.id)
              setAudioItemTitle(item.title)
            }
          }

          audio.onended = () => {
            if (runId !== audioRunIdRef.current) return
            releaseMp3Audio()
            setAudioStatus('idle')
            setAudioItemIndex(-1)
            setAudioItemId(null)
            setAudioItemTotal(0)
            setAudioItemTitle('')
          }

          audio.onerror = () => {
            if (runId !== audioRunIdRef.current) return
            releaseMp3Audio()
            setAudioStatus('idle')
            setAudioError('Browser failed to decode MP3 briefing audio.')
          }

          setAudioCacheStatus(resolvedCache)
          setActiveAudioEngine('gemini-tts')
          setAudioModeNote(
            `Gemini 3.8 Flash-Lite TTS (${voiceName}) · ${
              resolvedCache === 'HIT'
                ? 'served from R2 cache'
                : resolvedCache === 'MISS'
                  ? 'encoded MP3 and cached in R2'
                  : 'encoded MP3'
            }.`,
          )
          setAudioItemIndex(0)
          setAudioItemId(briefingItems[0]?.id ?? null)
          setAudioItemTitle(briefingItems[0]?.title ?? '')
          setAudioPreparing(false)
          await audio.play()
          if (runId === audioRunIdRef.current) {
            setAudioStatus('speaking')
          }
        } catch (err) {
          if (controller.signal.aborted || runId !== audioRunIdRef.current) return
          setAudioPreparing(false)
          const msg =
            err instanceof Error ? err.message : 'Gemini TTS request failed'
          startWebSpeechSpokenFallback(
            briefingItems,
            `${msg} — playing spoken script via on-device Web Speech API.`,
          )
        }
      })()
    },
    [
      ttsStatus.available,
      ttsStatus.defaultVoice,
      settings.audioVoiceURI,
      settings.audioRate,
      releaseMp3Audio,
      startWebSpeechSpokenFallback,
    ],
  )

  const handleTogglePauseAudio = useCallback(() => {
    const mp3 = mp3AudioRef.current
    if (mp3) {
      if (!mp3.paused) {
        mp3.pause()
        setAudioStatus('paused')
      } else {
        void mp3.play()
        setAudioStatus('speaking')
      }
      return
    }
    const player = briefingPlayerRef.current
    if (!player) return
    if (player.getStatus() === 'speaking') {
      player.pause()
    } else if (player.getStatus() === 'paused') {
      player.resume()
    }
  }, [])

  const handleStopAudio = useCallback(() => {
    audioRunIdRef.current += 1
    audioAbortRef.current?.abort()
    audioAbortRef.current = null
    setAudioPreparing(false)
    releaseMp3Audio()
    briefingPlayerRef.current?.stop()
    setActiveAudioEngine(null)
    setAudioStatus('idle')
    setAudioItemIndex(-1)
    setAudioItemId(null)
    setAudioItemTotal(0)
    setAudioItemTitle('')
  }, [releaseMp3Audio])

  const handleAudioSettingsChange = useCallback(
    (patch: { audioVoiceURI?: string | null; audioRate?: number }) => {
      setSettings((prev) => ({
        ...prev,
        ...(patch.audioVoiceURI !== undefined
          ? { audioVoiceURI: patch.audioVoiceURI }
          : {}),
        ...(patch.audioRate !== undefined ? { audioRate: patch.audioRate } : {}),
      }))
    },
    [],
  )

  const [feeds, setFeeds] = useState<FeedSource[]>(() =>
    loadStorage('rr.feeds', DEFAULT_FEEDS),
  )
  const [newsletterFeeds, setNewsletterFeeds] = useState<
    NewsletterFeedRecord[]
  >(() => loadNewsletterFeeds())
  const newsletterFeedsRef = useRef(newsletterFeeds)
  const [newsletterModalOpen, setNewsletterModalOpen] = useState(false)
  const [activeView, setActiveView] = useState<AppRoute>(() =>
    typeof window !== 'undefined'
      ? parseRoutePath(window.location.pathname)
      : 'feed',
  )
  const [currentPathname, setCurrentPathname] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/',
  )
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const [askQuestion, setAskQuestion] = useState('')
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
  const [pastReads, setPastReads] = useState<PastReadRecord[]>(() =>
    loadPastReads(),
  )
  const [secondBrainVectors, setSecondBrainVectors] = useState<
    Record<string, number[]>
  >({})
  const [bgeM3Vectors, setBgeM3Vectors] = useState<Record<string, number[]>>({})
  const workersAiEmbedDisabledRef = useRef(false)
  const [liveRelatedMatches, setLiveRelatedMatches] = useState<{
    targetId: string
    matches: SecondBrainMatch[]
  } | null>(null)
  const [liveResurfacedMatches, setLiveResurfacedMatches] = useState<
    ResurfacedMatch[] | null
  >(null)
  const [secondBrainServerScores, setSecondBrainServerScores] = useState<
    Record<string, Record<string, number>>
  >({})
  const [summaries, setSummaries] = useState<Record<string, GeminiSummary>>(
    () => loadStorage('rr.summaries.v1', {}),
  )
  const [summaryLoadingIds, setSummaryLoadingIds] = useState<
    Record<string, boolean>
  >({})
  const [summaryErrors, setSummaryErrors] = useState<Record<string, string>>({})
  const [articles, setArticles] = useState<Record<string, ExtractedArticle>>({})
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
    mode: 'local' | 'server'
    provider: AIProviderId | null
    scores: Record<string, number>
  } | null>(null)
  const semanticClient = useMemo(() => createSemanticSearchClient(), [])
  const [semanticProgress, setSemanticProgress] =
    useState<SemanticProgressState>(() => semanticClient.getState())
  useEffect(() => {
    const unsubscribe = semanticClient.subscribe(setSemanticProgress)
    return () => {
      unsubscribe()
      semanticClient.dispose()
    }
  }, [semanticClient])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const readerHeadingRef = useRef<HTMLHeadingElement>(null)
  const realItemsRef = useRef<FeedItem[]>([])
  const [offline, setOffline] = useState(!navigator.onLine)
  const [restored, setRestored] = useState(false)
  const [updateState, setUpdateState] = useState<UpdateState>('idle')
  const [updateError, setUpdateError] = useState('')
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const updateNoticeRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (updateState !== 'idle' && !updateDismissed) updateNoticeRef.current?.showPopover?.()
  }, [updateState, updateDismissed])

  useEffect(() => {
    const changed = () => setOffline(!navigator.onLine)
    window.addEventListener('online', changed)
    window.addEventListener('offline', changed)
    return () => {
      window.removeEventListener('online', changed)
      window.removeEventListener('offline', changed)
    }
  }, [])
  useEffect(() => {
    if (import.meta.env.PROD) return startPwaUpdates(setUpdateState)
  }, [])

  const handleUpdate = async () => {
    setUpdateState('reloading')
    setUpdateError('')
    try {
      await saveReaderSnapshot({ items, pulse, feedHealth, fetchedAt: lastRefresh ?? '', selectedId, selectedFeed })
      await reloadPwa()
    } catch (error) {
      setUpdateState('error')
      setUpdateError(error instanceof Error ? error.message : 'Reload failed. Try again online.')
    }
  }

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
      if (!navigator.onLine) {
        setLoading(false)
        setPulseLoading(false)
        return
      }
      setLoading(true)
      setPulseLoading(true)

      if (newsletterFeedsRef.current.length > 0) {
        try {
          await fetch('/api/newsletter/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feeds: newsletterFeedsRef.current }),
            signal: AbortSignal.timeout(3500),
          })
        } catch {
          // Best-effort sync; local newsletter records still hydrate items below
        }
      }

      const feedsPromise = Promise.all(
        currentFeeds.map(async (feed) => {
          const checkedAt = new Date().toISOString()
          try {
            const fetched = await fetchFeed(feed)
            const localNewsletter =
              feed.kind === 'newsletter'
                ? newsletterFeedsRef.current.find((nf) => nf.id === feed.id)
                : undefined
            const itemsForFeed =
              fetched.length > 0 || !localNewsletter
                ? fetched
                : localNewsletter.entries.map((entry) =>
                    newsletterEntryToFeedItem(
                      entry,
                      localNewsletter,
                      window.location.origin,
                    ),
                  )
            return {
              feed,
              items: itemsForFeed,
              error: '',
              health: {
                lastFetchedAt: checkedAt,
                itemCount: itemsForFeed.length,
                ok: true,
              } satisfies FeedHealth,
            }
          } catch (e) {
            const localNewsletter =
              feed.kind === 'newsletter'
                ? newsletterFeedsRef.current.find((nf) => nf.id === feed.id)
                : undefined
            if (localNewsletter) {
              const fallbackItems = localNewsletter.entries.map((entry) =>
                newsletterEntryToFeedItem(
                  entry,
                  localNewsletter,
                  window.location.origin,
                ),
              )
              return {
                feed,
                items: fallbackItems,
                error: '',
                health: {
                  lastFetchedAt: checkedAt,
                  itemCount: fallbackItems.length,
                  ok: true,
                } satisfies FeedHealth,
              }
            }
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
        realItemsRef.current = scoredItems
        setUsingSample(false)
        notifyHighSignal(scoredItems, alertsEnabled)
        setLastRefresh(new Date().toISOString())
      } else if (realItemsRef.current.length === 0) {
        scoredItems = getSampleItems()
        setItems(scoredItems)
        setUsingSample(true)
      }
      setLoading(false)

      if (live.length > 0) {
        const applyImages = (imgMap: Record<string, string | null>) => {
          if (Object.keys(imgMap).length === 0) return
          setItems((prev) =>
            prev.map((it) =>
              !it.imageUrl && imgMap[it.link]
                ? { ...it, imageUrl: imgMap[it.link] ?? undefined }
                : it,
            ),
          )
        }
        void fetchMissingOgImages(scoredItems, applyImages).then(applyImages)
      }

      const pulseSnap = await pulsePromise
      setPulse(pulseSnap)
      setPulseLoading(false)

      if (pulseSnap.hn.length > 0) {
        const applyImages = (imgMap: Record<string, string | null>) => {
          if (Object.keys(imgMap).length === 0) return
          setPulse((prev) => ({
            ...prev,
            hn: prev.hn.map((it) =>
              !it.imageUrl && imgMap[it.link]
                ? { ...it, imageUrl: imgMap[it.link] ?? undefined }
                : it,
            ),
          }))
        }
        void fetchMissingOgImages(pulseSnap.hn, applyImages).then(applyImages)
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
    newsletterFeedsRef.current = newsletterFeeds
    saveNewsletterFeeds(newsletterFeeds)
  }, [newsletterFeeds])
  useEffect(() => {
    saveStorage('rr.read', readIds)
  }, [readIds])
  useEffect(() => {
    saveStorage('rr.saved', savedIds)
  }, [savedIds])
  useEffect(() => {
    savePastReads(pastReads)
  }, [pastReads])
  useEffect(() => {
    saveStorage('rr.notify', alertsEnabled)
  }, [alertsEnabled])

  useEffect(() => {
    let active = true
    void loadReaderSnapshot().then((snapshot) => {
      if (!active) return
      if (snapshot) {
        realItemsRef.current = snapshot.items
        setItems(snapshot.items)
        setPulse(snapshot.pulse)
        setFeedHealth(snapshot.feedHealth)
        setLastRefresh(snapshot.fetchedAt)
        setSelectedId(snapshot.selectedId)
        setSelectedFeed(snapshot.selectedFeed)
      }
      setRestored(true)
      void refresh(feeds, false)
    })
    return () => { active = false }
    // Fetch once on mount; Refresh button re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!restored || !lastRefresh || usingSample) return
    realItemsRef.current = items
    void saveReaderSnapshot({ items, pulse, feedHealth, fetchedAt: lastRefresh, selectedId, selectedFeed })
  }, [restored, lastRefresh, usingSample, items, pulse, feedHealth, selectedId, selectedFeed])

  useEffect(() => {
    let active = true
    if (!navigator.onLine) return
    void fetch('/api/providers', { signal: AbortSignal.timeout(4000) })
      .then((res) => (res.ok && isJsonResponse(res) ? res.json() : null))
      .then((data: { providers?: ProviderStatus[] } | null) => {
        if (!active || !data || !Array.isArray(data.providers)) return
        setProviders(data.providers)
      })
      .catch(() => {
        // Keep defaults quietly if providers endpoint is unreachable
      })
    void fetch('/api/briefing/audio/status', { signal: AbortSignal.timeout(4000) })
      .then((res) => (res.ok && isJsonResponse(res) ? res.json() : null))
      .then((data: BriefingTtsStatus | null) => {
        if (!active || !data || typeof data.available !== 'boolean') return
        setTtsStatus(data)
      })
      .catch(() => {
        // Keep unavailable default cleanly
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

  const pastReadItems: FeedItem[] = useMemo(
    () => pastReads.map(pastReadToFeedItem),
    [pastReads],
  )

  useEffect(() => {
    if (allKnownItems.length === 0) return
    const readSet = new Set(readIds)
    const savedSet = new Set(savedIds)
    setPastReads((prev) => {
      const existingById = new Map(prev.map((rec) => [rec.id, rec]))
      let next = prev
      let changed = false
      for (const item of allKnownItems) {
        if (item.sample) continue
        const existing = existingById.get(item.id)
        if (readSet.has(item.id) && !existing?.readAt) {
          next = upsertPastRead(next, item, 'read')
          changed = true
        }
        if (savedSet.has(item.id) && !existing?.savedAt) {
          next = upsertPastRead(next, item, 'save')
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [allKnownItems, readIds, savedIds])

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

  const feedAndTabItemsRef = useRef(feedAndTabItems)
  useEffect(() => {
    feedAndTabItemsRef.current = feedAndTabItems
  }, [feedAndTabItems])
  const feedAndTabSignature = `${feedAndTabItems.length}:${feedAndTabItems[0]?.id ?? ''}:${selectedFeed}:${filter}`

  useEffect(() => {
    const cleanQuery = query.trim().toLowerCase()
    const currentItems = feedAndTabItemsRef.current
    if (
      !settings.semanticSearchEnabled ||
      cleanQuery.length < 2 ||
      currentItems.length === 0
    ) {
      setSemanticResult(null)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const latestItems = feedAndTabItemsRef.current
      const localSupported = isLocalSemanticSupported()
      let localResolved = false

      if (localSupported) {
        void semanticClient
          .search(cleanQuery, latestItems, controller.signal)
          .then((res) => {
            if (controller.signal.aborted) return
            if (Object.keys(res.scores).length > 0) {
              localResolved = true
              setSemanticResult({
                query: cleanQuery,
                mode: 'local',
                provider: null,
                scores: res.scores,
              })
            }
          })
          .catch(() => {
            // Fall back cleanly to server embedding (if available) or keyword matching
          })
      }

      const needsServerFallback =
        (!localSupported || !semanticClient.getState().modelReady) &&
        hasEmbeddingProvider &&
        navigator.onLine

      if (needsServerFallback) {
        const docs = latestItems.slice(0, 60).map((it) => ({
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
          .then((res) => (res.ok && isJsonResponse(res) ? res.json() : null))
          .then(
            (
              data: {
                available?: boolean
                provider?: AIProviderId | null
                scores?: Record<string, number>
              } | null,
            ) => {
              if (controller.signal.aborted || localResolved) return
              if (
                data?.available &&
                data.scores &&
                Object.keys(data.scores).length > 0
              ) {
                setSemanticResult({
                  query: cleanQuery,
                  mode: 'server',
                  provider: data.provider
                    ? sanitizeProviderId(data.provider)
                    : null,
                  scores: data.scores,
                })
              }
            },
          )
          .catch(() => {
            /* ignore fallback errors */
          })
      }
    }, 240)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [
    query,
    settings.semanticSearchEnabled,
    settings.aiProvider,
    hasEmbeddingProvider,
    feedAndTabSignature,
    semanticClient,
  ])

  const semanticActiveForQuery = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (
      settings.semanticSearchEnabled &&
      q.length >= 2 &&
      semanticResult !== null &&
      semanticResult.query === q &&
      Object.keys(semanticResult.scores).length > 0
    )
  }, [settings.semanticSearchEnabled, query, semanticResult])

  const tasteVector = useMemo(() => {
    if (!settings.personalBoostEnabled || pastReads.length === 0) return null
    const entries = pastReads.flatMap((rec) => {
      const vec = bgeM3Vectors[rec.id]
      const interactedAt = rec.savedAt ?? rec.readAt
      if (!vec || !interactedAt) return []
      return [
        {
          id: rec.id,
          vector: vec,
          interactedAt,
          saved: Boolean(rec.savedAt),
        },
      ]
    })
    return computeDecayWeightedTasteVector(entries)
  }, [settings.personalBoostEnabled, pastReads, bgeM3Vectors])

  const { visibleItems, exploreSlotItemId } = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q !== '' && semanticActiveForQuery && semanticResult) {
      return {
        visibleItems: rankItemsHybrid(
          feedAndTabItems,
          semanticResult.scores,
          q,
        ).map((entry) => entry.item),
        exploreSlotItemId: null,
      }
    }

    const filtered = feedAndTabItems.filter(
      (it) =>
        q === '' ||
        it.title.toLowerCase().includes(q) ||
        it.description.toLowerCase().includes(q),
    )

    if (sortBy === 'score' && settings.personalBoostEnabled && tasteVector) {
      const ranked = rankFeedWithTasteVector(
        filtered,
        bgeM3Vectors,
        tasteVector,
        { readIds },
      )
      const exploreEntry = ranked.find((entry) => entry.isExploreSlot)
      return {
        visibleItems: ranked.map((entry) => entry.item),
        exploreSlotItemId: exploreEntry ? exploreEntry.item.id : null,
      }
    }

    const rankedScores = new Map<string, number>()
    if (sortBy === 'score') {
      for (const item of feedAndTabItems) {
        rankedScores.set(
          item.id,
          applyPersonalBoost(
            item.score ?? 0,
            settings.personalBoostEnabled ? personalBoost(item, taste) : 0,
          ),
        )
      }
    }
    return {
      visibleItems: filtered.sort((a, b) => {
        if (sortBy === 'date') {
          return (
            new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime() ||
            (b.score ?? 0) - (a.score ?? 0)
          )
        }
        return (
          (rankedScores.get(b.id) ?? 0) - (rankedScores.get(a.id) ?? 0) ||
          new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
        )
      }),
      exploreSlotItemId: null,
    }
  }, [
    feedAndTabItems,
    query,
    sortBy,
    semanticActiveForQuery,
    semanticResult,
    settings.personalBoostEnabled,
    taste,
    tasteVector,
    bgeM3Vectors,
    readIds,
  ])

  const semanticSimilarityById = useMemo(
    () => (semanticActiveForQuery && semanticResult ? semanticResult.scores : undefined),
    [semanticActiveForQuery, semanticResult],
  )

  const selectedItem =
    visibleItems.find((it) => it.id === selectedId) ??
    allKnownItems.find((it) => it.id === selectedId) ??
    pastReadItems.find((it) => it.id === selectedId) ??
    visibleItems[0] ??
    null

  const allowSecondBrainSemantic =
    settings.semanticSearchEnabled &&
    (hasEmbeddingProvider || semanticProgress.modelReady)

  const topStoriesForResurface = useMemo(
    () =>
      selectDailyBriefingItems(
        allKnownItems.some((it) => !it.sample)
          ? allKnownItems.filter((it) => !it.sample)
          : allKnownItems,
        5,
      ),
    [allKnownItems],
  )

  useEffect(() => {
    if (!allowSecondBrainSemantic || pastReads.length === 0) return
    const controller = new AbortController()
    const targetCandidates: FeedItem[] = []
    if (selectedItem) targetCandidates.push(selectedItem)
    for (const story of topStoriesForResurface) {
      if (!targetCandidates.some((c) => c.id === story.id)) {
        targetCandidates.push(story)
      }
    }
    if (targetCandidates.length === 0) return

    const pastSlice = pastReads.slice(0, 40)
    const pastDocs = pastSlice.map((r) => ({
      id: r.id,
      text: formatItemEmbeddingText(r),
    }))

    if (semanticProgress.modelReady && isLocalSemanticSupported()) {
      const embedPool = [
        ...targetCandidates,
        ...pastSlice.map(pastReadToFeedItem),
      ]
      void semanticClient
        .embedItems(embedPool, controller.signal)
        .then((vecs) => {
          if (controller.signal.aborted || Object.keys(vecs).length === 0) return
          setSecondBrainVectors((prev) => ({ ...prev, ...vecs }))
        })
        .catch(() => {
          // Fall back silently to server /api/embed or deterministic topic-overlap
        })
    } else if (hasEmbeddingProvider && navigator.onLine) {
      const missingTargets = targetCandidates.filter(
        (target) => !secondBrainServerScores[target.id],
      )
      if (missingTargets.length > 0) {
        void runWithConcurrency(missingTargets, 2, async (target) => {
          if (controller.signal.aborted) return
          try {
            const res = await fetch('/api/embed', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                query: formatItemEmbeddingText(target),
                documents: pastDocs,
                provider: settings.aiProvider,
              }),
            })
            if (!res.ok || !isJsonResponse(res)) return
            const data = (await res.json()) as {
              available?: boolean
              scores?: Record<string, number>
            }
            if (
              !controller.signal.aborted &&
              data.available &&
              data.scores &&
              Object.keys(data.scores).length > 0
            ) {
              setSecondBrainServerScores((prev) => ({
                ...prev,
                [target.id]: data.scores!,
              }))
            }
          } catch {
            // Fall back cleanly to deterministic topic-overlap
          }
        })
      }
    }

    return () => controller.abort()
  }, [
    allowSecondBrainSemantic,
    hasEmbeddingProvider,
    pastReads,
    selectedItem,
    semanticClient,
    semanticProgress.modelReady,
    settings.aiProvider,
    topStoriesForResurface,
    secondBrainServerScores,
  ])

  useEffect(() => {
    if (!navigator.onLine || workersAiEmbedDisabledRef.current) return
    const candidates = [
      ...pastReads.map((rec) => ({
        id: rec.id,
        feedId: rec.feedId,
        feedTitle: rec.feedTitle,
        title: rec.title,
        link: rec.link,
        description: rec.description.slice(0, 800),
        pubDate: rec.pubDate,
        readAt: rec.readAt,
        savedAt: rec.savedAt,
        score: rec.score,
      })),
      ...items
        .filter((it) => !it.sample)
        .slice(0, 24)
        .map((it) => ({
          id: it.id,
          feedId: it.feedId,
          feedTitle: it.feedTitle,
          title: it.title,
          link: it.link,
          description: it.description.slice(0, 800),
          pubDate: it.pubDate,
          score: it.score,
        })),
    ].filter((entry) => !bgeM3Vectors[entry.id])

    if (candidates.length === 0) return

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void fetch('/api/ai/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          items: candidates.slice(0, 12),
          ingest: true,
        }),
      })
        .then((res) => {
          if (!res.ok) {
            workersAiEmbedDisabledRef.current = true
            return null
          }
          return isJsonResponse(res) ? res.json() : null
        })
        .then(
          (
            data: {
              available?: boolean
              embeddings?: Record<string, number[]>
            } | null,
          ) => {
            if (controller.signal.aborted || !data) return
            if (!data.available) {
              workersAiEmbedDisabledRef.current = true
              return
            }
            if (data.embeddings && Object.keys(data.embeddings).length > 0) {
              setBgeM3Vectors((prev) => ({ ...prev, ...data.embeddings }))
            }
          },
        )
        .catch(() => {
          // Stay silent when Workers AI embed endpoint is unreachable offline
        })
    }, 350)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [items, pastReads, bgeM3Vectors])

  useEffect(() => {
    if (!navigator.onLine || pastReads.length === 0) {
      setLiveRelatedMatches(null)
      setLiveResurfacedMatches(null)
      return
    }
    const controller = new AbortController()
    const compactCandidates = pastReads.slice(0, 60).map((rec) => ({
      ...rec,
      description: rec.description.slice(0, 600),
    }))

    if (selectedItem) {
      void fetch('/api/ai/resurface', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          query: formatItemEmbeddingText(selectedItem),
          topStory: {
            id: selectedItem.id,
            title: selectedItem.title,
            description: selectedItem.description.slice(0, 800),
            feedTitle: selectedItem.feedTitle,
          },
          candidates: compactCandidates,
          minAgeDays: 0,
          limit: 3,
        }),
      })
        .then((res) => (res.ok && isJsonResponse(res) ? res.json() : null))
        .then(
          (
            data: {
              mode?: string
              matches?: SecondBrainMatch[]
            } | null,
          ) => {
            if (controller.signal.aborted || !data) return
            if (
              data.mode === 'workers-ai-vectorize' &&
              Array.isArray(data.matches) &&
              data.matches.length > 0
            ) {
              setLiveRelatedMatches({
                targetId: selectedItem.id,
                matches: data.matches,
              })
            } else {
              setLiveRelatedMatches(null)
            }
          },
        )
        .catch(() => {
          if (!controller.signal.aborted) setLiveRelatedMatches(null)
        })
    }

    const topLead = topStoriesForResurface[0]
    if (topLead) {
      void fetch('/api/ai/resurface', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          query: formatItemEmbeddingText(topLead),
          topStory: {
            id: topLead.id,
            title: topLead.title,
            description: topLead.description.slice(0, 800),
            feedTitle: topLead.feedTitle,
          },
          candidates: compactCandidates,
          minAgeDays: 30,
          limit: 3,
        }),
      })
        .then((res) => (res.ok && isJsonResponse(res) ? res.json() : null))
        .then(
          (
            data: {
              mode?: string
              matches?: ResurfacedMatch[]
            } | null,
          ) => {
            if (controller.signal.aborted || !data) return
            if (
              data.mode === 'workers-ai-vectorize' &&
              Array.isArray(data.matches) &&
              data.matches.length > 0
            ) {
              setLiveResurfacedMatches(data.matches)
            } else {
              setLiveResurfacedMatches(null)
            }
          },
        )
        .catch(() => {
          if (!controller.signal.aborted) setLiveResurfacedMatches(null)
        })
    }

    return () => controller.abort()
  }, [selectedItem, pastReads, topStoriesForResurface])

  const relatedPastReads = useMemo(() => {
    if (!selectedItem) return []
    if (liveRelatedMatches && liveRelatedMatches.targetId === selectedItem.id) {
      return liveRelatedMatches.matches
    }
    return rankRelatedPastReads(selectedItem, pastReads, {
      limit: 3,
      allowSemantic: allowSecondBrainSemantic,
      vectors: secondBrainVectors,
      semanticScores: secondBrainServerScores[selectedItem.id],
    })
  }, [
    selectedItem,
    liveRelatedMatches,
    pastReads,
    allowSecondBrainSemantic,
    secondBrainVectors,
    secondBrainServerScores,
  ])

  const resurfacedReads = useMemo(() => {
    if (liveResurfacedMatches && liveResurfacedMatches.length > 0) {
      return liveResurfacedMatches
    }
    return findResurfacedReads(pastReads, topStoriesForResurface, {
      limit: 3,
      allowSemantic: allowSecondBrainSemantic,
      vectors: secondBrainVectors,
      semanticScoresByTopStory: secondBrainServerScores,
    })
  }, [
    liveResurfacedMatches,
    pastReads,
    topStoriesForResurface,
    allowSecondBrainSemantic,
    secondBrainVectors,
    secondBrainServerScores,
  ])

  useEffect(() => {
    if (
      !selectedItem ||
      selectedItem.sample ||
      !navigator.onLine ||
      articles[selectedItem.id] ||
      !selectedItem.link ||
      selectedItem.link.includes('/rss/') ||
      newsletterFeedsRef.current.some((nf) => nf.id === selectedItem.feedId)
    ) {
      return
    }
    const item = selectedItem
    let active = true
    void extract(item.link).then((article) => {
      if (!active || !article) return
      setArticles((current) => ({ ...current, [item.id]: article }))
      setSelectedId((current) => current ?? item.id)
      setItems((current) => current.map((entry) => {
        if (entry.id !== item.id) return entry
        const scoreText = article.markdown.slice(0, 5000)
        const score = explainScore(entry.title, scoreText, entry.pubDate, entry)
        return { ...entry, scoreText, score: score.score, scoreDimensions: score.dimensions }
      }))
    })
    return () => { active = false }
  }, [selectedItem, articles])

  const selectItem = useCallback((id: string) => {
    setSelectedId(id)
    const matchedItem =
      allKnownItems.find((item) => item.id === id) ??
      pastReadItems.find((item) => item.id === id)
    if (!readIds.includes(id)) learn(matchedItem, 'read')
    setReadIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    if (matchedItem && !matchedItem.sample) {
      setPastReads((prev) => upsertPastRead(prev, matchedItem, 'read'))
    }
  }, [readIds, allKnownItems, pastReadItems, learn])

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

  const openPastReadInReader = useCallback(
    (id: string) => {
      selectItem(id)
      navigateTo('feed')
      requestAnimationFrame(() => readerHeadingRef.current?.focus())
    },
    [selectItem, navigateTo],
  )

  const toggleSave = useCallback((id: string) => {
    const matchedItem =
      allKnownItems.find((item) => item.id === id) ??
      pastReadItems.find((item) => item.id === id)
    const currentlySaved = savedIds.includes(id)
    if (!currentlySaved) learn(matchedItem, 'star')
    setSavedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
    if (currentlySaved) {
      setPastReads((prev) => unmarkSavedPastRead(prev, id))
    } else if (matchedItem && !matchedItem.sample) {
      setPastReads((prev) => upsertPastRead(prev, matchedItem, 'save'))
    }
  }, [savedIds, allKnownItems, pastReadItems, learn])

  const handleSummarize = useCallback(
    async (item: FeedItem) => {
      if (!navigator.onLine) {
        setSummaryErrors((prev) => ({ ...prev, [item.id]: 'Connect to generate a new summary. Cached summaries remain available offline.' }))
        return
      }
      setSummaryLoadingIds((prev) => ({ ...prev, [item.id]: true }))
      setSummaryErrors((prev) => {
        if (!(item.id in prev)) return prev
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      try {
        const shouldSkipExtract =
          Boolean(item.sample) ||
          !item.link ||
          item.link.includes('/rss/') ||
          newsletterFeedsRef.current.some((nf) => nf.id === item.feedId)
        const article =
          articles[item.id] ?? (shouldSkipExtract ? null : await extract(item.link))
        const res = await fetch('/api/ai/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: item.title,
            feedTitle: item.feedTitle,
            link: item.link,
            content: (article?.markdown ?? item.description).slice(0, 12_000),
            provider: settings.aiProvider,
          }),
        })
        const summaryObj = await parseSummarizeResponse(res)
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
    [settings.aiProvider, articles],
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

  const removeFeed = useCallback((feedId: string) => {
    const isNewsletter =
      feeds.some((f) => f.id === feedId && f.kind === 'newsletter') ||
      newsletterFeedsRef.current.some((nf) => nf.id === feedId)
    setFeeds((prev) => prev.filter((f) => f.id !== feedId))
    setItems((prev) => {
      const remaining = prev.filter((it) => it.feedId !== feedId)
      realItemsRef.current = remaining.filter((it) => !it.sample)
      return remaining
    })
    if (selectedFeed === feedId) setSelectedFeed('all')
    if (isNewsletter) {
      newsletterFeedsRef.current = newsletterFeedsRef.current.filter(
        (nf) => nf.id !== feedId,
      )
      setNewsletterFeeds(newsletterFeedsRef.current)
      setFeedHealth((prev) => {
        if (!(feedId in prev)) return prev
        const next = { ...prev }
        delete next[feedId]
        return next
      })
      void fetch(`/api/newsletter/feeds/${encodeURIComponent(feedId)}`, {
        method: 'DELETE',
      }).catch(() => {
        // Ignore network errors on cleanup
      })
    }
  }, [feeds, selectedFeed])

  const handleCreateNewsletterFeed = useCallback(
    async (
      title: string,
    ): Promise<{ ok: boolean; feed?: NewsletterFeedRecord; error?: string }> => {
      let record: NewsletterFeedRecord | null = null
      try {
        const res = await fetch('/api/newsletter/feeds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
          signal: AbortSignal.timeout(5000),
        })
        if (res.ok) {
          const data = (await res.json()) as { feed?: NewsletterFeedRecord }
          if (data.feed) record = data.feed
        } else {
          const errData = (await res.json().catch(() => null)) as {
            error?: string
          } | null
          return {
            ok: false,
            error: errData?.error ?? `HTTP ${res.status} creating feed`,
          }
        }
      } catch {
        // Fallback to local CSPRNG creation when offline
      }

      if (!record) {
        try {
          record = createNewsletterFeedRecord({ title })
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Invalid title',
          }
        }
      }

      const created = record
      const source = newsletterFeedToFeedSource(created)
      const nextNewsletterFeeds = [
        created,
        ...newsletterFeedsRef.current.filter((f) => f.id !== created.id),
      ]
      newsletterFeedsRef.current = nextNewsletterFeeds
      setNewsletterFeeds(nextNewsletterFeeds)
      setFeeds((prev) => [...prev.filter((f) => f.id !== created.id), source])
      setFeedHealth((prev) => ({
        ...prev,
        [created.id]: {
          lastFetchedAt: created.createdAt,
          itemCount: created.entries.length,
          ok: true,
        },
      }))
      return { ok: true, feed: created }
    },
    [],
  )

  const handleDeleteNewsletterFeed = useCallback(
    async (feedId: string) => {
      removeFeed(feedId)
    },
    [removeFeed],
  )

  const handleImportNewsletterEmail = useCallback(
    async (
      feedId: string,
      rawEmail: string,
    ): Promise<{
      ok: boolean
      duplicate?: boolean
      subject?: string
      error?: string
    }> => {
      const existingFeed = newsletterFeedsRef.current.find(
        (f) => f.id === feedId,
      )
      if (!existingFeed) {
        return { ok: false, error: 'Newsletter feed not found.' }
      }

      let resultFeed: NewsletterFeedRecord | null = null
      let resultEntry = null as ReturnType<typeof addEntryToFeed>['entry'] | null
      let duplicate = false

      const postImport = () =>
        fetch(`/api/newsletter/feeds/${encodeURIComponent(feedId)}/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: rawEmail }),
          signal: AbortSignal.timeout(7000),
        })

      try {
        let res = await postImport()
        if (res.status === 404) {
          await fetch('/api/newsletter/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feeds: newsletterFeedsRef.current }),
            signal: AbortSignal.timeout(4000),
          })
          res = await postImport()
        }
        const payload = (await res.json()) as {
          feed?: NewsletterFeedRecord
          entry?: ReturnType<typeof addEntryToFeed>['entry']
          duplicate?: boolean
          error?: string
        }
        if (!res.ok) {
          return {
            ok: false,
            error: payload.error ?? `HTTP ${res.status} importing email`,
          }
        }
        if (payload.feed && payload.entry) {
          resultFeed = payload.feed
          resultEntry = payload.entry
          duplicate = Boolean(payload.duplicate)
        }
      } catch (err) {
        if (err instanceof Error && /abort|network|fetch/i.test(err.message)) {
          // Offline / unreachable server fallback: parse client-side cleanly
        } else if (err instanceof Error) {
          return { ok: false, error: err.message }
        }
      }

      if (!resultFeed || !resultEntry) {
        try {
          const parsedEntry = await parseRawEmail(rawEmail, {
            defaultTitle: existingFeed.title,
          })
          const localRes = addEntryToFeed(existingFeed, parsedEntry)
          resultFeed = localRes.feed
          resultEntry = localRes.entry
          duplicate = localRes.duplicate
        } catch (err) {
          return {
            ok: false,
            error:
              err instanceof Error ? err.message : 'Failed to parse raw email.',
          }
        }
      }

      const finalFeed = resultFeed
      const finalEntry = resultEntry
      const origin =
        typeof window !== 'undefined' ? window.location.origin : ''
      const baseItem = newsletterEntryToFeedItem(finalEntry, finalFeed, origin)
      const breakdown = explainScore(
        baseItem.title,
        baseItem.description,
        baseItem.pubDate,
        {
          feedId: baseItem.feedId,
          feedTitle: baseItem.feedTitle,
          link: baseItem.link,
        },
      )
      const scoredItem: FeedItem = {
        ...baseItem,
        score: breakdown.score,
        scoreDimensions: breakdown.dimensions,
      }

      const nextNewsletterFeeds = newsletterFeedsRef.current.map((f) =>
        f.id === finalFeed.id ? finalFeed : f,
      )
      newsletterFeedsRef.current = nextNewsletterFeeds
      setNewsletterFeeds(nextNewsletterFeeds)
      setFeedHealth((prev) => ({
        ...prev,
        [finalFeed.id]: {
          lastFetchedAt: new Date().toISOString(),
          itemCount: finalFeed.entries.length,
          ok: true,
        },
      }))
      setUsingSample(false)
      setItems((prev) => {
        const withoutSamples = prev.filter((it) => !it.sample)
        const next = [
          scoredItem,
          ...withoutSamples.filter((it) => it.id !== scoredItem.id),
        ]
        realItemsRef.current = next
        return next
      })
      setSelectedFeed(finalFeed.id)
      setFilter('all')
      setSelectedId(scoredItem.id)

      return { ok: true, duplicate, subject: finalEntry.subject }
    },
    [],
  )

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
      newsletters: newsletterFeeds,
      readIds,
      savedIds,
      pastReads,
      summaries,
      settings,
      lastVisitIso,
    })
    return downloadJsonExport(payload)
  }

  const handleClearAllData = () => {
    clearReaderStorage()
    semanticClient.resetMemoryCache()
    updateTaste(emptyProfile(), 'Taste reset on this device.')
    realItemsRef.current = []
    setItems([])
    setLastRefresh(null)
    setSelectedId(null)
    setSelectedFeed('all')
    setFeedHealth({})
    setPulse({ hn: [], github: [], fetchedAt: '', cached: false, errors: {} })
    const clearedNewsletters = newsletterFeedsRef.current
    newsletterFeedsRef.current = []
    setFeeds(DEFAULT_FEEDS)
    setNewsletterFeeds([])
    for (const nf of clearedNewsletters) {
      void fetch(`/api/newsletter/feeds/${encodeURIComponent(nf.id)}`, {
        method: 'DELETE',
      }).catch(() => {
        // Ignore network cleanup errors
      })
    }
    setReadIds([])
    setSavedIds([])
    setPastReads([])
    setBgeM3Vectors({})
    setLiveRelatedMatches(null)
    setLiveResurfacedMatches(null)
    setSecondBrainVectors({})
    setSecondBrainServerScores({})
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
            offline={offline}
            updateAvailable={updateState === 'available' || updateState === 'error'}
            onUpdate={() => void handleUpdate()}
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
            onOpenAsk={() => { setAskQuestion(''); setAskOpen(true) }}
            onOpenShortcutsModal={() => setShortcutsOpen(true)}
            onRefresh={() => void refresh(feeds, true)}
            onToggleAlerts={() => void handleToggleAlerts()}
            onExportOpml={() => downloadOpml(feeds)}
            onExportJson={() => void handleExportJson()}
            onRestoreDefaults={restoreDefaults}
            audioStatus={audioStatus}
            audioItemIndex={audioItemIndex}
            audioItemTotal={audioItemTotal}
            audioItemTitle={audioItemTitle}
            onAudioTogglePause={handleTogglePauseAudio}
            onAudioStop={handleStopAudio}
          />
          <div aria-live="polite" className="sr-only">{offline ? 'Offline. Showing last fetched items.' : 'Online.'}</div>
          {updateState !== 'idle' && !updateDismissed && (
            <aside ref={updateNoticeRef} popover="manual" aria-label="Reader updates" className="fixed inset-auto right-3 bottom-3 left-3 z-50 m-0 flex w-auto flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm shadow-lg sm:left-auto sm:max-w-sm">
              <p role="status" className="flex-1">{updateState === 'error' ? updateError || 'Offline setup unavailable. Try reloading online.' : updateState === 'reloading' ? 'Preparing update…' : 'Update available. Reload when you’re ready.'}</p>
              <button type="button" disabled={updateState === 'reloading'} onClick={() => void handleUpdate()} className="rounded-md bg-zinc-950 px-3 py-2 text-white disabled:opacity-50">Reload</button>
              <button type="button" aria-label="Dismiss update notice" onClick={() => {
                setUpdateDismissed(true)
                document.querySelector<HTMLButtonElement>('button[aria-label="Reader options and sort"]')?.focus()
              }} className="rounded-md px-2 py-2 text-zinc-600">Later</button>
            </aside>
          )}
          {offline && (
            <p className="border-b border-zinc-200 bg-zinc-50 px-4 py-1.5 text-xs text-zinc-600">
              {lastRefresh ? `Last fetched ${new Date(lastRefresh).toLocaleString()} · ${items.length} cached items. Briefing and cached summaries remain available.` : 'No fetched items cached yet. Connect and refresh to save your briefing for offline reading.'}
            </p>
          )}
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
                  onOpenNewsletterModal={() => setNewsletterModalOpen(true)}
                  onNavigate={navigateTo}
                  onOpenShortcutsModal={() => setShortcutsOpen(true)}
                  errors={feedErrors}
                  resurfacedReads={resurfacedReads}
                  selectedItemId={selectedItem?.id ?? null}
                  onOpenResurfaced={openPastReadInReader}
                />
                <ItemList
                  items={visibleItems}
                  profile={tasteReady && settings.personalBoostEnabled ? taste : undefined}
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
                  semanticEnabled={settings.semanticSearchEnabled}
                  onToggleSemantic={() =>
                    setSettings((prev) => ({
                      ...prev,
                      semanticSearchEnabled: !prev.semanticSearchEnabled,
                    }))
                  }
                  semanticProgress={semanticProgress}
                  semanticSimilarityById={semanticSimilarityById}
                  semanticInfo={{
                    active: semanticActiveForQuery,
                    mode: semanticResult?.mode ?? 'local',
                    provider: semanticResult?.provider ?? null,
                  }}
                  onMarkAllVisited={handleMarkAllVisited}
                  onToggleSave={toggleSave}
                  onOpenRadar={() => navigateTo('radar')}
                  onRefresh={() => void refresh(feeds, true)}
                  pulseError={activePulseError}
                  exploreSlotItemId={exploreSlotItemId}
                />
                <ReaderPane
                  item={selectedItem}
                  profile={tasteReady && settings.personalBoostEnabled ? taste : undefined}
                  onSkip={(item) => learn(item, 'skip')}
                  extractedHtml={selectedItem ? articles[selectedItem.id]?.html : undefined}
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
                  relatedPastReads={relatedPastReads}
                  pastReadsCount={pastReads.length}
                  onOpenPastRead={openPastReadInReader}
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
                  extractedArticles={articles}
                  summaryLoadingIds={summaryLoadingIds}
                  summaryErrors={summaryErrors}
                  lastVisitIso={lastVisitIso}
                  onSummarize={handleSummarize}
                  onOpenInReader={openItemInReader}
                  onOpenRadar={() => navigateTo('radar')}
                  onNavigate={navigateTo}
                  audioVoiceURI={settings.audioVoiceURI}
                  audioRate={settings.audioRate}
                  onAudioSettingsChange={handleAudioSettingsChange}
                  audioStatus={audioStatus}
                  audioPreparing={audioPreparing}
                  audioEngineMode={
                    activeAudioEngine ??
                    (ttsStatus.available &&
                    (isGeminiVoiceSelection(settings.audioVoiceURI) ||
                      settings.audioVoiceURI === null)
                      ? 'gemini-tts'
                      : 'web-speech')
                  }
                  audioCacheStatus={audioCacheStatus}
                  audioModeNote={audioModeNote}
                  ttsStatus={ttsStatus}
                  audioItemId={audioItemId}
                  audioItemIndex={audioItemIndex}
                  audioItemTotal={audioItemTotal}
                  audioError={audioError}
                  onPlayBriefing={handlePlayBriefing}
                  onTogglePauseAudio={handleTogglePauseAudio}
                  onStopAudio={handleStopAudio}
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
            ) : activeView === 'guide' ? (
              <motion.div
                key="view-guide"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <UserGuidePage
                  onNavigate={navigateTo}
                  onOpenShortcutsModal={() => setShortcutsOpen(true)}
                  onOpenNewsletterModal={() => setNewsletterModalOpen(true)}
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
            ) : activeView === 'faq' ? (
              <motion.div
                key="view-faq"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <FaqPage onNavigate={navigateTo} />
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
            ) : activeView === 'terms' ? (
              <motion.div
                key="view-terms"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <TermsPage onNavigate={navigateTo} />
              </motion.div>
            ) : activeView === 'contact' ? (
              <motion.div
                key="view-contact"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <ContactPage onNavigate={navigateTo} />
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
                  tasteReady={tasteReady}
                  tasteStatus={tasteStatus}
                  onResetTaste={() => updateTaste(emptyProfile(), 'Taste reset on this device.')}
                  onDemoTaste={() => updateTaste(demoProfile(), 'Demo profile: AWS-builder applied on this device.')}
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
                  onOpenNewsletterModal={() => setNewsletterModalOpen(true)}
                  newsletterCount={newsletterFeeds.length}
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
            onOpenAsk={(question) => { setAskQuestion(question); setAskOpen(true) }}
            semanticEnabled={settings.semanticSearchEnabled}
            onToggleSemantic={() =>
              setSettings((prev) => ({
                ...prev,
                semanticSearchEnabled: !prev.semanticSearchEnabled,
              }))
            }
            semanticClient={semanticClient}
            semanticProgress={semanticProgress}
            hasServerEmbedProvider={hasEmbeddingProvider}
            preferredProvider={settings.aiProvider}
          />

          <AskPanel open={askOpen} onOpenChange={setAskOpen} initialQuestion={askQuestion} provider={settings.aiProvider} />

          <NewsletterModal
            open={newsletterModalOpen}
            onOpenChange={setNewsletterModalOpen}
            newsletterFeeds={newsletterFeeds}
            onCreateFeed={handleCreateNewsletterFeed}
            onDeleteFeed={handleDeleteNewsletterFeed}
            onImportEmail={handleImportNewsletterEmail}
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
