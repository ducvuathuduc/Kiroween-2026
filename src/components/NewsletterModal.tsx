import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  Check,
  Copy,
  ExternalLink,
  Mail,
  Plus,
  Rss,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  MAX_RAW_EMAIL_BYTES,
  type NewsletterFeedRecord,
} from '../lib/newsletter'
import { copyPlainText } from '../lib/export'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { Separator } from './ui/separator'

interface NewsletterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  newsletterFeeds: NewsletterFeedRecord[]
  onCreateFeed: (
    title: string,
  ) => Promise<{ ok: boolean; feed?: NewsletterFeedRecord; error?: string }>
  onDeleteFeed: (feedId: string) => Promise<void>
  onImportEmail: (
    feedId: string,
    rawEmail: string,
  ) => Promise<{ ok: boolean; duplicate?: boolean; subject?: string; error?: string }>
}

export default function NewsletterModal({
  open,
  onOpenChange,
  newsletterFeeds,
  onCreateFeed,
  onDeleteFeed,
  onImportEmail,
}: NewsletterModalProps) {
  const titleInputId = useId()
  const titleErrorId = useId()
  const targetFeedId = useId()
  const fileInputId = useId()
  const rawEmailId = useId()
  const importErrorId = useId()

  const [title, setTitle] = useState('')
  const [titleError, setTitleError] = useState('')
  const [creating, setCreating] = useState(false)

  const [selectedFeedId, setSelectedFeedId] = useState<string>('')
  const activeFeedId = newsletterFeeds.some((f) => f.id === selectedFeedId)
    ? selectedFeedId
    : (newsletterFeeds[0]?.id ?? '')
  const [rawEmail, setRawEmail] = useState('')
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const copyTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  const announce = (msg: string) => {
    setStatusMessage(msg)
  }

  const handleCopy = async (key: string, text: string, label: string) => {
    const ok = await copyPlainText(text)
    if (!ok) {
      announce('Copy failed. Select and copy manually.')
      return
    }
    setCopiedKey(key)
    announce(`${label} copied to clipboard.`)
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current)
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedKey(null)
      copyTimerRef.current = null
    }, 2000)
  }

  const handleCreateSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle) {
      setTitleError('Enter a newsletter name.')
      return
    }
    setCreating(true)
    setTitleError('')
    try {
      const res = await onCreateFeed(cleanTitle)
      if (!res.ok || !res.feed) {
        setTitleError(res.error ?? 'Could not create newsletter feed.')
        return
      }
      setTitle('')
      setSelectedFeedId(res.feed.id)
      announce(
        `Created newsletter feed "${res.feed.title}" with inbound address ${res.feed.inboundAddress}.`,
      )
    } finally {
      setCreating(false)
    }
  }

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_RAW_EMAIL_BYTES) {
      setImportError('Selected .eml file exceeds the 1 MiB limit.')
      return
    }
    try {
      const text = await file.text()
      setRawEmail(text)
      setImportError('')
      announce(`Loaded ${file.name} (${file.size} bytes). Submit to import.`)
    } catch {
      setImportError('Could not read the selected email file.')
    }
  }

  const handleImportSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!activeFeedId) {
      setImportError('Create or select a newsletter feed first.')
      return
    }
    if (!rawEmail.trim()) {
      setImportError('Paste a raw RFC 822 email or load a .eml file.')
      return
    }
    if (new TextEncoder().encode(rawEmail).byteLength > MAX_RAW_EMAIL_BYTES) {
      setImportError('Raw email exceeds the 1 MiB size limit.')
      return
    }

    setImporting(true)
    setImportError('')
    try {
      const res = await onImportEmail(activeFeedId, rawEmail)
      if (!res.ok) {
        setImportError(res.error ?? 'Could not parse or import email.')
        return
      }
      setRawEmail('')
      announce(
        res.duplicate
          ? `Entry "${res.subject ?? 'Newsletter'}" already exists in this feed.`
          : `Imported "${res.subject ?? 'Newsletter'}" into feed and updated /rss/${activeFeedId}.`,
      )
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-200/90 bg-white/95 p-0 shadow-[0_16px_48px_rgba(0,0,0,0.12)] backdrop-blur-xl sm:max-w-2xl">
        <DialogHeader className="border-b border-zinc-200 px-6 py-4 text-left">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
            <Mail aria-hidden="true" className="size-3.5" />
            Newsletter-to-Feed Bridge
          </div>
          <DialogTitle className="text-base font-semibold tracking-tight text-zinc-950">
            Newsletter feeds &amp; manual email import
          </DialogTitle>
          <DialogDescription className="text-[13px] text-zinc-500">
            Create an unguessable RSS/Atom/JSON feed paired with an isolated
            inbound address. Inbound addresses become live when Cloudflare Email
            Routing and DNS are wired; import raw RFC 822 or .eml messages below
            now.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[68vh] px-6 py-5">
          <div className="space-y-6">
            <section aria-label="Create newsletter bridge">
              <form onSubmit={(e) => void handleCreateSubmit(e)} noValidate>
                <label
                  htmlFor={titleInputId}
                  className="block text-xs font-medium text-zinc-900"
                >
                  New newsletter feed title
                </label>
                <div className="mt-1.5 flex gap-2">
                  <Input
                    id={titleInputId}
                    type="text"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value)
                      if (titleError) setTitleError('')
                    }}
                    aria-invalid={titleError ? 'true' : 'false'}
                    aria-describedby={titleError ? titleErrorId : undefined}
                    placeholder="e.g. AWS Architecture Digest"
                    className="h-9 flex-1 border-zinc-200 bg-white text-xs shadow-none focus-visible:border-zinc-950 focus-visible:ring-0"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={creating}
                    className="h-9 shrink-0 gap-1.5 px-3 text-xs font-medium"
                  >
                    <Plus aria-hidden="true" className="size-3.5" />
                    {creating ? 'Creating…' : 'Create feed'}
                  </Button>
                </div>
                {titleError && (
                  <p
                    id={titleErrorId}
                    role="alert"
                    className="mt-1.5 text-xs text-red-600"
                  >
                    {titleError}
                  </p>
                )}
              </form>
            </section>

            <Separator />

            <section aria-label="Configured newsletter feeds" className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
                  Active bridges ({newsletterFeeds.length})
                </h3>
              </div>

              {newsletterFeeds.length === 0 ? (
                <p className="rounded-md border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-5 text-center text-xs text-zinc-500">
                  No newsletter bridges yet. Create one above to generate an
                  unguessable feed ID and inbound mailbox address.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {newsletterFeeds.map((feed) => {
                    const rssPath = `/rss/${feed.id}`
                    const atomPath = `/atom/${feed.id}`
                    const jsonPath = `/json/${feed.id}`
                    const addrCopied = copiedKey === `addr:${feed.id}`
                    const rssCopied = copiedKey === `rss:${feed.id}`
                    return (
                      <li
                        key={feed.id}
                        className="rounded-md border border-zinc-200 bg-white p-3.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-zinc-950">
                                {feed.title}
                              </span>
                              <Badge
                                variant="outline"
                                className="h-4 rounded px-1.5 font-mono text-[10px] font-normal tabular-nums text-zinc-600"
                              >
                                {feed.entries.length}{' '}
                                {feed.entries.length === 1 ? 'entry' : 'entries'}
                              </Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] text-zinc-500">
                                Inbound:
                              </span>
                              <code className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-800">
                                {feed.inboundAddress}
                              </code>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Copy inbound address for ${feed.title}`}
                                onClick={() =>
                                  void handleCopy(
                                    `addr:${feed.id}`,
                                    feed.inboundAddress,
                                    'Inbound address',
                                  )
                                }
                                className="text-zinc-500 hover:text-zinc-950"
                              >
                                {addrCopied ? (
                                  <Check className="size-3" />
                                ) : (
                                  <Copy className="size-3" />
                                )}
                              </Button>
                            </div>

                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                              <Rss aria-hidden="true" className="size-3" />
                              <a
                                href={rssPath}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex items-center gap-1 font-mono text-zinc-800 underline-offset-2 hover:underline"
                              >
                                {rssPath}
                                <ExternalLink className="size-2.5" />
                              </a>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Copy RSS URL for ${feed.title}`}
                                onClick={() =>
                                  void handleCopy(
                                    `rss:${feed.id}`,
                                    `${window.location.origin}${rssPath}`,
                                    'RSS feed URL',
                                  )
                                }
                                className="text-zinc-500 hover:text-zinc-950"
                              >
                                {rssCopied ? (
                                  <Check className="size-3" />
                                ) : (
                                  <Copy className="size-3" />
                                )}
                              </Button>
                              <span aria-hidden="true" className="text-zinc-300">
                                ·
                              </span>
                              <a
                                href={atomPath}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="font-mono hover:text-zinc-950 hover:underline"
                              >
                                Atom
                              </a>
                              <span aria-hidden="true" className="text-zinc-300">
                                ·
                              </span>
                              <a
                                href={jsonPath}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="font-mono hover:text-zinc-950 hover:underline"
                              >
                                JSON Feed
                              </a>
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            disabled={deletingId === feed.id}
                            aria-label={`Delete newsletter feed ${feed.title}`}
                            onClick={() => {
                              setDeletingId(feed.id)
                              void onDeleteFeed(feed.id).finally(() => {
                                setDeletingId(null)
                                announce(`Deleted newsletter feed "${feed.title}".`)
                              })
                            }}
                            className="shrink-0 border-zinc-200 text-zinc-500 shadow-none hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <Separator />

            <section aria-label="Import raw email">
              <form
                onSubmit={(e) => void handleImportSubmit(e)}
                noValidate
                className="space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
                      Manual email import (.eml / raw RFC 822)
                    </h3>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      Parsed emails enter your timeline, receive the 4D signal
                      score, support AI summary, and serve at /rss/:feedId.
                    </p>
                  </div>
                  <div>
                    <input
                      id={fileInputId}
                      ref={fileInputRef}
                      type="file"
                      accept=".eml,message/rfc822,.txt"
                      onChange={(e) => void handleFileUpload(e)}
                      className="visually-hidden"
                      aria-label="Upload .eml email file"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-8 gap-1.5 border-zinc-200 text-xs shadow-none"
                    >
                      <Upload aria-hidden="true" className="size-3.5" />
                      Load .eml file
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor={targetFeedId}
                    className="block text-xs font-medium text-zinc-900"
                  >
                    Target newsletter feed
                  </label>
                  <select
                    id={targetFeedId}
                    value={activeFeedId}
                    onChange={(e) => {
                      setSelectedFeedId(e.target.value)
                      if (importError) setImportError('')
                    }}
                    disabled={newsletterFeeds.length === 0}
                    className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-900 outline-none focus-visible:border-zinc-950 disabled:bg-zinc-50 disabled:text-zinc-400"
                  >
                    {newsletterFeeds.length === 0 ? (
                      <option value="">Create a newsletter feed first…</option>
                    ) : (
                      newsletterFeeds.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.title} ({f.inboundAddress})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor={rawEmailId}
                    className="block text-xs font-medium text-zinc-900"
                  >
                    Raw email message (RFC 822 headers + body)
                  </label>
                  <textarea
                    id={rawEmailId}
                    rows={7}
                    value={rawEmail}
                    onChange={(e) => {
                      setRawEmail(e.target.value)
                      if (importError) setImportError('')
                    }}
                    aria-invalid={importError ? 'true' : 'false'}
                    aria-describedby={importError ? importErrorId : undefined}
                    placeholder={`From: AWS News <news@example.com>\nSubject: New Amazon Bedrock routing guide\nDate: Fri, 14 Nov 2026 09:00:00 +0000\nContent-Type: text/plain; charset=utf-8\n\nWrite or paste a full RFC 822 email message here…`}
                    className="w-full rounded-md border border-zinc-200 bg-white p-2.5 font-mono text-[11.5px] leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400 focus-visible:border-zinc-950"
                  />
                </div>

                {importError && (
                  <p
                    id={importErrorId}
                    role="alert"
                    className="text-xs text-red-600"
                  >
                    {importError}
                  </p>
                )}

                <div className="flex items-center justify-between gap-3">
                  <p
                    role="status"
                    aria-live="polite"
                    className="min-h-4 flex-1 text-xs font-medium text-zinc-700"
                  >
                    {statusMessage}
                  </p>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={importing || newsletterFeeds.length === 0}
                    className="h-8 shrink-0 text-xs font-medium"
                  >
                    {importing ? 'Importing…' : 'Import email into feed'}
                  </Button>
                </div>
              </form>
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-zinc-200 px-6 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 border-zinc-200 text-xs shadow-none"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
