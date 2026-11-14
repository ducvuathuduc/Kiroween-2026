import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  Download,
  Flame,
  GitBranch,
  Layers,
  Mail,
  MoreHorizontal,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import type { FeedHealth } from '../lib/briefing'
import type { FeedSource } from '../lib/feeds'
import {
  feedMonogram,
  formatRefreshTime,
  safeHttpUrl,
  timeAgo,
} from '../lib/format'
import { routeToPath, type NavigableRoute } from '../lib/routes'
import { Avatar, AvatarFallback } from './ui/avatar'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { Separator } from './ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

interface FeedListProps {
  feeds: FeedSource[]
  unreadCounts: Record<string, number>
  totalUnread: number
  pulseCounts: { hn: number; github: number }
  feedHealth: Record<string, FeedHealth>
  selectedFeed: string
  onSelect: (feedId: string) => void
  onAdd: (url: string) => { ok: boolean; error?: string }
  onRemove: (feedId: string) => void
  onRestoreDefaults: () => void
  onImportOpml: (xml: string) => { ok: boolean; message: string }
  onExportOpml: () => void
  onOpenNewsletterModal?: () => void
  onNavigate: (route: NavigableRoute) => void
  onOpenShortcutsModal: () => void
  errors: Record<string, string>
}

export default function FeedList({
  feeds,
  unreadCounts,
  totalUnread,
  pulseCounts,
  feedHealth,
  selectedFeed,
  onSelect,
  onAdd,
  onRemove,
  onRestoreDefaults,
  onImportOpml,
  onExportOpml,
  onOpenNewsletterModal,
  onNavigate,
  onOpenShortcutsModal,
  errors,
}: FeedListProps) {
  const [url, setUrl] = useState('')
  const [addError, setAddError] = useState('')
  const [opmlNotice, setOpmlNotice] = useState<{
    ok: boolean
    text: string
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const validUrl = safeHttpUrl(url)
    if (!validUrl) {
      setAddError('Enter a valid http(s) feed URL')
      return
    }
    const result = onAdd(validUrl)
    if (!result.ok) {
      setAddError(result.error ?? 'Could not add feed')
      return
    }
    setUrl('')
    setAddError('')
  }

  const handleOpmlFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const xml = await file.text()
      const res = onImportOpml(xml)
      setOpmlNotice({ ok: res.ok, text: res.message })
    } catch {
      setOpmlNotice({ ok: false, text: 'Could not read OPML file' })
    }
  }

  return (
    <aside
      aria-label="Feed subscriptions"
      className="flex w-full shrink-0 flex-col border-b border-zinc-200 bg-zinc-50/40 md:w-56 md:border-r md:border-b-0 lg:w-64"
    >
      <div className="space-y-0.5 p-2.5">
        <Button
          type="button"
          variant="ghost"
          onClick={() => onSelect('all')}
          aria-current={selectedFeed === 'all' ? 'true' : undefined}
          className={`h-8 w-full justify-start gap-2 px-2.5 text-[13px] shadow-none ${
            selectedFeed === 'all'
              ? 'bg-zinc-100 font-semibold text-zinc-950'
              : 'font-medium text-zinc-600 hover:bg-zinc-100/70 hover:text-zinc-950'
          }`}
        >
          <Layers aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="flex-1 truncate text-left">All items</span>
          {totalUnread > 0 && (
            <Badge
              variant="secondary"
              className="h-5 rounded-md px-1.5 font-mono text-[11px] font-medium tabular-nums text-zinc-700"
            >
              {totalUnread}
            </Badge>
          )}
        </Button>

        <div className="px-2 pt-2.5 pb-1">
          <p className="text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
            Community Pulse
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          onClick={() => onSelect('pulse:hn')}
          aria-current={selectedFeed === 'pulse:hn' ? 'true' : undefined}
          className={`h-8 w-full justify-start gap-2 px-2.5 text-[13px] shadow-none ${
            selectedFeed === 'pulse:hn'
              ? 'bg-zinc-100 font-semibold text-zinc-950'
              : 'font-normal text-zinc-700 hover:bg-zinc-100/70 hover:text-zinc-950'
          }`}
        >
          <Flame aria-hidden="true" className="size-3.5 shrink-0 text-zinc-500" />
          <span className="flex-1 truncate text-left">HN Top Stories</span>
          {pulseCounts.hn > 0 && (
            <Badge
              variant="secondary"
              className="h-4 rounded px-1.5 font-mono text-[10px] font-medium tabular-nums text-zinc-600"
            >
              {pulseCounts.hn}
            </Badge>
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() => onSelect('pulse:github')}
          aria-current={selectedFeed === 'pulse:github' ? 'true' : undefined}
          className={`h-8 w-full justify-start gap-2 px-2.5 text-[13px] shadow-none ${
            selectedFeed === 'pulse:github'
              ? 'bg-zinc-100 font-semibold text-zinc-950'
              : 'font-normal text-zinc-700 hover:bg-zinc-100/70 hover:text-zinc-950'
          }`}
        >
          <GitBranch
            aria-hidden="true"
            className="size-3.5 shrink-0 text-zinc-500"
          />
          <span className="flex-1 truncate text-left">GitHub AWS</span>
          {pulseCounts.github > 0 && (
            <Badge
              variant="secondary"
              className="h-4 rounded px-1.5 font-mono text-[10px] font-medium tabular-nums text-zinc-600"
            >
              {pulseCounts.github}
            </Badge>
          )}
        </Button>
      </div>

      <Separator />

      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <p className="text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
          Subscriptions
        </p>
        <div className="flex items-center gap-0.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".opml,.xml,text/xml,application/xml"
            onChange={(e) => void handleOpmlFileChange(e)}
            className="visually-hidden"
            aria-label="Import OPML subscriptions file"
          />
          {onOpenNewsletterModal && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Newsletter feeds"
                  onClick={onOpenNewsletterModal}
                  className="text-zinc-500 hover:text-zinc-950"
                >
                  <Mail className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Newsletter-to-feed bridge</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Import OPML"
                onClick={() => fileInputRef.current?.click()}
                className="text-zinc-400 hover:text-zinc-950"
              >
                <Upload className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import Google Reader OPML</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Export OPML"
                onClick={onExportOpml}
                className="text-zinc-400 hover:text-zinc-950"
              >
                <Download className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export feeds (.opml)</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {opmlNotice && (
        <p
          role={opmlNotice.ok ? 'status' : 'alert'}
          className={`px-4 pb-1.5 text-[11px] ${
            opmlNotice.ok ? 'text-zinc-600' : 'text-red-600'
          }`}
        >
          {opmlNotice.text}
        </p>
      )}

      <ScrollArea className="min-h-0 flex-1 px-2.5 pb-2">
        {feeds.length === 0 ? (
          <div className="mx-1 my-4 rounded-md border border-dashed border-zinc-200 bg-white p-4 text-center">
            <p className="text-[13px] text-zinc-500">
              No feeds subscribed. Add an RSS or Atom URL below.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRestoreDefaults}
              className="mt-3 h-7 text-xs"
            >
              Restore default feeds
            </Button>
          </div>
        ) : (
          <ul className="space-y-1">
            {feeds.map((feed) => {
              const count = unreadCounts[feed.id] ?? 0
              const isSelected = selectedFeed === feed.id
              const health = feedHealth[feed.id]
              const feedErr = errors[feed.id]

              return (
                <li key={feed.id} className="group">
                  <div className="flex items-start gap-0.5">
                    <HoverCard openDelay={260} closeDelay={80}>
                      <HoverCardTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => onSelect(feed.id)}
                          aria-current={isSelected ? 'true' : undefined}
                          className={`h-auto min-h-9 min-w-0 flex-1 items-start justify-start gap-2 px-2 py-1.5 text-[13px] shadow-none ${
                            isSelected
                              ? 'bg-zinc-100 font-semibold text-zinc-950'
                              : 'font-normal text-zinc-700 hover:bg-zinc-100/70 hover:text-zinc-950'
                          }`}
                        >
                          <Avatar
                            size="sm"
                            className="mt-0.5 size-5 shrink-0 border border-zinc-200"
                          >
                            <AvatarFallback className="bg-white font-mono text-[9px] font-medium text-zinc-700">
                              {feedMonogram(feed.title)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1 text-left">
                            <span className="block truncate">{feed.title}</span>
                            {health && (
                              <span
                                className={`block truncate font-mono text-[10px] font-normal tabular-nums ${
                                  health.ok ? 'text-zinc-400' : 'text-red-600'
                                }`}
                              >
                                {health.ok
                                  ? `${health.itemCount} items · ${timeAgo(health.lastFetchedAt)}`
                                  : `Error · ${timeAgo(health.lastFetchedAt)}`}
                              </span>
                            )}
                          </span>
                          {count > 0 && (
                            <Badge
                              variant="secondary"
                              className="mt-0.5 h-4 shrink-0 rounded px-1.5 font-mono text-[10px] font-medium tabular-nums text-zinc-600"
                            >
                              {count}
                            </Badge>
                          )}
                        </Button>
                      </HoverCardTrigger>
                      <HoverCardContent side="right" align="start" className="w-64 p-3">
                        <p className="text-xs font-semibold text-zinc-950">
                          {feed.title}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">
                          {feed.url}
                        </p>
                        {feed.kind === 'newsletter' && feed.inboundAddress && (
                          <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-600">
                            Inbound: {feed.inboundAddress}
                          </p>
                        )}
                        <Separator className="my-2" />
                        {health ? (
                          <dl className="space-y-1 text-[11px]">
                            <div className="flex justify-between">
                              <dt className="text-zinc-500">Status</dt>
                              <dd
                                className={`font-medium ${
                                  health.ok ? 'text-emerald-700' : 'text-red-600'
                                }`}
                              >
                                {health.ok ? 'Healthy' : 'Fetch error'}
                              </dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-zinc-500">Items fetched</dt>
                              <dd className="font-mono tabular-nums text-zinc-950">
                                {health.itemCount}
                              </dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-zinc-500">Last checked</dt>
                              <dd className="font-mono tabular-nums text-zinc-950">
                                {formatRefreshTime(health.lastFetchedAt) ||
                                  timeAgo(health.lastFetchedAt)}
                              </dd>
                            </div>
                          </dl>
                        ) : (
                          <p className="text-[11px] text-zinc-500">
                            Waiting for initial fetch…
                          </p>
                        )}
                      </HoverCardContent>
                    </HoverCard>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Actions for ${feed.title}`}
                          className="touch-visible mt-1 shrink-0 text-zinc-400 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-zinc-950 focus-visible:opacity-100 data-[state=open]:opacity-100"
                        >
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onSelect={() => onSelect(feed.id)}>
                          Filter to feed
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => onRemove(feed.id)}
                        >
                          <Trash2 className="size-3.5" />
                          Remove feed
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {feedErr && (
                    <p
                      role="status"
                      className="px-2.5 pb-1.5 text-[11px] text-red-600"
                    >
                      {/^failed/i.test(feedErr)
                        ? feedErr
                        : `Failed: ${feedErr}`}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>

      <Separator />

      <div className="p-3">
        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="add-feed-url" className="visually-hidden">
            Add RSS feed URL
          </label>
          <div className="flex gap-1.5">
            <Input
              id="add-feed-url"
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                if (addError) setAddError('')
              }}
              aria-invalid={addError ? 'true' : 'false'}
              aria-describedby={addError ? 'add-feed-error' : undefined}
              placeholder="Add RSS feed URL…"
              className="h-8 min-w-0 flex-1 border-zinc-200 bg-white text-xs shadow-none placeholder:text-zinc-400 focus-visible:border-zinc-950 focus-visible:ring-0"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1 border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-900 shadow-none hover:bg-zinc-100"
            >
              <Plus aria-hidden="true" className="size-3" />
              Add
            </Button>
          </div>
          {addError && (
            <p
              id="add-feed-error"
              role="alert"
              className="mt-1.5 text-[11px] text-red-600"
            >
              {addError}
            </p>
          )}
        </form>
        <nav
          aria-label="Workspace resources"
          className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-zinc-200/80 pt-2 text-[11px] text-zinc-500"
        >
          {(
            [
              ['docs', 'Docs'],
              ['settings', 'Settings'],
              ['about', 'About'],
              ['changelog', 'Changelog'],
              ['privacy', 'Privacy'],
            ] as const
          ).map(([route, label]) => (
            <a
              key={route}
              href={routeToPath(route)}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                e.preventDefault()
                onNavigate(route)
              }}
              className="hover:text-zinc-950 hover:underline underline-offset-2"
            >
              {label}
            </a>
          ))}
          <button
            type="button"
            onClick={onOpenShortcutsModal}
            className="ml-auto font-mono text-[11px] text-zinc-500 hover:text-zinc-950"
            title="Keyboard shortcuts (?)"
          >
            ? keys
          </button>
        </nav>
      </div>
    </aside>
  )
}
