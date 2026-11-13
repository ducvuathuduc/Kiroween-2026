import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { motion } from 'motion/react'
import type { FeedItem } from '../lib/feeds'
import { scoreBadgeClass } from '../lib/format'
import { buildKiroTask } from '../lib/kiroTask'
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
import { ScrollArea } from './ui/scroll-area'

function legacyCopy(text: string): boolean {
  const field = Object.assign(document.createElement('textarea'), {
    value: text,
  })
  field.setAttribute('readonly', '')
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0'
  document.body.append(field)
  field.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field.remove()
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return legacyCopy(text)
  }
}

interface KiroTaskModalProps {
  item: FeedItem | null
  open: boolean
  onClose: () => void
}

export default function KiroTaskModal({
  item,
  open,
  onClose,
}: KiroTaskModalProps) {
  const timerRef = useRef<number | null>(null)
  const lastAnnouncementRef = useRef('')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  )
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  const markdown = item ? buildKiroTask(item) : ''
  const score = item?.score ?? 0

  const handleCopy = async () => {
    if (!markdown) return
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
    }
    const ok = await copyText(markdown)
    setCopyState(ok ? 'copied' : 'failed')
    let message = ok ? 'Copied to clipboard' : 'Copy failed'
    if (message === lastAnnouncementRef.current) {
      message += '\u00A0'
    }
    lastAnnouncementRef.current = message
    setStatusMessage('')
    requestAnimationFrame(() => setStatusMessage(message))
    timerRef.current = window.setTimeout(() => {
      setCopyState('idle')
      setStatusMessage('')
      timerRef.current = null
    }, 2000)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setCopyState('idle')
      setStatusMessage('')
      onClose()
    }
  }

  return (
    <Dialog open={open && Boolean(item)} onOpenChange={handleOpenChange}>
      <DialogContent className="border-zinc-200/90 bg-white/85 p-0 shadow-[0_16px_48px_rgba(0,0,0,0.12)] backdrop-blur-xl sm:max-w-2xl">
        {item && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="flex max-h-[85vh] flex-col"
          >
            <DialogHeader className="border-b border-zinc-200 px-6 py-4 text-left">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Badge
                  variant="outline"
                  className={`rounded-md font-mono text-[11px] font-medium tabular-nums ${scoreBadgeClass(score)}`}
                >
                  {score} signal
                </Badge>
                <span className="truncate">{item.feedTitle}</span>
              </div>
              <DialogTitle className="mt-1.5 text-base font-semibold tracking-tight text-zinc-950">
                Kiro task spec preview
              </DialogTitle>
              <DialogDescription className="text-[13px] text-zinc-500">
                Review the generated Markdown spec below, then copy it into a
                Kiro spec file.
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[55vh] px-6 py-4">
              <pre className="overflow-x-auto rounded-md border border-zinc-200 bg-zinc-50 p-4 font-mono text-xs leading-relaxed text-zinc-800">
                <code id="kiro-task-spec" className="whitespace-pre-wrap">
                  {markdown}
                </code>
              </pre>
            </ScrollArea>

            <DialogFooter className="items-center justify-between border-t border-zinc-200 px-6 py-3.5 sm:justify-between">
              <span
                role="status"
                aria-live="polite"
                className={`text-xs font-medium transition-opacity ${
                  statusMessage
                    ? copyState === 'failed'
                      ? 'text-red-600 opacity-100'
                      : 'text-zinc-900 opacity-100'
                    : 'opacity-0'
                }`}
              >
                {statusMessage}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenChange(false)}
                  className="h-8 border-zinc-200 text-xs shadow-none"
                >
                  Close
                </Button>
                <Button
                  type="button"
                  size="sm"
                  autoFocus
                  onClick={() => void handleCopy()}
                  className="h-8 gap-1.5 text-xs"
                >
                  {copyState === 'copied' ? (
                    <>
                      <Check aria-hidden="true" className="size-3.5" />
                      Copied Markdown
                    </>
                  ) : copyState === 'failed' ? (
                    <>
                      <Copy aria-hidden="true" className="size-3.5" />
                      Retry copy
                    </>
                  ) : (
                    <>
                      <Copy aria-hidden="true" className="size-3.5" />
                      Copy Markdown
                    </>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  )
}
