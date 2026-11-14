import { explainScore } from '../../src/lib/scoring.ts'

const HOUR = 3_600_000

export default class ScoringProvider {
  id() {
    return 'resurrected-reader-deterministic-scoring'
  }

  async callApi(_prompt, context) {
    const vars = context?.vars ?? {}
    const now = Date.now()
    const pubDate =
      typeof vars.pubDateOverride === 'string'
        ? vars.pubDateOverride
        : new Date(now - Number(vars.hoursAgo ?? 2) * HOUR).toISOString()

    const breakdown = explainScore(
      String(vars.title ?? ''),
      String(vars.content ?? ''),
      pubDate,
      {
        feedId: vars.feedId,
        feedTitle: vars.feedTitle,
        link: vars.link,
      },
    )

    if (typeof vars.staleHoursAgo === 'number') {
      const staleDate = new Date(now - vars.staleHoursAgo * HOUR).toISOString()
      const stale = explainScore(
        String(vars.title ?? ''),
        String(vars.content ?? ''),
        staleDate,
        {
          feedId: vars.feedId,
          feedTitle: vars.feedTitle,
          link: vars.link,
        },
      )
      return {
        output: JSON.stringify({
          ...breakdown,
          staleScore: stale.score,
          staleRecency: stale.dimensions.recency,
        }),
      }
    }

    return {
      output: JSON.stringify(breakdown),
    }
  }
}
