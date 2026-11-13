import type { FeedItem } from './feeds'
import { summarize } from './format'
import { createZipBytes } from './zip'

export interface GeminiSummary {
  tldr: string
  takeaways: string[]
  whyMatters: string
}

export interface KiroSpecBundle {
  slug: string
  requirements: string
  design: string
  tasks: string
}

/** Create a kebab-case spec filename slug for a Kiro task. */
export function kiroTaskSlug(title: string): string {
  const clean = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '')
  return clean || 'reading-task'
}

/** Build the Markdown Kiro-task spec for a feed item. */
export function buildKiroTask(item: FeedItem): string {
  return `# Kiro task — ${item.title}\n\n**Source:** ${item.link}\n**Feed:** ${item.feedTitle}\n**Signal:** ${item.score ?? '—'}/100 (deterministic score)\n\n## Goal\nTurn this read into a shipped change inspired by "${item.title}".\n\n## Acceptance criteria\n- [ ] Summarize the key idea of the source in one paragraph\n- [ ] Decide build / borrow / skip, with one reason written down\n- [ ] If build: create a spec under .kiro/specs/ and implement the smallest working slice\n`
}

/** Build a complete 3-file Kiro spec folder (requirements.md, design.md, tasks.md). */
export function buildKiroSpecBundle(
  item: FeedItem,
  summary?: GeminiSummary,
): KiroSpecBundle {
  const slug = kiroTaskSlug(item.title)
  const score = item.score ?? '—'
  const context = summary?.tldr || summarize(item.description, 3)
  const takeawaysSection =
    summary && summary.takeaways.length > 0
      ? `\n### Key Takeaways (Gemini TL;DR)\n${summary.takeaways.map((t) => `- ${t}`).join('\n')}\n`
      : ''
  const whySection = summary?.whyMatters
    ? `\n### Builder Relevance\n${summary.whyMatters}\n`
    : ''

  const requirements = `# Requirements — ${item.title}

**Source:** ${item.link || 'N/A'}
**Feed:** ${item.feedTitle}
**Published:** ${item.pubDate}
**Signal:** ${score}/100 (deterministic score)

## Context
${context}
${takeawaysSection}${whySection}
## User Story
As an AWS builder using Kiro, I want to turn "${item.title}" into a concrete prototype or architectural improvement, so high-signal reading produces shipped code.

## Acceptance Criteria
- [ ] Verify the core claims and constraints against official AWS documentation (via \`aws-docs\` MCP).
- [ ] Document the build / borrow / skip decision and target module boundary.
- [ ] Implement the smallest testable vertical slice with passing unit tests and build checks.
`

  const design = `# Design — ${item.title}

## Architecture & Scope
- **Spec directory:** \`.kiro/specs/${slug}/\`
- **Upstream reference:** ${item.link || item.feedTitle}
- **Implementation approach:**
  1. Consult AWS documentation using the registered \`aws-docs\` MCP tools (\`search_documentation\`, \`read_documentation\`, \`recommend\`).
  2. Keep business logic in pure, unit-tested TypeScript modules cleanly separated from UI/handlers.
  3. Validate external inputs and network boundaries with strict TypeScript types.

## Guardrails
- Follow least-privilege IAM, no hardcoded secrets, and reproducible verification checks.
- Confirm end-to-end behavior before marking tasks complete.
`

  const tasks = `# Tasks — ${item.title}

- [ ] 1. Review source (${item.link || item.feedTitle}) and summarize the core pattern in one paragraph.
- [ ] 2. Query \`aws-docs\` MCP for any referenced AWS services, quotas, or SDK APIs.
- [ ] 3. Finalize requirements & architecture decision (build / borrow / skip).
- [ ] 4. Implement the smallest working code slice + deterministic unit tests.
- [ ] 5. Run build, typecheck, and lint verification before merging.
`

  return { slug, requirements, design, tasks }
}

/** Generate and trigger a client-side .zip download containing requirements.md, design.md, and tasks.md. */
export function downloadKiroSpecZip(
  item: FeedItem,
  summary?: GeminiSummary,
): string {
  const bundle = buildKiroSpecBundle(item, summary)
  const zipBytes = createZipBytes([
    { name: `${bundle.slug}/requirements.md`, content: bundle.requirements },
    { name: `${bundle.slug}/design.md`, content: bundle.design },
    { name: `${bundle.slug}/tasks.md`, content: bundle.tasks },
  ])
  const blobBytes = new Uint8Array(zipBytes.length)
  blobBytes.set(zipBytes)
  const blob = new Blob([blobBytes], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${bundle.slug}-kiro-spec.zip`
  document.body.append(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return `${bundle.slug}-kiro-spec.zip`
}
