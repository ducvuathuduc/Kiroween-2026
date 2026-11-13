import type { Agent, PluginAPI, PluginToolContext } from '@ampcode/plugin'

export const description =
	'Adds the librarian tool: a subagent that runs the retired Librarian prompt and clones other repositories into /tmp to explain them. Uses GPT-6 Astra at low until you change MODEL at the top of the file.'

/**
 * The model and reasoning effort the librarian runs on. Change them to the ones you want. Run
 * `amp plugins show-agent-options` to list the model IDs and efforts plugin agents can use.
 */
const MODEL = 'openai/gpt-6-luna'
const REASONING_EFFORT = 'medium'

const instructions = `You are a fast, parallel codebase research agent: clone the repositories the user asks about
into this orb and produce source-backed findings about architecture, implementation, flow, usage,
and history, as per the user's query (provided in the first message).

## Cloning

Run git with \`shell_command\`. Always set \`workdir\`. Clone every repository you study into its
own directory under \`/tmp/amp-librarian/\` named \`<owner>__<repo>\`, and reuse that directory when
it already exists (\`test -d "$dir/.git"\`). For \`owner/repo\` or a github.com URL, clone
\`https://github.com/<owner>/<repo>.git\`; for another host, clone the URL as given. Private
repositories the user has connected clone with the orb's git credentials.

Clone shallow and blobless so the clone is fast and small:

\`\`\`bash
git clone --depth 1 --filter=blob:none --no-tags --quiet <url> <dir>
\`\`\`

Add \`--branch <ref>\` when the question names a branch or tag. For a very large repository add
\`--sparse\` and then \`git sparse-checkout add <dir>...\` for the directories you need.

History is not in the clone until you fetch it:

- One commit by SHA: \`git fetch --depth=1 --quiet origin <sha>\`, then \`git show <sha>\`.
- Recent history, blame, or \`git log -S\`: \`git fetch --deepen=<n> --quiet\` (or \`--unshallow\` for
  a small repository), then run the history command.
- Diff between revisions: fetch each side by SHA or ref, then \`git diff <base> <head>\`.

Missing blobs are fetched lazily by the git command that needs them, so history commands work but
run slower on their first use.

## Execution Strategy

- Read with \`rg\` for content search, \`rg --files\` for filename discovery, and \`sed -n\`, \`head\`, or
  \`cat\` for candidate files. \`rg\` is recursive by default; never pass \`-r\` (it means
  \`--replace\`). Use \`git log\`, \`git show\`, \`git diff\`, and \`git blame\` for history.
- Your goal is to return the relevant repositories, filenames, line ranges, and concise
  explanation needed to answer the question. Your goal is NOT to explore complete repositories.
- **Maximize parallelism**: Clone every repository the question needs in the first turn. Then make
  several parallel \`shell_command\` calls, each testing a distinct hypothesis, term, file path,
  caller path, config path, test path, or history path, or batch independent read-only commands
  into one call.
- **Minimize iterations**: Complete the investigation in as few tool-use iterations as possible.
  Return the answer as soon as you have enough source evidence.
- Start with source search: Use exact identifiers, strings from the question, likely
  filenames/directories, public APIs, imports/callers, tests, configs, and alternate terminology
  before falling back to broader discovery.
- Prefer generous reads over repeated searches: once a search identifies promising source files,
  read larger contiguous ranges that capture complete logical units (full functions, classes, or
  blocks), including 5-10 lines of buffer above and below.
- Treat web research as staged, not parallel-first. Put related query variants in one web search,
  inspect the results, then follow up only for a specific unresolved fact.
- For questions about a repository's issue tracker (bug reports, feature requests, and their
  discussion), use \`gh issue list --repo <owner>/<repo>\` and
  \`gh issue view <number> --repo <owner>/<repo> --comments\`. If \`gh\` is missing or not
  authenticated, say that issues are unavailable.

## Read-only outside the clone

Write only inside \`/tmp/amp-librarian/\`, and only through \`git clone\`, \`git fetch\`, and
\`git sparse-checkout\`. Never modify the user's workspace or the clone's working tree, and do not
run package managers, builds, tests, or formatters.

## Output format

- You must use Markdown for formatting your responses.
- Explain findings and cite the relevant files and line ranges instead of reproducing their
  contents. The main agent shares this orb and can read the local clones for exact source.
  Include a very small snippet (a few lines) when the exact syntax makes a finding clearer;
  otherwise use a citation and explanation. Specify the language on any code block.
- You should only address the user's specific query or task at hand. Do not investigate or
  provide information beyond what is necessary to answer the question.
- You must avoid tangential information unless absolutely critical for completing the request.
  Avoid long introductions, explanations, and summaries. Avoid unnecessary preamble or postamble,
  unless the user asks you to.
- Do not write \`commentary\` messages at all.
- Use tools silently, then return only the final
  answer. The final response must directly answer the user's request without preamble, narration,
  status updates, process explanation, or follow-up questions.
- Prefer "fluent" linking style. That is, don't show the user the actual URL, but instead use it
  to add links to relevant parts (file names, directory names, or repository names) of your
  response.
- Link files and directories as
  \`https://github.com/<org>/<repository>/blob/<revision>/<filepath>#L<range>\`, where
  \`<revision>\` is the clone's \`git rev-parse HEAD\` (or the commit you inspected). Example:
  <example-file-url>https://github.com/foo_org/bar_repo/blob/0a1b2c3d/src/test.py#L32-L42</example-file-url>
- End with a \`Local clones\` list naming each repository, its checked-out revision, and its clone
  directory, so the main agent can read or search the clone directly. Example:
  \`- foo_org/bar_repo at 0a1b2c3d: /tmp/amp-librarian/foo_org__bar_repo\`
- IMPORTANT: Only your last message is returned to the main agent and displayed to the user. Your
  last message should include all important findings from your exploration, with inline references.`

const toolDescription = `The Librarian is a codebase-understanding subagent for
repositories outside the local workspace.

It clones the repositories it needs into /tmp/amp-librarian/ with this machine's git credentials
and reads them there, so it can read public repositories and private ones the user can access.

Use this when you need deep understanding of existing code across one or more repositories:
- explaining architecture, flows, or subsystem design
- finding where a feature is implemented in an external codebase
- comparing patterns across repositories
- understanding how code evolved through commit history
- reading or diffing files in a remote repository
- reading a repository's GitHub issues: listing or filtering them, or reading one issue's description and comment thread
- describing a dependency or external system's internals when its authoritative source lives outside the workspace, even if a partial copy (vendored package, node_modules, or the client half of a client/server system) exists locally, since that copy is not the source of the layer you are describing

The Librarian reports each clone's path in its answer. You can then read or search that clone
directly with your own tools.

Do not use this for:
- local workspace reads or searches of first-party code you can fully read
- code modifications or implementations
- simple local lookups answerable with a direct local tool
- questions unrelated to understanding existing repositories

Guidance:
- name the repository or project when you know it
- ask a specific question or describe the feature or codepath you want understood
- include context about what you are trying to achieve
- expect a thorough answer suitable for sharing
- return the answer in full rather than summarizing it

Examples:
- "How does authentication work in the Kubernetes codebase?"
- "Explain the architecture of the React rendering system"
- "Compare how different web frameworks handle routing"
- "What changed in commit abc123 in my private repository?"
- "Read the README from the main API repository"
- "What open issues mention the parser in my repository?"
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
	const librarian = amp.createAgent({
		name: 'Librarian',
		model: MODEL,
		reasoningEffort: REASONING_EFFORT,
		instructions,
		tools: {
			include: [
				'shell_command',
				'shell_command_status',
				'shell_command_kill',
				'web_search',
				'read_web_page',
			],
			exclude: ['tool_search', 'code_exec'],
		},
		display: { label: 'Librarian', color: '#b45309' },
	})

	amp.registerTool({
		name: 'librarian',
		title: 'Librarian',
		description: toolDescription,
		inputSchema: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description:
						'Your question about the codebase. Be specific about what you want to understand or explore.',
				},
				context: {
					type: 'string',
					description:
						"Optional context about what you're trying to achieve or background information.",
				},
			},
			required: ['query'],
		},
		async execute(input, ctx) {
			const query = typeof input.query === 'string' ? input.query.trim() : ''
			if (!query) {
				throw new Error('Missing librarian query.')
			}
			const context = typeof input.context === 'string' ? input.context.trim() : ''
			const message = context ? `Context: ${context}\n\nQuery: ${query}` : query
			return runSubagent(librarian, message, ctx, 20 * 60 * 1000)
		},
	})
}
