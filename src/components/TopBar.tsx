interface TopBarProps {
  total: number
  unread: number
  high: number
  lastRefresh: string | null
  loading: boolean
  onRefresh: () => void
}

export default function TopBar({
  total,
  unread,
  high,
  lastRefresh,
  loading,
  onRefresh,
}: TopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-panel px-4">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-xl font-bold text-zinc-100">
          Resurrected Reader
        </span>
        <span className="hidden text-xs text-zinc-500 sm:inline">
          Google Reader, back from the dead — as a radar
        </span>
      </div>
      <div className="ml-auto flex items-center gap-3 text-xs text-zinc-400">
        <span>
          <strong className="text-zinc-100">{total}</strong> items
        </span>
        <span>
          <strong className="text-zinc-100">{unread}</strong> unread
        </span>
        <span>
          <strong className="text-lime-glow">{high}</strong> high signal
        </span>
        {lastRefresh && (
          <span className="hidden text-zinc-500 md:inline">
            {new Date(lastRefresh).toLocaleTimeString()}
          </span>
        )}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded-md bg-lime-glow px-3 py-1.5 font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
        >
          {loading ? 'Fetching…' : 'Refresh'}
        </button>
      </div>
    </header>
  )
}
