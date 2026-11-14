import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const summaries = JSON.parse(
  fs.readFileSync(path.join(dir, '../golden/summaries.json'), 'utf8'),
)

export default summaries.map((item) => ({
  description: `judge:${item.id}`,
  vars: {
    evalKind: 'summary',
    id: item.id,
    title: item.title,
    feedTitle: item.feedTitle,
    link: item.link,
    content: item.content,
  },
  assert: [
    {
      type: 'javascript',
      metric: 'summary_guardrails',
      value: 'file://validators.mjs:validateDeterministicSummary',
    },
    {
      type: 'llm-rubric',
      metric: 'faithfulness_and_utility',
      value:
        'The JSON summary faithfully reflects only facts supported by the article excerpt without inventing claims, metrics, or external URLs, and gives AWS/Kiro builders concrete technical takeaways.',
    },
  ],
}))
