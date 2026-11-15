import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { dailyBriefing, exportKiroTask, searchItems } from './readTools.ts'

// Published 0.3.0 wire, deliberately pinned for the requested message/send API.
// Current A2A 1.0 uses different method names/shapes; this is a stateless subset.
const command = z.discriminatedUnion('skill', [
  z.object({ skill: z.literal('get_top_items'), limit: z.number().int().min(1).max(50).default(20), minScore: z.number().min(0).max(100).default(0) }).strict(),
  z.object({ skill: z.literal('get_briefing') }).strict(),
  z.object({ skill: z.literal('export_kiro_task'), id: z.string().trim().min(1).max(4096) }).strict(),
])
const paramsSchema = z.object({
  message: z.object({
    kind: z.literal('message'),
    role: z.literal('user'),
    messageId: z.string().trim().min(1).max(4096),
    parts: z.tuple([z.object({ kind: z.literal('data'), data: command, metadata: z.record(z.string(), z.unknown()).optional() }).strict()]),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }).strict(),
  configuration: z.object({
    acceptedOutputModes: z.array(z.string()).refine((modes) => modes.includes('application/json')).optional(),
    blocking: z.boolean().optional(),
    historyLength: z.literal(0).optional(),
  }).strict().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict()
const envelopeSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number().int()]),
  method: z.string(),
  params: z.unknown().optional(),
}).strict()

function rpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

export function agentCard(origin: string) {
  return {
    protocolVersion: '0.3.0',
    name: 'Resurrected Reader',
    description: 'Public read-only default-feed radar. Stateless A2A 0.3.0 message/send subset; synchronous terminal tasks only. No AI summaries, persisted tasks, polling, cancellation, or multi-turn history.',
    url: new URL('/a2a/tasks', origin).href,
    preferredTransport: 'JSONRPC',
    version: '0.1.0',
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    security: [],
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    skills: [
      { id: 'get_top_items', name: 'Top items', description: 'Same live-data function as MCP get_feed_items, with no query. DataPart: {skill:"get_top_items",limit?:1..50,minScore?:0..100}.', tags: ['rss', 'deterministic-scoring'] },
      { id: 'get_briefing', name: 'Daily briefing', description: 'Same top-five selector as the UI and MCP get_daily_briefing. DataPart: {skill:"get_briefing"}. Does not generate paid AI summaries.', tags: ['rss', 'briefing'] },
      { id: 'export_kiro_task', name: 'Kiro task export', description: 'Same Markdown spec builder as the UI Kiro task modal. DataPart: {skill:"export_kiro_task",id:"<current live item ID>"}.', tags: ['kiro', 'markdown'] },
    ],
  }
}

type State = 'submitted' | 'working' | 'completed' | 'failed'
interface Status { state: State; timestamp: string; message?: {
  kind: 'message'; role: 'agent'; messageId: string; taskId: string; contextId: string;
  parts: { kind: 'text'; text: string }[]
} }

export const a2aApp = new Hono()
a2aApp.get('/.well-known/agent-card.json', (c) => {
  const url = new URL(c.req.url)
  // TLS-terminating local portals may forward HTTP internally. Only upgrade
  // the scheme; never trust a forwarded host or downgrade an HTTPS request.
  if (c.req.header('x-forwarded-proto') === 'https') url.protocol = 'https:'
  return c.json(agentCard(url.origin))
})
a2aApp.post('/a2a/tasks', bodyLimit({
  maxSize: 192 * 1024,
  onError: (c) => c.json(rpcError(null, -32600, 'Request exceeds the 192 KiB limit.'), 413),
}), async (c) => {
  if (!/^application\/json(?:;|$)/i.test(c.req.header('content-type') ?? '')) {
    return c.json(rpcError(null, -32600, 'Content-Type must be application/json.'), 415)
  }
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json(rpcError(null, -32700, 'Parse error.'))
  }
  const envelope = envelopeSchema.safeParse(body)
  if (!envelope.success) return c.json(rpcError(null, -32600, 'Invalid JSON-RPC request. A request ID is required; batches and notifications are unsupported.'))
  const { id, method, params } = envelope.data
  if (method !== 'message/send') return c.json(rpcError(id, -32601, 'Method not found. This stateless stub supports only message/send.'))
  const parsed = paramsSchema.safeParse(params)
  if (!parsed.success) return c.json(rpcError(id, -32602, 'Invalid params. Send a new user Message with one DataPart containing a supported skill and its arguments. No task/context continuation, push config, or history is supported.'))

  const taskId = crypto.randomUUID()
  const contextId = crypto.randomUUID()
  let status: Status = { state: 'submitted', timestamp: new Date().toISOString() }
  const transitions: { state: State; timestamp: string }[] = [{ ...status }]
  const transition = (state: State) => {
    status = { state, timestamp: new Date().toISOString() }
    transitions.push({ ...status })
  }
  const base = { kind: 'task', id: taskId, contextId }
  transition('working')
  try {
    const args = parsed.data.message.parts[0].data
    const data = args.skill === 'get_briefing' ? await dailyBriefing()
      : args.skill === 'export_kiro_task' ? await exportKiroTask(args.id)
        : await searchItems(args)
    transition('completed')
    return c.json({ jsonrpc: '2.0', id, result: {
      ...base, status,
      artifacts: [{ artifactId: crypto.randomUUID(), name: `${args.skill}.json`, parts: [{ kind: 'data', data }] }],
      metadata: { transitions },
    } })
  } catch (error) {
    transition('failed')
    status.message = {
      kind: 'message', role: 'agent', messageId: crypto.randomUUID(), taskId, contextId,
      parts: [{ kind: 'text', text: error instanceof Error ? error.message : 'Live read task failed. Retry later.' }],
    }
    return c.json({ jsonrpc: '2.0', id, result: { ...base, status, metadata: { transitions } } })
  }
})
a2aApp.all('/a2a', (c) => c.json({ error: 'A2A endpoint not found.' }, 404))
a2aApp.all('/a2a/*', (c) => c.json({ error: 'A2A endpoint not found.' }, 404))
