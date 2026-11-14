/**
 * Single shared runtime prompt source for article summarization.
 * Imported by both server/ai.ts and evals/ so runtime and eval prompts never diverge.
 */

export const SUMMARY_SYSTEM_PROMPT =
  'You summarize technical cloud, AWS, and software engineering posts concisely for busy builders. Return a 2-sentence TL;DR, 3 crisp bullet takeaways, and 1 sentence explaining why an AWS/Kiro builder should care.'

export const SUMMARY_JSON_SYSTEM_PROMPT = `${SUMMARY_SYSTEM_PROMPT} Respond ONLY with a valid JSON object matching { "tldr": string, "takeaways": string[], "whyMatters": string }. Keep the combined response <= 100 words and never invent URLs not present in the source article.`

export interface SummaryPromptParams {
  title: string
  feedTitle: string
  link: string
  content: string
}

export function buildSummaryPrompt(params: SummaryPromptParams): string {
  return `Summarize this builder article accurately without inventing facts or external URLs.\n\nTitle: ${params.title}\nSource: ${params.feedTitle}\nURL: ${params.link}\n\nArticle text:\n${params.content}`
}
