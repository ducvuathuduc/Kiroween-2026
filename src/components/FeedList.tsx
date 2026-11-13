import { useState, type FormEvent } from 'react'
import { Layers, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import type { FeedSource } from '../lib/feeds'
import { feedMonogram, safeHttpUrl } from '../lib/format'
import { Avatar, AvatarFallback } from './ui/avatar'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { Separator } from './ui/separator'

interface FeedListProps {
  feeds: FeedSource[]
  unreadCounts: Record<string, number>
  totalUnread: number
  selectedFeed: string
  onSelect: (feedId: string) => void
  onAdd: (url: string) => { ok: boolean; error?: string }
  onRemove: (feedId: string) => void
  onRestoreDefaults: () => void
  errors: Record<string, string>
}

export default function FeedList({
  feeds,
  unreadCounts,
  totalUnread,
  selectedFeed,
  onSelect,
  onAdd,
  onRemove,
  onRestoreDefaults,
  errors,
}: FeedListProps) {
  const [url, setUrl] = useState('')
  const [addError, setAddError] = useState('')

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

  return (
    <aside
      aria-label="Feed subscriptions"
      className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/40"
    >
      <div className="p-2.5">
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
      </div>

      <Separator />

      <div className="px-4 pt-3 pb-1.5">
        <p className="text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
          Subscriptions
        </p>
      </div>

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
          <ul className="space-y-0.5">
            {feeds.map((feed) => {
              const count = unreadCounts[feed.id] ?? 0
              const isSelected = selectedFeed === feed.id
              return (
                <li key={feed.id} className="group">
                  <div className="flex items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onSelect(feed.id)}
                      aria-current={isSelected ? 'true' : undefined}
                      title={feed.url}
                      className={`h-8 min-w-0 flex-1 justify-start gap-2 px-2 text-[13px] shadow-none ${
                        isSelected
                          ? 'bg-zinc-100 font-semibold text-zinc-950'
                          : 'font-normal text-zinc-700 hover:bg-zinc-100/70 hover:text-zinc-950'
                      }`}
                    >
                      <Avatar size="sm" className="size-5 border border-zinc-200">
                        <AvatarFallback className="bg-white font-mono text-[9px] font-medium text-zinc-700">
                          {feedMonogram(feed.title)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate text-left">
                        {feed.title}
                      </span>
                      {count > 0 && (
                        <Badge
                          variant="secondary"
                          className="h-4 rounded px-1.5 font-mono text-[10px] font-medium tabular-nums text-zinc-600"
                        >
                          {count}
                        </Badge>
                      )}
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Actions for ${feed.title}`}
                          className="touch-visible shrink-0 text-zinc-400 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-zinc-950 focus-visible:opacity-100 data-[state=open]:opacity-100"
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

                  {errors[feed.id] && (
                    <p
                      role="status"
                      className="px-2.5 pb-1.5 text-[11px] text-red-600"
                    >
                      {/^failed/i.test(errors[feed.id])
                        ? errors[feed.id]
                        : `Failed: ${errors[feed.id]}`}
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
      </div>
    </aside>
  )
}
