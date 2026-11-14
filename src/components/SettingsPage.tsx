import { useState } from 'react'
import { Activity, Download, Mail, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import type { AIProviderId, ProviderStatus } from '../lib/providers'
import type { NavigableRoute } from '../lib/routes'
import {
  DEFAULT_SETTINGS,
  type DefaultFilter,
  type MotionPreference,
  type ReaderDensity,
  type ReaderSettings,
} from '../lib/storage'
import PageShell from './PageShell'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { Switch } from './ui/switch'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'

interface SettingsPageProps {
  settings: ReaderSettings
  providers: ProviderStatus[]
  onUpdateSettings: (next: ReaderSettings) => void
  onApplyDefaultFilterNow: (filter: DefaultFilter) => void
  alertsEnabled: boolean
  onToggleAlerts: () => void
  tasteReady: boolean
  tasteStatus: string
  onResetTaste: () => void
  onDemoTaste: () => void
  stats: {
    feedsCount: number
    readCount: number
    savedCount: number
    summariesCount: number
  }
  onExportJson: () => string
  onExportOpml: () => void
  onClearAllData: () => void
  onOpenNewsletterModal?: () => void
  newsletterCount?: number
  onNavigate: (route: NavigableRoute) => void
}

export default function SettingsPage({
  settings,
  providers,
  onUpdateSettings,
  onApplyDefaultFilterNow,
  alertsEnabled,
  onToggleAlerts,
  tasteReady,
  tasteStatus,
  onResetTaste,
  onDemoTaste,
  stats,
  onExportJson,
  onExportOpml,
  onClearAllData,
  onOpenNewsletterModal,
  newsletterCount = 0,
  onNavigate,
}: SettingsPageProps) {
  const [confirmClear, setConfirmClear] = useState(false)
  const [statusNotice, setStatusNotice] = useState('')

  const notificationSupport =
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'

  return (
    <PageShell
      label="Reader settings"
      currentRoute="settings"
      onNavigate={onNavigate}
    >
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-6">
        <div>
          <p className="font-mono text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
            Preferences · /settings
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
            Settings
          </h1>
          <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-zinc-600">
            Configure reading density, startup triage filter, high-signal
            alerts, reduced-motion behavior, and local data exports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenNewsletterModal && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenNewsletterModal}
              className="h-8 gap-1.5 border-zinc-200 text-xs shadow-none"
            >
              <Mail aria-hidden="true" className="size-3.5" />
              Newsletter bridges ({newsletterCount})
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onNavigate('system')}
            className="h-8 gap-1.5 border-zinc-200 text-xs shadow-none"
          >
            <Activity aria-hidden="true" className="size-3.5" />
            Open Feed Health
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <section aria-label="Personal ranking" className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-4">
            <div><h2 className="text-sm font-semibold">Personal ranking</h2><p className="mt-1 text-xs text-zinc-500">Adjust feed order from local reading feedback. The deterministic signal score stays unchanged.</p></div>
            <Switch aria-label="Enable personal ranking" checked={settings.personalBoostEnabled} onCheckedChange={(checked) => onUpdateSettings({ ...settings, personalBoostEnabled: checked })} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!tasteReady} onClick={onResetTaste}>Reset my taste</Button>
            <Button type="button" variant="outline" size="sm" disabled={!tasteReady} onClick={onDemoTaste}>Demo profile: AWS-builder</Button>
          </div>
          {tasteStatus && <p role="status" className="mt-3 text-xs text-zinc-600">{tasteStatus}</p>}
        </section>
        <section
          aria-label="Reading interface preferences"
          className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white"
        >
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">
                Timeline density
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Switch between Comfortable (default spacing) and Compact (high
                scan density).
              </p>
            </div>
            <Tabs
              value={settings.density}
              onValueChange={(v) => {
                onUpdateSettings({
                  ...settings,
                  density: v as ReaderDensity,
                })
                setStatusNotice(`Density set to ${v}.`)
              }}
            >
              <TabsList className="h-8 bg-zinc-100/80 p-0.5">
                <TabsTrigger value="comfortable" className="h-7 px-3 text-xs">
                  Comfortable
                </TabsTrigger>
                <TabsTrigger value="compact" className="h-7 px-3 text-xs">
                  Compact
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">
                Default timeline filter
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Choose which tab opens by default on startup (and apply
                immediately if desired).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="default-filter-select" className="visually-hidden">
                Default timeline filter
              </label>
              <select
                id="default-filter-select"
                value={settings.defaultFilter}
                onChange={(e) => {
                  const nextFilter = e.target.value as DefaultFilter
                  onUpdateSettings({
                    ...settings,
                    defaultFilter: nextFilter,
                  })
                  onApplyDefaultFilterNow(nextFilter)
                  setStatusNotice(`Default filter updated to ${nextFilter}.`)
                }}
                className="h-8 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-900 outline-none focus-visible:border-zinc-950"
              >
                <option value="all">All items</option>
                <option value="high">High signal (≥70)</option>
                <option value="unread">Unread only</option>
                <option value="saved">Saved bookmarks</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 p-5">
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">
                High-signal notifications (≥85)
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Notify via browser Notifications API when live feeds surface an
                item scoring ≥85. Permission:{' '}
                <span className="font-mono text-zinc-800">
                  {notificationSupport}
                </span>
                .
              </p>
            </div>
            <Switch
              checked={alertsEnabled}
              onCheckedChange={onToggleAlerts}
              aria-label="Enable high-signal notifications (≥85)"
            />
          </div>

          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">
                Motion &amp; transitions
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Follows your OS <code className="font-mono">prefers-reduced-motion</code>{' '}
                setting by default, or force-disable non-essential motion.
              </p>
            </div>
            <Tabs
              value={settings.reducedMotion}
              onValueChange={(v) => {
                onUpdateSettings({
                  ...settings,
                  reducedMotion: v as MotionPreference,
                })
                setStatusNotice(
                  v === 'reduce'
                    ? 'Reduced motion enforced.'
                    : 'Following system reduced-motion preference.',
                )
              }}
            >
              <TabsList className="h-8 bg-zinc-100/80 p-0.5">
                <TabsTrigger value="system" className="h-7 px-3 text-xs">
                  System
                </TabsTrigger>
                <TabsTrigger value="reduce" className="h-7 px-3 text-xs">
                  Reduce motion
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-950">
                  <Sparkles aria-hidden="true" className="size-3.5 text-zinc-600" />
                  AI summarization &amp; embedding provider
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Routed server-side via Vercel AI SDK v7. Only providers with a
                  configured server key are selectable; API keys never leave the server.
                </p>
              </div>
              <Badge
                variant="outline"
                className="h-5 rounded px-2 font-mono text-[10px] font-normal text-zinc-600"
              >
                {providers.filter((p) => p.available).length}/{providers.length}{' '}
                configured
              </Badge>
            </div>

            <div
              role="radiogroup"
              aria-label="Preferred AI provider"
              className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
            >
              {providers.map((provider) => {
                const selected = settings.aiProvider === provider.id
                const selectable = provider.available
                return (
                  <button
                    key={provider.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!selectable}
                    onClick={() => {
                      if (!selectable) return
                      onUpdateSettings({
                        ...settings,
                        aiProvider: provider.id as AIProviderId,
                      })
                      setStatusNotice(`Preferred AI provider set to ${provider.label}.`)
                    }}
                    className={`flex flex-col items-start justify-between rounded-md border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 ${
                      selected && selectable
                        ? 'border-zinc-950 bg-zinc-50'
                        : selectable
                          ? 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/60'
                          : 'cursor-not-allowed border-zinc-200 bg-zinc-50/40 opacity-60'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-zinc-950">
                        {provider.label}
                      </span>
                      <Badge
                        variant="outline"
                        className={`h-4 rounded px-1.5 font-mono text-[10px] font-normal ${
                          provider.available
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-zinc-200 bg-white text-zinc-500'
                        }`}
                      >
                        {provider.available ? 'Available' : 'Key not set'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                      {provider.description}
                    </p>
                    <p className="mt-2 font-mono text-[10px] text-zinc-400">
                      {provider.modelLabel}
                      {provider.embeddingModelLabel
                        ? ` · ${provider.embeddingModelLabel}`
                        : ''}
                    </p>
                  </button>
                )
              })}
            </div>

            <p className="text-[11px] text-zinc-500">
              Fallback order: Gemini → OpenAI → Anthropic → Amazon Bedrock.
              Unconfigured providers are skipped silently.
            </p>
          </div>
        </section>

        <section
          aria-label="Data portability and local backup"
          className="rounded-lg border border-zinc-200 bg-white p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">
                Data portability &amp; backup
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Export your entire local reader state (feeds, read/saved IDs,
                cached Gemini TL;DRs, and preferences) as JSON or standard OPML.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 font-mono text-xs tabular-nums text-zinc-600">
              <span>{stats.feedsCount} feeds</span>
              <span>·</span>
              <span>{stats.readCount} read</span>
              <span>·</span>
              <span>{stats.savedCount} saved</span>
              <span>·</span>
              <span>{stats.summariesCount} TL;DRs</span>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const fileName = onExportJson()
                setStatusNotice(`Downloaded ${fileName}.`)
              }}
              className="h-8 gap-1.5 text-xs font-medium"
            >
              <Download aria-hidden="true" className="size-3.5" />
              Export all data (.json)
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onExportOpml()
                setStatusNotice('Downloaded OPML subscriptions.')
              }}
              className="h-8 gap-1.5 border-zinc-200 text-xs shadow-none"
            >
              <Download aria-hidden="true" className="size-3.5" />
              Export feeds (.opml)
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onUpdateSettings(DEFAULT_SETTINGS)
                onApplyDefaultFilterNow(DEFAULT_SETTINGS.defaultFilter)
                setStatusNotice('Preferences reset to defaults.')
              }}
              className="h-8 gap-1.5 text-xs text-zinc-600 hover:text-zinc-950"
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              Reset preferences
            </Button>

            <div className="ml-auto">
              {!confirmClear ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmClear(true)}
                  className="h-8 gap-1.5 border-zinc-200 text-xs text-red-700 shadow-none hover:bg-red-50 hover:text-red-800"
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  Clear all local data
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      onClearAllData()
                      setConfirmClear(false)
                      setStatusNotice('Cleared all local data and restored defaults.')
                    }}
                    className="h-8 bg-red-600 text-xs text-white hover:bg-red-700"
                  >
                    Confirm erase
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmClear(false)}
                    className="h-8 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>

          {statusNotice && (
            <p
              role="status"
              aria-live="polite"
              className="mt-3 text-xs font-medium text-zinc-800"
            >
              {statusNotice}
            </p>
          )}
        </section>
      </div>
    </PageShell>
  )
}
