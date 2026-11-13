import type { FeedItem } from '../lib/feeds'
import { scoreBadgeClass, timeAgo } from '../lib/format'

export type Filter = 'all' | 'high' | 'unread' | 'saved'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'high', label: 'High signal ≥70' },
  { id: 'unread', label: 'Unread' },
  { id: 'saved', label: 'Saved' },
]

interface ItemListProps {
  items: FeedItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  filter: Filter
  onFilterChange: (f: Filter) => void
  query: string
  onQueryChange: (q: string) => void
  readIds: string[]
  savedIds: string[]
  onToggleSave: (id: string) => void
}

export default function ItemList({
  items,
  selectedId,
  onSelect,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  readIds,
  savedIds,
  onToggleSave,
}: ItemListProps) {
  return (
    <section className="flex w-96 shrink-0 flex-col border-r border-line bg-ink">
      <div className="border-b border-line p-3">
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search titles…"
          className="w-full rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-lime-glow"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onFilterChange(f.id)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                filter === f.id
                  ? 'bg-lime-glow text-black'
                  : 'bg-panel2 text-zinc-300 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 && (
          <p className="p-4 text-sm text-zinc-500">
            No items match. Try another filter or add a feed.
          </p>
        )}
        {items.map((item) => {
          const isRead = readIds.includes(item.id)
          const isSaved = savedIds.includes(item.id)
          return (
            <article
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`cursor-pointer border-b border-line px-3 py-2.5 hover:bg-panel ${
                selectedId === item.id ? 'bg-panel' : ''
              } ${isRead ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${scoreBadgeClass(item.score ?? 0)}`}
                  title="Deterministic signal score (not AI)"
                >
                  {item.score ?? 0}
                </span>
                <div className="min-w-0 flex-1">
                  <h3
                    className={`text-sm leading-snug ${
                      isRead ? 'font-normal text-zinc-400' : 'font-semibold text-zinc-100'
                    }`}
                  >
                    {item.title}
                  </h3>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {item.feedTitle} · {timeAgo(item.pubDate)}
                    {item.sample ? ' · SAMPLE' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={isSaved ? 'Unsave' : 'Save'}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleSave(item.id)
                  }}
                  className={`shrink-0 text-base leading-none ${
                    isSaved ? 'text-lime-glow' : 'text-zinc-600 hover:text-zinc-300'
                  }`}
                >
                  {isSaved ? '★' : '☆'}
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
