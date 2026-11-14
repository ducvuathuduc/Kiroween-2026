import {
  SUMMARY_JSON_SYSTEM_PROMPT,
  buildSummaryPrompt,
} from '../../server/summaryPrompt.ts'

export default function renderSummaryPrompt({ vars }) {
  if (vars?.evalKind === 'scoring') {
    return JSON.stringify({
      evalKind: 'scoring',
      id: vars.id,
      title: vars.title,
    })
  }

  return [
    {
      role: 'system',
      content: SUMMARY_JSON_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: buildSummaryPrompt({
        title: String(vars?.title ?? ''),
        feedTitle: String(vars?.feedTitle ?? ''),
        link: String(vars?.link ?? ''),
        content: String(vars?.content ?? ''),
      }),
    },
  ]
}
