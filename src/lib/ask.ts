import { z } from 'zod'

export const ASK_ABSTENTION = "Not in today's feeds."
export const ASK_SCOPE = 'Today (UTC) · default public feeds' as const
// Uncalibrated engineering default, not a measured relevance guarantee.
export const MIN_ASK_SIMILARITY = 0.28

// Statements are plain prose. Links/references are built by the server, never
// accepted from model text. Deliberately conservative: URL-like prose fails closed.
const statementText = z.string().trim().min(1).max(800).refine((text) =>
  ![...text].some((char) => '<>[]\\'.includes(char) || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
  !/\p{Cf}/u.test(text) &&
  !/(?:[\p{L}\d+.-]+:|www\.|[\p{L}\d-]+(?:\.[\p{L}\d-]+)+|(?:^|\s)\/\/?\S)/iu.test(text.normalize('NFKC')),
  'Statements must be plain prose without URLs, markup or inline references.',
)
export const askStatementSchema = z.object({
  text: statementText,
  citations: z.array(z.number().int().min(1).max(5)).min(1).max(5),
}).strict()
export const askGeneratedAnswerSchema = z.object({
  statements: z.array(askStatementSchema).min(1).max(6),
}).strict()
const sourceSchema = z.object({
  label: z.number().int().min(1).max(5),
  id: z.string().min(1).max(4096),
  title: z.string().min(1).max(1000),
  link: z.string().max(8192).refine((link) => {
    try {
      const url = new URL(link)
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
    } catch { return false }
  }),
}).strict()
const providerSchema = z.enum(['gemini', 'openai', 'anthropic', 'bedrock']).nullable()
export const askEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('sources'), scope: z.literal(ASK_SCOPE), asOf: z.iso.datetime(),
    sources: z.array(sourceSchema).max(5),
    warnings: z.array(z.object({ feedId: z.string(), error: z.string() }).strict()).max(100),
  }).strict(),
  z.object({ type: z.literal('answer'), answer: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('answer'), statements: z.array(askStatementSchema).min(1).max(6) }).strict(),
    z.object({ kind: z.literal('abstention'), text: z.literal(ASK_ABSTENTION) }).strict(),
  ]) }).strict(),
  z.object({ type: z.literal('done'), provider: providerSchema, retrievalProvider: providerSchema }).strict(),
])
export type AskSource = z.infer<typeof sourceSchema>
export type AskStatement = z.infer<typeof askStatementSchema>
export type AskEvent = z.infer<typeof askEventSchema>
export interface AskResult {
  context: Extract<AskEvent, { type: 'sources' }>
  answer: Extract<AskEvent, { type: 'answer' }>['answer']
  completion: Extract<AskEvent, { type: 'done' }>
}

/** Read buffered NDJSON frames; never treat a truncated/error stream as success. */
export async function readAskResponse(response: Response, onEvent?: (event: AskEvent) => void): Promise<AskResult> {
  if (!response.ok) {
    // Only fixed local errors are presented; never show arbitrary upstream HTML.
    if (response.status === 400) throw new Error('Enter a question of 1–500 characters.')
    if (response.status === 408) throw new Error('Ask was cancelled or timed out. Retry later.')
    if (response.status === 503) throw new Error('Ask retrieval or an AI provider is unavailable. Check server provider configuration and retry.')
    throw new Error('Ask could not complete. Retry later.')
  }
  if (!response.headers.get('content-type')?.includes('application/x-ndjson') || !response.body) {
    throw new Error('Invalid Ask response.')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const events: AskEvent[] = []
  let buffer = ''
  let bytes = 0
  const readLines = () => {
    let newline: number
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (!line.trim() || events.length >= 3) throw new Error('Invalid Ask stream framing.')
      const event = askEventSchema.parse(JSON.parse(line))
      if (event.type !== ['sources', 'answer', 'done'][events.length]) throw new Error('Invalid Ask event order.')
      if (event.type === 'sources' && event.sources.some((source, index) => source.label !== index + 1)) throw new Error('Invalid Ask source labels.')
      if (event.type === 'answer') {
        const context = events[0]
        if (!context || context.type !== 'sources') throw new Error('Missing Ask sources.')
        if (event.answer.kind === 'answer' && event.answer.statements.some((statement) => statement.citations.some((label) => !context.sources.some((source) => source.label === label)))) throw new Error('Invalid Ask citations.')
        if (event.answer.kind === 'abstention' && context.sources.length) throw new Error('Invalid Ask abstention.')
      }
      events.push(event)
      if (event.type !== 'done') onEvent?.(event)
    }
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 128 * 1024) throw new Error('Ask response exceeds its size limit.')
      buffer += decoder.decode(value, { stream: true })
      readLines()
    }
    buffer += decoder.decode()
    readLines()
    if (buffer || events.length !== 3) throw new Error('Incomplete Ask response.')
    const [context, answerEvent, completion] = events
    if (context.type !== 'sources' || answerEvent.type !== 'answer' || completion.type !== 'done') throw new Error('Invalid Ask response.')
    if (context.sources.some((source, index) => source.label !== index + 1)) throw new Error('Invalid Ask source labels.')
    if (answerEvent.answer.kind === 'answer') {
      if (!completion.provider || !completion.retrievalProvider || answerEvent.answer.statements.some((statement) => statement.citations.some((label) => !context.sources.some((source) => source.label === label)))) {
        throw new Error('Invalid Ask citations or provider metadata.')
      }
    } else if (context.sources.length || completion.provider) throw new Error('Invalid Ask abstention.')
    onEvent?.(completion)
    return { context, answer: answerEvent.answer, completion }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
