import { z } from 'zod'
import { ASK_ABSTENTION, ASK_SCOPE, askEventSchema, type AskResult } from '../src/lib/ask.ts'
import { answerWithFallback, NoProvidersConfiguredError, semanticScoreWithFallback } from './ai.ts'
import { loadItems } from './items.ts'
import { buildAskSources, selectAskSources, selectTodayItems, validateAskAnswer } from './askPolicy.ts'

export const askRequestSchema = z.object({
  question: z.string().trim().min(1).max(500),
  provider: z.enum(['gemini', 'openai', 'anthropic', 'bedrock']).default('gemini'),
}).strict()
export class AskUnavailableError extends Error {}
export class AskFeedsError extends Error {}

// Dependencies permit deterministic boundary tests; production always uses the
// real shared functions below. Test fixtures exist only in tests/ask.test.ts.
export async function runAsk(
  input: z.infer<typeof askRequestSchema>, now: Date, signal: AbortSignal,
  dependencies = { load: loadItems, score: semanticScoreWithFallback, answer: answerWithFallback },
): Promise<AskResult> {
  signal.throwIfAborted()
  let loaded: Awaited<ReturnType<typeof loadItems>>
  try { loaded = await dependencies.load() } catch {
    signal.throwIfAborted()
    throw new AskFeedsError('Live feeds are unavailable. Retry later.')
  }
  signal.throwIfAborted()
  const candidates = selectTodayItems(loaded.items, now)
  // Do not expose upstream exception text; warnings retain source attribution.
  const context: AskResult['context'] = {
    type: 'sources', scope: ASK_SCOPE, asOf: now.toISOString(), sources: [],
    warnings: loaded.errors.map(({ feedId }) => ({ feedId, error: 'Feed unavailable; this answer may not cover it.' })),
  }
  const abstain = (retrievalProvider: AskResult['completion']['retrievalProvider']): AskResult => ({
    context, answer: { kind: 'abstention', text: ASK_ABSTENTION },
    completion: { type: 'done', provider: null, retrievalProvider },
  })
  if (candidates.length === 0) return abstain(null)
  let retrieval: Awaited<ReturnType<typeof semanticScoreWithFallback>>
  try {
    retrieval = await dependencies.score({
      query: input.question,
      documents: candidates.map((item) => ({ id: item.id, text: `${item.title} ${item.description}` })),
      preferredProvider: input.provider, abortSignal: signal,
    })
  } catch {
    signal.throwIfAborted()
    throw new AskUnavailableError('Ask embeddings are unavailable. Check server provider configuration and retry.')
  }
  signal.throwIfAborted()
  if (!retrieval.available || !retrieval.provider) throw new AskUnavailableError('Ask embeddings are unavailable. Check server provider configuration and retry.')
  let selected: ReturnType<typeof selectAskSources>
  try { selected = selectAskSources(candidates, retrieval.scores) } catch {
    throw new AskUnavailableError('Ask retrieval did not score every eligible candidate. Retry later.')
  }
  if (!selected.length) return abstain(retrieval.provider)
  context.sources = buildAskSources(selected)
  const generated = await dependencies.answer({ question: input.question, items: selected, preferredProvider: input.provider, abortSignal: signal })
  signal.throwIfAborted()
  // Revalidate at the protocol boundary as well as inside each provider attempt.
  const statements = validateAskAnswer(JSON.stringify({ statements: generated.statements }), context.sources)
  return { context, answer: { kind: 'answer', statements }, completion: { type: 'done', provider: generated.provider, retrievalProvider: retrieval.provider } }
}

export function askStreamResponse(result: AskResult): Response {
  const encoder = new TextEncoder()
  // No output until generation and every citation have passed validation.
  const frames = [result.context, { type: 'answer', answer: result.answer }, result.completion]
    .map((event) => encoder.encode(`${JSON.stringify(askEventSchema.parse(event))}\n`))
  let index = 0
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index === frames.length) controller.close()
      else controller.enqueue(frames[index++])
    },
  }), { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}

export async function askResponse(body: unknown, signal: AbortSignal): Promise<Response> {
  const input = askRequestSchema.safeParse(body)
  if (!input.success) return Response.json({ error: 'A question of 1–500 characters and a supported provider are required.' }, { status: 400 })
  const now = new Date()
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(60_000)])
  try {
    return askStreamResponse(await runAsk(input.data, now, boundedSignal))
  } catch (error) {
    if (boundedSignal.aborted) return Response.json({ error: 'Ask was cancelled or timed out.' }, { status: 408 })
    if (error instanceof AskUnavailableError || error instanceof NoProvidersConfiguredError) {
      return Response.json({ error: 'Ask retrieval or an AI provider is unavailable. Check server provider configuration and retry.' }, { status: 503 })
    }
    return Response.json({ error: error instanceof AskFeedsError ? error.message : 'Ask generation could not produce a validated cited answer. Retry later.' }, { status: 502 })
  }
}
