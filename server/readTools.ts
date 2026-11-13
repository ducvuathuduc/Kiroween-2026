import { selectDailyBriefingItems } from '../src/lib/briefing.ts'
import { buildKiroSpecBundle } from '../src/lib/kiroTask.ts'
import { getItem, loadItems } from './items.ts'

/** Shared read-only capabilities; neither protocol adapter calls paid AI. */
export async function searchItems({ query = '', limit = 20, minScore = 0 }: {
  query?: string; limit?: number; minScore?: number
} = {}) {
  const { items, errors } = await loadItems()
  const needle = query.toLowerCase()
  return {
    items: items.filter((item) => (item.score ?? 0) >= minScore && `${item.title} ${item.description}`.toLowerCase().includes(needle)).slice(0, limit),
    errors,
  }
}

export async function dailyBriefing() {
  const { items, errors } = await loadItems()
  return { items: selectDailyBriefingItems(items), errors }
}

export async function exportKiroTask(id: string) {
  return buildKiroSpecBundle(await getItem(id))
}
