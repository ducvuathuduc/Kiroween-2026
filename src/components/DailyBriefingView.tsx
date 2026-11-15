import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Square,
  Volume2,
} from 'lucide-react'
import { motion } from 'motion/react'
import { isNewSince, runWithConcurrency, selectDailyBriefingItems } from '../lib/briefing'
import type { ExtractedArticle } from '../lib/extract'
import type { FeedItem } from '../lib/feeds'
import { summarize, timeAgo } from '../lib/format'
import type { GeminiSummary } from '../lib/kiroTask'
import type { NavigableRoute } from '../lib/routes'
import { buildSpokenBriefingScript } from '../lib/spokenScript'
import {
  clampSpeechRate,
  createBriefingPlayer,
  isGeminiVoiceSelection,
  isSpeechSupported,
  listVoices,
  subscribeVoices,
  type AudioPlaybackEngineMode,
  type BriefingPlaybackStatus,
  type BriefingPlayer,
  type BriefingTtsStatus,
  type DailyBriefingItem,
  type SpeechVoiceInfo,
} from '../lib/tts'
import ItemThumbnail from './ItemThumbnail'
import KiroTaskModal from './KiroTaskModal'
import PageShell from './PageShell'
import ScoreBreakdownPopover from './ScoreBreakdownPopover'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Skeleton } from './ui/skeleton'

interface DailyBriefingViewProps {
  items: FeedItem[]
  summaries: Record<string, GeminiSummary>
  extractedArticles?: Record<string, ExtractedArticle>
  summaryLoadingIds: Record<string, boolean>
  summaryErrors: Record<string, string>
  lastVisitIso: string | null
  onSummarize: (item: FeedItem) => Promise<void>
  onOpenInReader: (itemId: string) => void
  onOpenRadar: () => void
  onNavigate: (route: NavigableRoute) => void
  audioVoiceURI?: string | null
  audioRate?: number
  onAudioSettingsChange?: (patch: {
    audioVoiceURI?: string | null
    audioRate?: number
  }) => void
  audioStatus?: BriefingPlaybackStatus
  audioPreparing?: boolean
  audioEngineMode?: AudioPlaybackEngineMode
  audioCacheStatus?: 'HIT' | 'MISS' | 'BYPASS' | null
  audioModeNote?: string | null
  ttsStatus?: BriefingTtsStatus
  audioItemId?: string | null
  audioItemIndex?: number
  audioItemTotal?: number
  audioError?: string | null
  onPlayBriefing?: (briefingItems: DailyBriefingItem[]) => void
  onTogglePauseAudio?: () => void
  onStopAudio?: () => void
}

export default function DailyBriefingView({
  items,
  summaries,
  extractedArticles,
  summaryLoadingIds,
  summaryErrors,
  lastVisitIso,
  onSummarize,
  onOpenInReader,
  onOpenRadar,
  onNavigate,
  audioVoiceURI,
  audioRate,
  onAudioSettingsChange,
  audioStatus,
  audioPreparing = false,
  audioEngineMode,
  audioCacheStatus = null,
  audioModeNote = null,
  ttsStatus,
  audioItemId,
  audioItemIndex,
  audioItemTotal,
  audioError,
  onPlayBriefing,
  onTogglePauseAudio,
  onStopAudio,
}: DailyBriefingViewProps) {
  const topFive = useMemo(() => selectDailyBriefingItems(items, 5), [items])
  const [modalItem, setModalItem] = useState<FeedItem | null>(null)
  const [batchRunning, setBatchRunning] = useState(false)
  const autoAttemptedRef = useRef<Set<string>>(new Set())

  const speechSupported = useMemo(() => isSpeechSupported(), [])
  const [voices, setVoices] = useState<SpeechVoiceInfo[]>(() => listVoices())

  // Local fallback state when DailyBriefingView is rendered standalone
  const localPlayerRef = useRef<BriefingPlayer | null>(null)
  const [localStatus, setLocalStatus] = useState<BriefingPlaybackStatus>('idle')
  const [localItemId, setLocalItemId] = useState<string | null>(null)
  const [localItemIndex, setLocalItemIndex] = useState<number>(-1)
  const [localItemTotal, setLocalItemTotal] = useState<number>(0)
  const [localError, setLocalError] = useState<string | null>(null)
  const [localVoiceURI, setLocalVoiceURI] = useState<string | null>(null)
  const [localRate, setLocalRate] = useState<number>(1)

  const isControlledAudio = Boolean(onPlayBriefing)
  const effectiveVoiceURI =
    audioVoiceURI !== undefined ? audioVoiceURI : localVoiceURI
  const effectiveRate = clampSpeechRate(
    audioRate !== undefined ? audioRate : localRate,
  )
  const effectiveStatus = audioStatus ?? localStatus
  const effectiveItemId = audioItemId !== undefined ? audioItemId : localItemId
  const effectiveItemIndex =
    audioItemIndex !== undefined ? audioItemIndex : localItemIndex
  const effectiveItemTotal =
    audioItemTotal !== undefined ? audioItemTotal : localItemTotal
  const effectiveError = audioError !== undefined ? audioError : localError

  const geminiTtsAvailable = Boolean(ttsStatus?.available)
  const canUseAudio = geminiTtsAvailable || speechSupported

  useEffect(() => {
    return subscribeVoices(() => {
      setVoices(listVoices())
    })
  }, [])

  useEffect(() => {
    if (isControlledAudio) return
    const player = createBriefingPlayer()
    localPlayerRef.current = player
    const unsubscribe = player.subscribe({
      onStateChange: (status) => {
        setLocalStatus(status)
        if (status === 'idle') {
          setLocalItemId(null)
          setLocalItemIndex(-1)
          setLocalItemTotal(0)
        }
      },
      onItemChange: (index, item) => {
        setLocalItemIndex(index)
        setLocalItemId(item.id)
      },
      onError: (msg) => {
        setLocalError(msg)
      },
    })
    return () => {
      unsubscribe()
      player.stop()
      localPlayerRef.current = null
    }
  }, [isControlledAudio])

  const briefingItems = useMemo<DailyBriefingItem[]>(
    () =>
      topFive.map((item) => {
        const ai = summaries[item.id]
        const extracted = extractedArticles?.[item.id]?.markdown
        return {
          id: item.id,
          title: item.title,
          url: item.link,
          score: item.score ?? 0,
          source: item.feedTitle,
          pubDate: item.pubDate,
          tldr: ai?.tldr || summarize(item.description, 1),
          takeaways: ai?.takeaways,
          whyMatters: ai?.whyMatters,
          description: item.description,
          extractedText: extracted,
          scoreDimensions: item.scoreDimensions,
        }
      }),
    [topFive, summaries, extractedArticles],
  )

  const spokenScript = useMemo(
    () => buildSpokenBriefingScript(briefingItems),
    [briefingItems],
  )

  const readyCount = topFive.filter((it) => Boolean(summaries[it.id])).length
  const anyTopLoading = topFive.some((it) => Boolean(summaryLoadingIds[it.id]))

  // Synthesize missing Gemini TL;DRs with bounded concurrency when Briefing opens
  useEffect(() => {
    const missing = topFive.filter(
      (it) =>
        !summaries[it.id] &&
        !summaryErrors[it.id] &&
        !summaryLoadingIds[it.id] &&
        !autoAttemptedRef.current.has(it.id),
    )
    if (missing.length === 0) return

    for (const item of missing) {
      autoAttemptedRef.current.add(item.id)
    }
    void runWithConcurrency(missing, 2, onSummarize)
  }, [topFive, summaries, summaryErrors, summaryLoadingIds, onSummarize])

  const handleGenerateMissing = async () => {
    const missing = topFive.filter(
      (it) => !summaries[it.id] && !summaryLoadingIds[it.id],
    )
    if (missing.length === 0) return
    setBatchRunning(true)
    try {
      await runWithConcurrency(missing, 2, onSummarize)
    } finally {
      setBatchRunning(false)
    }
  }

  const handlePlay = () => {
    if (!canUseAudio || briefingItems.length === 0 || audioPreparing) return
    if (effectiveStatus === 'paused') {
      if (onTogglePauseAudio) {
        onTogglePauseAudio()
      } else {
        localPlayerRef.current?.resume()
      }
      return
    }
    if (onPlayBriefing) {
      onPlayBriefing(briefingItems)
    } else {
      setLocalError(null)
      setLocalItemTotal(briefingItems.length)
      const enriched = briefingItems.map((item, idx) => ({
        ...item,
        spokenText: spokenScript.segments[idx]?.text ?? `${item.title}. ${item.tldr}`,
      }))
      localPlayerRef.current?.play(enriched, {
        voiceURI: isGeminiVoiceSelection(effectiveVoiceURI)
          ? null
          : effectiveVoiceURI,
        rate: effectiveRate,
      })
    }
  }

  const handlePause = () => {
    if (effectiveStatus !== 'speaking') return
    if (onTogglePauseAudio) {
      onTogglePauseAudio()
    } else {
      localPlayerRef.current?.pause()
    }
  }

  const handleStop = () => {
    if (onStopAudio) {
      onStopAudio()
    } else {
      localPlayerRef.current?.stop()
    }
  }

  const handleVoiceChange = (nextVoiceURI: string) => {
    const normalized = nextVoiceURI.trim() ? nextVoiceURI : null
    if (onAudioSettingsChange) {
      onAudioSettingsChange({ audioVoiceURI: normalized })
    } else {
      setLocalVoiceURI(normalized)
      localPlayerRef.current?.setOptions({
        voiceURI: isGeminiVoiceSelection(normalized) ? null : normalized,
      })
    }
  }

  const handleRateChange = (nextRateRaw: string) => {
    const parsed = Number.parseFloat(nextRateRaw)
    const nextRate = clampSpeechRate(parsed)
    if (onAudioSettingsChange) {
      onAudioSettingsChange({ audioRate: nextRate })
    } else {
      setLocalRate(nextRate)
      localPlayerRef.current?.setOptions({ rate: nextRate })
    }
  }

  const activeItemTitle =
    effectiveItemIndex >= 0 && briefingItems[effectiveItemIndex]
      ? briefingItems[effectiveItemIndex].title
      : ''

  const effectiveMode: AudioPlaybackEngineMode =
    audioEngineMode ??
    (geminiTtsAvailable &&
    (isGeminiVoiceSelection(effectiveVoiceURI) || effectiveVoiceURI === null)
      ? 'gemini-tts'
      : speechSupported
        ? 'web-speech'
        : 'unavailable')

  const liveAnnouncement = !canUseAudio
    ? 'Audio briefing unavailable: Gemini TTS is unconfigured and Web Speech synthesis is unsupported in this browser.'
    : effectiveError
      ? effectiveError
      : audioPreparing
        ? 'Generating spoken-script MP3 via Gemini 3.8 Flash-Lite TTS...'
        : effectiveStatus === 'speaking' && effectiveItemIndex >= 0
          ? `Reading story ${effectiveItemIndex + 1} of ${Math.max(effectiveItemTotal, briefingItems.length)}${activeItemTitle ? `: ${activeItemTitle}` : ''}.`
          : effectiveStatus === 'paused' && effectiveItemIndex >= 0
            ? `Paused at story ${effectiveItemIndex + 1} of ${Math.max(effectiveItemTotal, briefingItems.length)}.`
            : audioModeNote ?? ''

  const selectValue =
    effectiveVoiceURI &&
    (!isGeminiVoiceSelection(effectiveVoiceURI) || geminiTtsAvailable)
      ? effectiveVoiceURI
      : ''

  return (
    <PageShell
      label="Daily briefing digest"
      currentRoute="briefing"
      onNavigate={onNavigate}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-950">
              Daily Briefing
            </h1>
            <p className="mt-1 text-[13px] text-zinc-500">
              Top 5 highest-signal reads distilled into Gemini TL;DRs (
              <span className="font-mono font-medium tabular-nums text-zinc-900">
                {readyCount}/{topFive.length}
              </span>{' '}
              synthesized).
            </p>
          </div>

          {topFive.some((it) => !summaries[it.id]) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={batchRunning || anyTopLoading}
              onClick={() => void handleGenerateMissing()}
              className="h-8 gap-1.5 border-zinc-200 text-xs font-medium shadow-none"
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-3.5 ${batchRunning || anyTopLoading ? 'animate-spin' : ''}`}
              />
              Generate remaining TL;DRs
            </Button>
          )}
        </div>

        {/* Audio Briefing Player Bar */}
        <section
          aria-label="Audio briefing controls"
          className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
                <Volume2 aria-hidden="true" className="size-4 text-zinc-700" />
                Audio Briefing
              </span>

              <Button
                type="button"
                size="sm"
                disabled={
                  !canUseAudio ||
                  briefingItems.length === 0 ||
                  effectiveStatus === 'speaking' ||
                  audioPreparing
                }
                aria-pressed={effectiveStatus === 'speaking'}
                aria-label={
                  effectiveStatus === 'paused'
                    ? 'Resume audio briefing'
                    : audioPreparing
                      ? 'Preparing audio briefing'
                      : 'Play audio briefing'
                }
                onClick={handlePlay}
                className="h-7 gap-1.5 px-2.5 text-xs font-medium"
              >
                <Play aria-hidden="true" className="size-3.5" />
                <span>
                  {audioPreparing
                    ? 'Preparing…'
                    : effectiveStatus === 'paused'
                      ? 'Resume'
                      : 'Play'}
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canUseAudio || effectiveStatus !== 'speaking'}
                aria-pressed={effectiveStatus === 'paused'}
                aria-label="Pause audio briefing"
                onClick={handlePause}
                className="h-7 gap-1.5 border-zinc-200 bg-white px-2.5 text-xs shadow-none"
              >
                <Pause aria-hidden="true" className="size-3.5" />
                <span>Pause</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  !canUseAudio ||
                  (effectiveStatus === 'idle' && !audioPreparing)
                }
                aria-label="Stop audio briefing"
                onClick={handleStop}
                className="h-7 gap-1.5 border-zinc-200 bg-white px-2.5 text-xs shadow-none"
              >
                <Square aria-hidden="true" className="size-3" />
                <span>Stop</span>
              </Button>

              <Badge
                variant="outline"
                className="h-5 rounded px-1.5 font-mono text-[10px] font-normal text-zinc-600"
              >
                {effectiveMode === 'gemini-tts'
                  ? `gemini-3.8-flash-lite-tts${audioCacheStatus ? ` · R2 ${audioCacheStatus}` : ''}`
                  : effectiveMode === 'web-speech'
                    ? geminiTtsAvailable
                      ? 'Web Speech API (on-device)'
                      : 'Web Speech API (Gemini TTS unconfigured)'
                    : 'Audio unavailable'}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="briefing-voice-select"
                  className="text-xs font-medium text-zinc-600"
                >
                  Voice
                </label>
                <select
                  id="briefing-voice-select"
                  disabled={!canUseAudio}
                  value={selectValue}
                  onChange={(e) => handleVoiceChange(e.target.value)}
                  className="h-7 max-w-56 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-900 outline-none focus-visible:border-zinc-950 disabled:opacity-50"
                >
                  <option value="">
                    {geminiTtsAvailable
                      ? `Gemini TTS default (${ttsStatus?.defaultVoice ?? 'Kore'})`
                      : 'System default (Web Speech)'}
                  </option>
                  {geminiTtsAvailable && ttsStatus && ttsStatus.voices.length > 0 && (
                    <optgroup label="Gemini 3.8 Flash-Lite TTS (MP3)">
                      {ttsStatus.voices.map((voice) => (
                        <option key={voice.id} value={voice.id}>
                          {voice.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {speechSupported && voices.length > 0 && (
                    <optgroup label="On-device Web Speech">
                      {voices.map((voice) => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                          {voice.name} ({voice.lang})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="briefing-rate-range"
                  className="text-xs font-medium text-zinc-600"
                >
                  Speed
                </label>
                <input
                  id="briefing-rate-range"
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  disabled={!canUseAudio}
                  value={effectiveRate}
                  onChange={(e) => handleRateChange(e.target.value)}
                  className="h-1.5 w-24 cursor-pointer accent-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span className="w-9 font-mono text-xs tabular-nums text-zinc-800">
                  {effectiveRate.toFixed(1)}x
                </span>
              </div>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <p
              aria-live="polite"
              className={
                !canUseAudio || effectiveError
                  ? 'font-medium text-zinc-800'
                  : 'text-zinc-600'
              }
            >
              {liveAnnouncement ||
                `Spoken script ready: ${spokenScript.wordCount} words (~${spokenScript.estimatedMinutes} min) across ${briefingItems.length} stories.`}
            </p>
            <span className="text-[11px] text-zinc-500">
              {effectiveMode === 'gemini-tts'
                ? ttsStatus?.r2Bound
                  ? 'Uses Gemini 3.8 Flash-Lite TTS MP3 cached in R2.'
                  : 'Uses Gemini 3.8 Flash-Lite TTS MP3 (R2 bucket unbound).'
                : geminiTtsAvailable
                  ? 'Runs on-device via Web Speech API for the selected local voice.'
                  : 'No Gemini TTS key configured — running honestly on-device via Web Speech API.'}
            </span>
          </div>

          {briefingItems.length > 0 && (
            <details className="mt-3 rounded-md border border-zinc-200/80 bg-white px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-zinc-700 select-none hover:text-zinc-950">
                Spoken script transcript ({spokenScript.wordCount} words · ~
                {spokenScript.estimatedMinutes} min · single narrator)
              </summary>
              <div className="mt-2.5 max-h-64 space-y-2 overflow-y-auto border-t border-zinc-100 pt-2.5 text-[12.5px] leading-relaxed text-zinc-700">
                {spokenScript.script.split(/\n{2,}/).map((para, idx) => (
                  <p key={`${idx}-${para.slice(0, 24)}`}>{para}</p>
                ))}
              </div>
            </details>
          )}
        </section>

        {topFive.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-200 p-10 text-center text-[13px] text-zinc-500">
            No feed items loaded yet. Refresh feeds to generate your Daily Briefing.
          </div>
        ) : (
          <ol className="space-y-4">
            {topFive.map((item, idx) => {
              const aiSummary = summaries[item.id]
              const isLoading = Boolean(summaryLoadingIds[item.id])
              const err = summaryErrors[item.id]
              const isNew = isNewSince(item.pubDate, lastVisitIso)
              const isReadingThis =
                effectiveStatus !== 'idle' &&
                (effectiveItemId === item.id || effectiveItemIndex === idx)

              return (
                <motion.li
                  key={item.id}
                  aria-current={isReadingThis ? 'step' : undefined}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.18,
                    delay: idx * 0.04,
                    ease: 'easeOut',
                  }}
                  className={`rounded-lg border p-5 transition-colors ${
                    isReadingThis
                      ? 'border-zinc-950 bg-zinc-50/70 ring-2 ring-zinc-950/15'
                      : 'border-zinc-200 bg-white hover:border-zinc-300'
                  }`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="flex items-center gap-3 sm:block">
                      <span className="font-mono text-xs font-semibold tabular-nums text-zinc-400">
                        0{idx + 1}
                      </span>
                      <ItemThumbnail
                        src={item.imageUrl}
                        title={item.title}
                        feedTitle={item.feedTitle}
                        className="sm:mt-2"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                          <span className="font-medium text-zinc-800">
                            {item.feedTitle}
                          </span>
                          <span aria-hidden="true" className="text-zinc-300">
                            ·
                          </span>
                          <time dateTime={item.pubDate}>
                            {timeAgo(item.pubDate)}
                          </time>
                          {isNew && (
                            <>
                              <span
                                aria-hidden="true"
                                className="text-zinc-300"
                              >
                                ·
                              </span>
                              <span className="font-mono text-[11px] font-semibold text-zinc-950">
                                New
                              </span>
                            </>
                          )}
                          {isReadingThis && (
                            <Badge
                              variant="default"
                              className="bg-zinc-950 px-1.5 py-0 font-mono text-[10px] font-semibold text-white"
                            >
                              Playing
                            </Badge>
                          )}
                        </div>

                        <ScoreBreakdownPopover
                          item={item}
                          showLabel
                          align="end"
                          onOpenRadar={onOpenRadar}
                        />
                      </div>

                      <h2 className="mt-2 text-base font-semibold leading-snug tracking-tight text-zinc-950">
                        {item.title}
                      </h2>

                      <div className="mt-3">
                        {isLoading ? (
                          <div className="space-y-2" aria-busy="true">
                            <Skeleton className="h-3.5 w-[92%] bg-zinc-200/70" />
                            <Skeleton className="h-3.5 w-[76%] bg-zinc-200/70" />
                          </div>
                        ) : aiSummary ? (
                          <div className="space-y-2 text-[13.5px] leading-relaxed text-zinc-800">
                            <p className="flex items-start gap-1.5 font-medium text-zinc-900">
                              <Sparkles
                                aria-hidden="true"
                                className="mt-1 size-3.5 shrink-0 text-zinc-600"
                              />
                              <span>{aiSummary.tldr}</span>
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className="h-4 rounded px-1.5 font-mono text-[10px] font-normal text-zinc-500"
                              >
                                {aiSummary.mode === 'extractive'
                                  ? 'extractive fallback'
                                  : aiSummary.mode === 'workers-ai'
                                    ? 'llama-3.2-1b-instruct'
                                    : aiSummary.provider ?? 'server-side'}
                              </Badge>
                            </div>
                            {aiSummary.takeaways.length > 0 && (
                              <ul className="list-disc space-y-1 pl-5 text-[13px] text-zinc-600">
                                {aiSummary.takeaways.slice(0, 3).map((pt) => (
                                  <li key={pt}>{pt}</li>
                                ))}
                              </ul>
                            )}
                            {aiSummary.whyMatters && (
                              <p className="text-xs text-zinc-500">
                                <strong className="font-medium text-zinc-800">
                                  Why it matters:
                                </strong>{' '}
                                {aiSummary.whyMatters}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <p className="text-[13.5px] leading-relaxed text-zinc-600">
                              {summarize(item.description, 2)}
                            </p>
                            {err && (
                              <p className="text-[11px] text-zinc-500">
                                AI TL;DR unavailable ({err}). Showing extractive summary.
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setModalItem(item)}
                          className="h-7 px-2.5 text-xs font-medium"
                        >
                          → Kiro task
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenInReader(item.id)}
                          className="h-7 gap-1 border-zinc-200 px-2.5 text-xs shadow-none"
                        >
                          Open in Reader
                          <ArrowUpRight className="size-3.5" />
                        </Button>
                        {!aiSummary && !isLoading && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void onSummarize(item)}
                            className="h-7 gap-1 px-2.5 text-xs text-zinc-600 hover:text-zinc-950"
                          >
                            <Sparkles aria-hidden="true" className="size-3" />
                            Summarize
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.li>
              )
            })}
          </ol>
        )}
      </div>

      <KiroTaskModal
        key={modalItem?.id ?? 'none'}
        item={modalItem}
        geminiSummary={modalItem ? summaries[modalItem.id] : undefined}
        open={Boolean(modalItem)}
        onClose={() => setModalItem(null)}
      />
    </PageShell>
  )
}