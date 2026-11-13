import { useEffect, useRef, useState } from 'react'
import { ASK_SCOPE, readAskResponse, type AskResult } from '../lib/ask'
import type { AIProviderId } from '../lib/providers'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

interface AskPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialQuestion?: string
  provider?: AIProviderId
}

/** Ephemeral panel; App/TopBar integration waits for their owner's release. */
export default function AskPanel({ open, onOpenChange, initialQuestion = '', provider = 'gemini' }: AskPanelProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <AskPanelBody key={initialQuestion} initialQuestion={initialQuestion} provider={provider} />
      </DialogContent>
    </Dialog>
  )
}

function AskPanelBody({ initialQuestion, provider }: { initialQuestion: string; provider: AIProviderId }) {
  const [question, setQuestion] = useState(initialQuestion)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<AskResult | null>(null)
  const [status, setStatus] = useState('')
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => {
    active.current?.abort()
    active.current = null
  }, [])

  const stop = () => {
    active.current?.abort()
    active.current = null
    setPending(false)
    setStatus('Ask stopped. No incomplete answer is shown.')
  }
  const submit = async () => {
    if (active.current || !question.trim() || question.trim().length > 500) return
    const controller = new AbortController()
    active.current = controller
    setPending(true)
    setResult(null)
    setStatus('Retrieving today’s feeds and validating a cited answer…')
    try {
      const response = await fetch('/api/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), provider }),
        signal: controller.signal,
      })
      const answer = await readAskResponse(response)
      if (active.current !== controller) return
      setResult(answer)
      setStatus(answer.answer.kind === 'abstention' ? 'No matching answer in today’s feeds.' : 'Cited answer ready.')
    } catch (error) {
      if (active.current !== controller) return
      setStatus(controller.signal.aborted ? 'Ask stopped.' : error instanceof Error ? error.message : 'Ask could not complete. Retry later.')
    } finally {
      if (active.current === controller) {
        active.current = null
        setPending(false)
      }
    }
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle>Ask today’s feeds</DialogTitle>
          <DialogDescription>{ASK_SCOPE}. Only articles published since UTC midnight through the request time. Not your browser-local subscriptions.</DialogDescription>
        </DialogHeader>
        <form action="/api/ask" method="post" aria-label="Ask today’s feeds" className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit() }}>
          <label htmlFor="ask-question" className="block text-sm font-medium">Question (required, up to 500 characters)</label>
          <textarea id="ask-question" name="question" required maxLength={500} rows={3} value={question} disabled={pending} onChange={(event) => setQuestion(event.target.value)} aria-describedby="ask-help" className="w-full rounded-md border border-zinc-300 p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2" />
          <p id="ask-help" className="text-xs leading-relaxed text-zinc-500">Explicit submission may incur configured provider charges. The complete answer is validated before delivery; this is not live model-token streaming.</p>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || !question.trim()}>Ask feeds</Button>
            {pending && <Button type="button" variant="outline" onClick={stop}>Stop</Button>}
          </div>
        </form>
        <p role="status" aria-live="polite" className="text-sm text-zinc-600">{status}</p>
        {result && <section aria-label="Ask answer" className="space-y-4 border-t border-zinc-200 pt-4">
          {result.answer.kind === 'abstention' ? <p>{result.answer.text}</p> : <>
            <h3 className="text-sm font-semibold">Cited answer</h3>
            {result.answer.statements.map((statement, index) => <p key={index} className="text-sm leading-relaxed">
              {statement.text}{' '}
              {statement.citations.map((label) => {
                const source = result.context.sources.find((entry) => entry.label === label)!
                return <a key={label} href={source.link} target="_blank" rel="noopener noreferrer" className="mr-1 underline" aria-label={`Source ${label}: ${source.title}`}>[{label}]</a>
              })}
            </p>)}
            <ol className="space-y-2 text-xs text-zinc-600" aria-label="Sources">
              {result.context.sources.map((source) => <li key={source.label}>[{source.label}] <a href={source.link} target="_blank" rel="noopener noreferrer" className="underline">{source.title}</a></li>)}
            </ol>
          </>}
          {result.context.warnings.length > 0 && <p className="text-xs text-zinc-600">Some feeds were unavailable: {result.context.warnings.map((warning) => warning.feedId).join(', ')}. Coverage is incomplete.</p>}
          <p className="text-xs text-zinc-500">As of {result.context.asOf}. Similarity threshold 0.28 is an uncalibrated engineering default. Citations reference retrieved excerpts; verify important claims in the originals.</p>
        </section>}
    </>
  )
}
