import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import { motion } from 'motion/react'
import type { FeedItem } from '../lib/feeds'
import { scoreBadgeClass } from '../lib/format'
import {
  buildKiroSpecBundle,
  buildKiroTask,
  downloadKiroSpecZip,
  type GeminiSummary,
} from '../lib/kiroTask'
import MermaidDiagram from './MermaidDiagram'
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
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'

type SpecFileTab = 'tasks' | 'requirements' | 'design' | 'pipeline'

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
  geminiSummary?: GeminiSummary
  open: boolean
  onClose: () => void
}

export default function KiroTaskModal({
  item,
  geminiSummary,
  open,
  onClose,
}: KiroTaskModalProps) {
  const timerRef = useRef<number | null>(null)
  const lastAnnouncementRef = useRef('')
  const [activeTab, setActiveTab] = useState<SpecFileTab>('tasks')
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

  const bundle = item ? buildKiroSpecBundle(item, geminiSummary) : null
  const score = item?.score ?? 0

  const itemPipelineChart = useMemo(() => {
    if (!item || !bundle) return ''
    const safeFeed = item.feedTitle.replace(/["[\]]/g, '')
    const aiNode = geminiSummary
      ? 'E[Gemini TL;DR Embedded]'
      : 'E[Extractive Context]'
    return `flowchart LR
  A["${safeFeed}"] --> B["4D Score: ${score}/100"]
  B --> ${aiNode}
  ${aiNode.split('[')[0]} --> F[".kiro/specs/${bundle.slug}/"]
  F --> G["AWS Docs MCP in Kiro"]`
  }, [item, bundle, geminiSummary, score])

  const activeContent = (() => {
    if (!item || !bundle) return ''
    if (activeTab === 'requirements') return bundle.requirements
    if (activeTab === 'design') return bundle.design
    if (activeTab === 'pipeline') return itemPipelineChart
    return buildKiroTask(item)
  })()

  const specPath = bundle
    ? activeTab === 'pipeline'
      ? `.kiro/specs/${bundle.slug}/pipeline.mmd`
      : `.kiro/specs/${bundle.slug}/${activeTab}.md`
    : ''

  const announce = (msg: string) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
    }
    let next = msg
    if (next === lastAnnouncementRef.current) {
      next += '\u00A0'
    }
    lastAnnouncementRef.current = next
    setStatusMessage('')
    requestAnimationFrame(() => setStatusMessage(next))
    timerRef.current = window.setTimeout(() => {
      setCopyState('idle')
      setStatusMessage('')
      timerRef.current = null
    }, 2400)
  }

  const handleCopy = async () => {
    if (!activeContent) return
    const ok = await copyText(activeContent)
    setCopyState(ok ? 'copied' : 'failed')
    announce(ok ? 'Copied to clipboard' : 'Copy failed')
  }

  const handleDownloadZip = () => {
    if (!item) return
    const fileName = downloadKiroSpecZip(item, geminiSummary)
    setCopyState('idle')
    announce(`Downloaded ${fileName}`)
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
        {item && bundle && (
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
                Kiro spec export preview
              </DialogTitle>
              <DialogDescription className="text-[13px] text-zinc-500">
                Preview all 3 spec files and pipeline diagram, copy Markdown, or
                download a .zip ready for{' '}
                <code className="font-mono">.kiro/specs/</code>.
              </DialogDescription>
            </DialogHeader>

            <div className="border-b border-zinc-200 bg-zinc-50/70 px-6 py-2">
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as SpecFileTab)}
              >
                <TabsList className="grid h-8 w-full grid-cols-4 bg-zinc-200/60 p-0.5">
                  <TabsTrigger
                    value="tasks"
                    className="h-7 font-mono text-[11px] data-[state=active]:bg-white sm:text-xs"
                  >
                    tasks.md
                  </TabsTrigger>
                  <TabsTrigger
                    value="requirements"
                    className="h-7 font-mono text-[11px] data-[state=active]:bg-white sm:text-xs"
                  >
                    requirements.md
                  </TabsTrigger>
                  <TabsTrigger
                    value="design"
                    className="h-7 font-mono text-[11px] data-[state=active]:bg-white sm:text-xs"
                  >
                    design.md
                  </TabsTrigger>
                  <TabsTrigger
                    value="pipeline"
                    className="h-7 font-mono text-[11px] data-[state=active]:bg-white sm:text-xs"
                  >
                    pipeline
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <ScrollArea className="max-h-[50vh] px-6 py-4">
              {activeTab === 'pipeline' ? (
                <MermaidDiagram
                  chart={itemPipelineChart}
                  caption={`Spec generation path for ${bundle.slug}`}
                />
              ) : (
                <div className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
                  <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-3.5 py-2 font-mono text-[11px] text-zinc-500">
                    <span className="truncate">{specPath}</span>
                    <span className="shrink-0 text-zinc-400">Markdown</span>
                  </div>
                  <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-zinc-800">
                    <code id="kiro-task-spec" className="whitespace-pre-wrap">
                      {activeContent}
                    </code>
                  </pre>
                </div>
              )}
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
              <div className="flex flex-wrap items-center gap-2">
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
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadZip}
                  className="h-8 gap-1.5 border-zinc-200 text-xs shadow-none"
                >
                  <Download aria-hidden="true" className="size-3.5" />
                  Download .zip
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
                      Copied
                    </>
                  ) : copyState === 'failed' ? (
                    <>
                      <Copy aria-hidden="true" className="size-3.5" />
                      Retry copy
                    </>
                  ) : (
                    <>
                      <Copy aria-hidden="true" className="size-3.5" />
                      {activeTab === 'pipeline'
                        ? 'Copy Mermaid'
                        : 'Copy Markdown'}
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
