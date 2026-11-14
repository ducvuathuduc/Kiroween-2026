import ScoringProvider from './scoringProvider.mjs'
import SummaryFixtureProvider from './summaryFixtureProvider.mjs'

const scoringProvider = new ScoringProvider()
const summaryProvider = new SummaryFixtureProvider()

export default class DeterministicEvalProvider {
  id() {
    return 'resurrected-reader-deterministic-eval'
  }

  async callApi(prompt, context) {
    const evalKind = context?.vars?.evalKind
    if (evalKind === 'scoring') {
      return scoringProvider.callApi(prompt, context)
    }
    return summaryProvider.callApi(prompt, context)
  }
}
