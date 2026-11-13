import { useState } from 'react'
import type { FeedSource } from '../lib/feeds'

interface FeedListProps {
  feeds: FeedSource[]
  unreadCounts: Record<string, number>
  selectedFeed: string
  onSelect: (feedId: string) => void
  onAdd: (url: string) => void
  onRemove: (feedId: string) => void
  errors: Record<string, string>
}

export default function FeedList({
  feeds,
  unreadCounts,
  selectedFeed,
  onSelect,
  onAdd,
  onRemove,
  errors,
}: FeedListProps) {
  const [url, setUrl] = useState('')
  const [addError, setAddError] = useState('')

  const submit = () => {
    const trimmed = url.trim()
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Only http(s) feed URLs are supported')
      }
      onAdd(trimmed)
      setUrl('')
      setAddError('')
    } catch {
      setAddError('Enter a valid http(s) feed URL')
    }
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-panel">
      <div className="border-b border-line p-3">
        <button
          type="button"
          onClick={() => onSelect('all')}
          className={`w-full rounded-md px-3 py-2 text-left text-sm font-semibold ${
            selectedFeed === 'all'
              ? 'bg-panel2 text-lime-glow'
              : 'text-zinc-300 hover:bg-panel2'
          }`}
        >
          All items
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {feeds.map((feed) => (
          <div key={feed.id} className="group">
            <div
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                selectedFeed === feed.id
                  ? 'bg-panel2 text-lime-glow'
                  : 'text-zinc-300 hover:bg-panel2'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(feed.id)}
                className="min-w-0 flex-1 truncate text-left"
                title={feed.url}
              >
                {feed.title}
              </button>
              {(unreadCounts[feed.id] ?? 0) > 0 && (
                <span className="rounded-full bg-lime-glow px-1.5 text-[11px] font-bold text-black">
                  {unreadCounts[feed.id]}
                </span>
              )}
              <button
                type="button"
                aria-label={`Remove ${feed.title}`}
                onClick={() => onRemove(feed.id)}
                className="hidden text-zinc-500 hover:text-red-400 group-hover:inline"
              >
                ×
              </button>
            </div>
            {errors[feed.id] && (
              <p className="px-3 pb-1 text-[11px] text-red-400">
                Failed: {errors[feed.id]}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-line p-3">
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            placeholder="Add RSS feed URL…"
            className="min-w-0 flex-1 rounded-md border border-line bg-ink px-2 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-lime-glow"
          />
          <button
            type="button"
            onClick={submit}
            className="rounded-md bg-panel2 px-2 py-1.5 text-xs font-semibold text-zinc-200 hover:text-lime-glow"
          >
            Add
          </button>
        </div>
        {addError && (
          <p className="mt-1 text-[11px] text-red-400">{addError}</p>
        )}
      </div>
    </aside>
  )
}
