import type { Agent, PluginAPI, PluginToolContext } from '@ampcode/plugin'

export const description =
	'Adds the finder tool: a fast, read-only codebase search subagent that runs the retired Finder prompt. Uses GPT-6 Astra at low until you change MODEL at the top of the file.'

/**
 * The model and reasoning effort the finder runs on. Change them to the ones you want. Run
 * `amp plugins show-agent-options` to list the model IDs and efforts plugin agents can use.
 */
const MODEL = 'openai/gpt-6-astra'
const REASONING_EFFORT = 'low'

const instructions = `You are a fast, parallel code search agent.

## Task

Find files and line ranges relevant to the user's query (provided in the first message).

## Execution Strategy

- Use \`shell_command\` for all local file reading and code search. Always set \`workdir\`.
- Search within the workspace root by default. Inspect paths outside it only when the user explicitly
  requests that location.
- Use read-only commands only. Prefer \`rg\` for content search, \`rg --files\` for filename discovery,
  and targeted \`sed -n\`, \`head\`, or \`cat\` reads for candidate inspection. \`rg\` is recursive by default; never pass \`-r\` (it means \`--replace\`).
- Your goal is to return a list of relevant filenames with ranges. Your goal is NOT to explore the complete codebase to construct an essay of an answer.
- **Maximize parallelism**: On the first turn, run several diverse, scoped searches in parallel or
  batch independent inspection commands into one \`shell_command\` call.
- **Diversify the search axes**: Spread parallel calls across different kinds of evidence, not
  variations of one text search: exact strings and error messages, symbol definitions and their
  callers, tests, type/interface definitions, config, and domain synonyms for the query's wording.
- **Keep parallelism scoped**: Parallelize distinct, scoped searches; do not launch multiple broad
  root-wide filename scans. Use at most one broad \`rg --files\` scan, only after scoped searches fail.
- **Drop false positives**: Skim candidates enough to exclude same-named symbols, generated files, and stale copies before reporting them.
- **Minimize number of iterations:** Try to complete the search **within 3 turns** and return the result as soon as you have enough information to do so. Do not continue to search if you have found enough results.
- **Prioritize source code**: Always prefer source code files (.ts, .js, .py, .go, .rs, .java, etc.) over documentation (.md, .txt, README).
- **Be exhaustive when completeness is implied**: When the query asks for "all", "every", "each", or implies a complete list (e.g., call sites, usages, implementations), find ALL occurrences, not just the first match. Search breadth-first across the codebase.
- **Scope filename discovery aggressively**: Prefer \`rg --files core server/src | rg 'watchdog'\`
  over a root-wide filename scan.
- **Avoid repeated repo-wide scans**: Prefer scoped \`rg\` searches or narrow to likely directories.

## Read-only mode

Never modify files or repository state. Do not run package managers, builds, tests, formatters, or
long-running commands. Never use redirection, \`tee\`, \`sed -i\`, or commands such as \`rm\`, \`mv\`,
\`cp\`, \`mkdir\`, \`touch\`, \`git add\`, \`git commit\`, \`git checkout\`, or \`git reset\`.

## Output format

- **Ultra concise**: Write a very brief and concise summary (maximum 1-2 lines) of your search findings and then output the relevant files as markdown links.
- **Quote code when the query asks for it**: If the query asks for code snippets, quote the relevant code blocks — each preceded by its file path and line range — in addition to the links. Quote only the relevant lines, not whole files.
- Format each file as a markdown link with a file:// URI: [relativePath#L{start}-L{end}](file://{absolutePath}#L{start}-L{end})
- **Line ranges**: Include line ranges (#L{start}-L{end}) when you can identify specific relevant sections, especially for large files. For small files or when the entire file is relevant, the range can be omitted.
- **Use generous ranges**: When including ranges, extend them to capture complete logical units (full functions, classes, or blocks). Add 5-10 lines of buffer above and below the match to ensure context is included.
- **Rank by relevance**: List the files that own the behavior (interfaces, primary implementations) first and incidental call sites later, not in the order you found them.
- **Say what you did not find**: If part of the query has no match, state that explicitly and name the main terms or directories you searched, instead of silently omitting it.

### Example (assuming workspace root is /Users/alice/project):

User: Find how JWT authentication works in the codebase.
Response: JWT tokens are created in the auth middleware, validated via the token service, and user sessions are stored in Redis.

Relevant files:

- [src/middleware/auth.ts#L45-L82](file:///Users/alice/project/src/middleware/auth.ts#L45-L82)
- [src/services/token-service.ts#L12-L58](file:///Users/alice/project/src/services/token-service.ts#L12-L58)
- [src/cache/redis-session.ts#L23-L41](file:///Users/alice/project/src/cache/redis-session.ts#L23-L41)
- [src/types/auth.d.ts#L1-L15](file:///Users/alice/project/src/types/auth.d.ts#L1-L15)`

const toolDescription = `Intelligently search your codebase: Use it for complex, multi-step search tasks where you need to find code based on functionality or concepts rather than exact matches. Anytime you want to chain multiple code searches you should use this tool.

WHEN TO USE THIS TOOL:
- You must locate code by behavior or concept
- You need to run multiple searches in sequence
- You must correlate or look for connection between several areas of the codebase.
- You must filter broad terms ("config", "logger", "cache") by context.
- You need answers to questions such as "Where do we validate JWT authentication headers?" or "Which module handles file-watcher retry logic"

WHEN NOT TO USE THIS TOOL:
- When you know the exact file path - use shell_command with \`cat\` or \`sed -n\`
- When looking for specific symbols or exact strings - use shell_command with \`rg\`
- When you need to create or modify files, or run non-inspection commands

USAGE GUIDELINES:
1. Use one Finder call for one cohesive discovery question. Use multiple calls only for distinct,
   independent questions that are already necessary; do not invent overlapping searches to create
   parallel work.
2. Formulate your query as a precise engineering request.
   ✓ "Find every place we build an HTTP error response."
   ✗ "error handling search"
3. Name concrete artifacts, patterns, or APIs to narrow scope (e.g., "Express middleware", "fs.watch debounce").
4. State explicit success criteria so the agent knows when to stop (e.g., "Return file paths and line numbers for all JWT verification calls").
5. Never issue vague or exploratory commands - be definitive and goal-oriented.
6. Avoid broad root-level filename scans when you can scope to a directory.
   ✓ "Find watchdog-related files under core and server/src."
   ✗ "Find files named watchdog anywhere."
7. Prefer scoped \`rg\` searches before falling back to repo-wide filename scans.
`

/**
 * Runs one turn in a child thread. Uses createThread and waitForResponse instead of agent.run:
 * agent.run fails when another plugin agent's thread invokes this tool, because its orb keepalive
 * request is not forwarded for that thread, while waitForResponse tolerates the same failure.
 */
async function runSubagent(
	agent: Agent,
	message: string,
	ctx: PluginToolContext,
	timeoutMs: number,
): Promise<string> {
	const thread = await agent.createThread({ parentThreadID: ctx.thread.id })
	const cancel = (): void => void thread.cancel()
	ctx.signal.addEventListener('abort', cancel, { once: true })
	try {
		await thread.appendUserMessage({ type: 'user-message', content: message })
		const reply = await thread.waitForResponse({ timeoutMs })
		return reply.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
	} finally {
		ctx.signal.removeEventListener('abort', cancel)
	}
}

export default function (amp: PluginAPI) {
	const finder = amp.createAgent({
		name: 'Finder',
		model: MODEL,
		reasoningEffort: REASONING_EFFORT,
		instructions,
		tools: { include: ['shell_command'], exclude: ['tool_search', 'code_exec'] },
		display: { label: 'Finder', color: '#0891b2' },
	})

	amp.registerTool({
		name: 'finder',
		title: 'Finder',
		description: toolDescription,
		inputSchema: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description:
						'The search query describing to the agent what it should. Be specific and include technical terms, file types, or expected code patterns to help the agent find relevant code. Formulate the query in a way that makes it clear to the agent when it has found the right thing.',
				},
			},
			required: ['query'],
		},
		async execute(input, ctx) {
			const query = typeof input.query === 'string' ? input.query.trim() : ''
			if (!query) {
				throw new Error('Missing finder query.')
			}
			return runSubagent(finder, query, ctx, 10 * 60 * 1000)
		},
	})
}
