import { useState } from 'react'
import type { FeedItem } from '../lib/feeds'
import { scoreBadgeClass, summarize, timeAgo } from '../lib/format'
import { buildKiroTask } from '../lib/kiroTask'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

interface ReaderPaneProps {
  item: FeedItem | null
  saved: boolean
  onToggleSave: (id: string) => void
  onMarkUnread: (id: string) => void
}

export default function ReaderPane({
  item,
  saved,
  onToggleSave,
  onMarkUnread,
}: ReaderPaneProps) {
  const [copied, setCopied] = useState(false)

  if (!item) {
    return (
      <article className="flex flex-1 items-center justify-center bg-ink p-8 text-center text-sm text-zinc-500">
        Select an item to read it here. Press j / k to move, s to save, r to
        refresh.
      </article>
    )
  }

  const handleKiroTask = async () => {
    const ok = await copyText(buildKiroTask(item))
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <article className="flex-1 overflow-y-auto bg-ink p-6">
      <div className="mx-auto max-w-2xl">
        {item.sample && (
          <p className="mb-3 inline-block rounded bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-black">
            SAMPLE DATA — live feeds did not load yet
          </p>
        )}
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${scoreBadgeClass(item.score ?? 0)}`}
            title="Deterministic signal score (not AI)"
          >
            {item.score ?? 0} signal
          </span>
          <span>{item.feedTitle}</span>
          <span>·</span>
          <span>{timeAgo(item.pubDate)}</span>
        </div>
        <h1 className="mt-3 font-display text-2xl font-bold leading-snug text-zinc-50">
          {item.title}
        </h1>
        <p className="mt-4 border-l-2 border-lime-glow pl-4 text-[15px] leading-relaxed text-zinc-300">
          {summarize(item.description)}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <a
            href={item.link}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-lime-glow px-3 py-2 text-sm font-semibold text-black hover:brightness-110"
          >
            Open original ↗
          </a>
          <button
            type="button"
            onClick={() => onToggleSave(item.id)}
            className="rounded-md bg-panel2 px-3 py-2 text-sm font-semibold text-zinc-200 hover:text-lime-glow"
          >
            {saved ? '★ Saved' : '☆ Save'}
          </button>
          <button
            type="button"
            onClick={() => onMarkUnread(item.id)}
            className="rounded-md bg-panel2 px-3 py-2 text-sm font-semibold text-zinc-200 hover:text-lime-glow"
          >
            Mark unread
          </button>
          <button
            type="button"
            onClick={handleKiroTask}
            className="rounded-md border border-lime-glow px-3 py-2 text-sm font-semibold text-lime-glow hover:bg-lime-glow hover:text-black"
          >
            {copied ? '✓ Copied to clipboard' : '→ Kiro task'}
          </button>
        </div>
        {/* TODO (Build agent, tasks.md #9): replace the inline copy with a KiroTaskModal previewing the Markdown spec before copying. */}
      </div>
    </article>
  )
}
