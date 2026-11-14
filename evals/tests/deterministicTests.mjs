import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const summaries = JSON.parse(
  fs.readFileSync(path.join(dir, '../golden/summaries.json'), 'utf8'),
)
const scoring = JSON.parse(
  fs.readFileSync(path.join(dir, '../golden/scoring.json'), 'utf8'),
)

export default [
  ...summaries.map((item) => ({
    description: `summary:${item.id}`,
    vars: {
      evalKind: 'summary',
      ...item,
    },
    assert: [
      {
        type: 'javascript',
        metric: 'summary_guardrails',
        value: 'file://validators.mjs:validateDeterministicSummary',
      },
    ],
  })),
  ...scoring.map((item) => ({
    description: `scoring:${item.id}`,
    vars: {
      evalKind: 'scoring',
      ...item,
    },
    assert: [
      {
        type: 'javascript',
        metric: 'deterministic_scoring',
        value: 'file://validators.mjs:assertGoldenScore',
      },
    ],
  })),
]
