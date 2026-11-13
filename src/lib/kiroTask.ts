import type { FeedItem } from './feeds'

/** Build the Markdown Kiro-task spec for a feed item. */
export function buildKiroTask(item: FeedItem): string {
  return `# Kiro task — ${item.title}\n\n**Source:** ${item.link}\n**Feed:** ${item.feedTitle}\n**Signal:** ${item.score ?? '—'}/100 (deterministic score)\n\n## Goal\nTurn this read into a shipped change inspired by "${item.title}".\n\n## Acceptance criteria\n- [ ] Summarize the key idea of the source in one paragraph\n- [ ] Decide build / borrow / skip, with one reason written down\n- [ ] If build: create a spec under .kiro/specs/ and implement the smallest working slice\n`
}
