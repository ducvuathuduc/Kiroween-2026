import { McpServer, type CallToolResult } from '@modelcontextprotocol/server'
import { createMcpHandler } from 'agents/mcp/server'
import { z } from 'zod'
import { DEFAULT_FEEDS } from '../src/lib/feeds.ts'
import { rankItemsByCosine } from '../src/lib/providers.ts'
import { getProvidersStatus, semanticScoreWithFallback, summarizeWithFallback } from './ai.ts'
import { getItem, loadItems } from './items.ts'
import { dailyBriefing, exportKiroTask, searchItems } from './readTools.ts'

const itemId = z.string().trim().min(1).max(4096)
const provider = z.enum(['gemini', 'openai', 'anthropic', 'bedrock']).default('gemini')
const query = z.string().trim().min(1).max(500)
const limit = z.number().int().min(1).max(50).default(20)

async function result(run: () => unknown | Promise<unknown>): Promise<CallToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await run()) }] }
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: error instanceof Error ? error.message : 'Tool failed.' }],
    }
  }
}

export function createReaderMcpServer(): McpServer {
  const server = new McpServer({ name: 'resurrected-reader', version: '0.1.0' })

  server.registerTool('list_feeds', {
    description: 'List the public default feed catalog. Browser-local subscriptions are not shared with MCP.',
    inputSchema: z.object({}),
  }, () => result(() => ({ feeds: DEFAULT_FEEDS })))

  server.registerTool('search_items', {
    description: 'Search current live feed titles and descriptions, sorted by deterministic signal score. Returns item IDs for the item tools and any feed errors.',
    inputSchema: z.object({ query: query.optional(), limit, minScore: z.number().min(0).max(100).default(0) }),
  }, (args) => result(() => searchItems(args)))

  server.registerTool('get_item', {
    description: 'Get a current live item by an ID returned by search_items, semantic_search, or daily_briefing.',
    inputSchema: z.object({ id: itemId }),
  }, ({ id }) => result(() => getItem(id)))

  server.registerTool('summarize_item', {
    description: 'Generate a summary of a live item through configured AI providers. May incur provider charges; returns an error when no provider is configured.',
    inputSchema: z.object({ id: itemId, provider }),
  }, ({ id, provider: preferredProvider }) => result(async () => {
    const item = await getItem(id)
    return summarizeWithFallback({ ...item, content: item.description.slice(0, 5000), preferredProvider })
  }))

  server.registerTool('semantic_search', {
    description: 'Search up to 60 live items using configured embeddings (may incur provider charges). Reports whether embeddings were available; otherwise returns keyword matches.',
    inputSchema: z.object({ query, limit, provider }),
  }, ({ query: text, limit: count, provider: preferredProvider }) => result(async () => {
    const { items, errors } = await loadItems()
    const candidates = items.slice(0, 60)
    const semantic = await semanticScoreWithFallback({
      query: text,
      documents: candidates.map((item) => ({ id: item.id, text: `${item.title} ${item.description}` })),
      preferredProvider,
    })
    const matches = (item: (typeof items)[number]) => `${item.title} ${item.description}`.toLowerCase().includes(text.toLowerCase())
    const ranked = semantic.available ? rankItemsByCosine(candidates, semantic.scores, matches) : candidates.filter(matches)
    return { ...semantic, items: ranked.slice(0, count), errors }
  }))

  server.registerTool('get_providers', {
    description: 'Report configured AI provider availability and model names without exposing credentials.',
    inputSchema: z.object({}),
  }, () => result(() => ({ defaultProvider: 'gemini', providers: getProvidersStatus() })))

  server.registerTool('daily_briefing', {
    description: 'Return the top five deduplicated live items by deterministic signal score. Does not generate AI summaries; use summarize_item for those.',
    inputSchema: z.object({}),
  }, () => result(dailyBriefing))

  server.registerTool('export_kiro_task', {
    description: 'Generate requirements.md, design.md, and tasks.md from a live item using the same Kiro spec builder as the reader. Returns Markdown without writing files.',
    inputSchema: z.object({ id: itemId }),
  }, ({ id }) => result(() => exportKiroTask(id)))

  return server
}

export const mcpHandler = createMcpHandler(createReaderMcpServer, { route: '/mcp', responseMode: 'json' })

// A Worker object export, not a function/WorkerEntrypoint or a stdio transport.
export default {
  fetch(request: Request): Promise<Response> {
    return mcpHandler.fetch(request)
  },
}
