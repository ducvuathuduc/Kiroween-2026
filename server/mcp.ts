import {
  McpServer,
  createMcpHandler,
  type CallToolResult,
} from '@modelcontextprotocol/server'
import { z } from 'zod'
import {
  createMemoryNewsletterStore,
  type NewsletterStore,
} from '../src/lib/newsletter.ts'
import type { LiveAiEnv } from './liveAi.ts'
import {
  dailyBriefing,
  getSignalScores,
  listNewsletters,
  resurfacePastRead,
  searchItems,
} from './readTools.ts'

const AUTHLESS_DEMO_SCOPE =
  'Authless read-only demo scope (no OAuth 2.1; reads public default feeds and Worker read-only state without mutations).'

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

const FEED_ID_SCHEMA = z.enum(['aws-news', 'aws-ml', 'hn'])
const ITEM_ID_SCHEMA = z.string().trim().min(1).max(4096)
const QUERY_SCHEMA = z.string().trim().min(1).max(500)
const PAST_READ_SCHEMA = z
  .object({
    id: ITEM_ID_SCHEMA,
    feedId: z.string().trim().min(1).max(128).optional(),
    feedTitle: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(500),
    link: z.string().trim().max(2048).optional(),
    description: z.string().max(5000).default(''),
    pubDate: z.string().trim().max(64).optional(),
    score: z.number().min(0).max(100).optional(),
    readAt: z.string().trim().max(64).optional(),
    savedAt: z.string().trim().max(64).optional(),
  })
  .strict()

async function toolResult(
  run: () => unknown | Promise<unknown>,
): Promise<CallToolResult> {
  try {
    return {
      content: [{ type: 'text', text: JSON.stringify(await run()) }],
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: error instanceof Error ? error.message : 'Tool failed.',
        },
      ],
    }
  }
}

export interface CreateReaderMcpOptions {
  newsletterStore?: NewsletterStore
  getEnv?: (request?: Request) => LiveAiEnv | undefined
}

export function createReaderMcpServer(
  options: CreateReaderMcpOptions = {},
  request?: Request,
): McpServer {
  const store = options.newsletterStore ?? createMemoryNewsletterStore()
  const server = new McpServer({
    name: 'resurrected-reader',
    version: '0.1.0',
  })

  server.registerTool(
    'get_daily_briefing',
    {
      title: 'Get Daily Briefing',
      description: `${AUTHLESS_DEMO_SCOPE} Return the top deduplicated live public-feed items (default 5) ranked by deterministic 4D signal score without calling paid AI.`,
      inputSchema: z
        .object({
          limit: z.number().int().min(1).max(5).default(5),
        })
        .strict(),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    ({ limit }) => toolResult(() => dailyBriefing(limit)),
  )

  server.registerTool(
    'get_feed_items',
    {
      title: 'Get Feed Items',
      description: `${AUTHLESS_DEMO_SCOPE} List and filter live items from the three public default feeds (aws-news, aws-ml, hn) sorted by deterministic signal score.`,
      inputSchema: z
        .object({
          query: QUERY_SCHEMA.optional(),
          feedId: FEED_ID_SCHEMA.optional(),
          minScore: z.number().min(0).max(100).default(0),
          limit: z.number().int().min(1).max(50).default(20),
        })
        .strict(),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (args) => toolResult(() => searchItems(args)),
  )

  server.registerTool(
    'get_signal_scores',
    {
      title: 'Get Signal Scores',
      description: `${AUTHLESS_DEMO_SCOPE} Inspect deterministic 4D signal scores (Relevance 42%, Recency 24%, Authority 18%, Novelty 16%), score histogram, feed activity, or per-item scoring cues. Never uses AI.`,
      inputSchema: z
        .object({
          itemId: ITEM_ID_SCHEMA.optional(),
          feedId: FEED_ID_SCHEMA.optional(),
          limit: z.number().int().min(1).max(50).default(10),
        })
        .strict(),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (args) => toolResult(() => getSignalScores(args)),
  )

  server.registerTool(
    'resurface_past_read',
    {
      title: 'Resurface Past Read',
      description: `${AUTHLESS_DEMO_SCOPE} Match caller-supplied read/saved history (and Vectorize when bound) against a query or live feed story, with honest workers-ai-vectorize vs topic-overlap labeling and explicit why reasons.`,
      inputSchema: z
        .object({
          query: QUERY_SCHEMA.optional(),
          itemId: ITEM_ID_SCHEMA.optional(),
          pastReads: z.array(PAST_READ_SCHEMA).max(100).optional(),
          minAgeDays: z.number().int().min(0).max(3650).default(0),
          limit: z.number().int().min(1).max(10).default(5),
        })
        .strict(),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (args) =>
      toolResult(() =>
        resurfacePastRead({
          ...args,
          env: options.getEnv?.(request),
        }),
      ),
  )

  server.registerTool(
    'list_newsletters',
    {
      title: 'List Newsletters',
      description: `${AUTHLESS_DEMO_SCOPE} List newsletter bridge feeds registered on this Worker instance and optionally preview recent entries without mutating state.`,
      inputSchema: z
        .object({
          feedId: z.string().trim().min(1).max(64).optional(),
          includeEntries: z.boolean().default(false),
          entryLimit: z.number().int().min(1).max(20).default(5),
        })
        .strict(),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (args) => toolResult(() => listNewsletters(store, args)),
  )

  return server
}

export function createReaderMcpHandler(options: CreateReaderMcpOptions = {}) {
  return createMcpHandler((ctx) =>
    createReaderMcpServer(options, ctx.requestInfo),
  )
}

export const mcpHandler = createReaderMcpHandler()

// Stateless Worker fetch export using SDK v2 createMcpHandler (MCP 2026-07-28 + 2025 stateless compat).
export default {
  fetch(request: Request): Promise<Response> {
    return mcpHandler.fetch(request)
  },
}
