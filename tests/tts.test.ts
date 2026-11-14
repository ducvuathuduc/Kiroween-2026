import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBriefingUtterances,
  chunkSentences,
  createBriefingPlayer,
  type DailyBriefingItem,
  type SpeakCallbacks,
  type SpeechEngine,
  type SpeechSpeakRequest,
} from '../src/lib/tts'

interface PendingCall {
  req: SpeechSpeakRequest
  callbacks?: SpeakCallbacks
}

function createStubEngine() {
  const spoken: string[] = []
  const requests: SpeechSpeakRequest[] = []
  const pending: PendingCall[] = []
  let cancelCount = 0
  let pauseCount = 0
  let resumeCount = 0

  const engine: SpeechEngine = {
    isSupported: () => true,
    speak: (req, callbacks) => {
      spoken.push(req.text)
      requests.push(req)
      pending.push({ req, callbacks })
    },
    cancel: () => {
      cancelCount += 1
    },
    pause: () => {
      pauseCount += 1
    },
    resume: () => {
      resumeCount += 1
    },
    getVoices: () => [
      {
        voiceURI: 'stub-en-us',
        name: 'Stub English',
        lang: 'en-US',
        default: true,
        localService: true,
      },
    ],
  }

  return {
    engine,
    spoken,
    requests,
    pending,
    counts: () => ({ cancelCount, pauseCount, resumeCount }),
    finishNext: () => {
      const call = pending.shift()
      call?.callbacks?.onEnd?.()
    },
    finishAt: (index: number) => {
      const [call] = pending.splice(index, 1)
      call?.callbacks?.onEnd?.()
    },
    failAt: (index: number, reason: string) => {
      const [call] = pending.splice(index, 1)
      call?.callbacks?.onError?.(reason)
    },
  }
}

const SAMPLE_BRIEFING: DailyBriefingItem[] = [
  {
    id: 'item-1',
    title: 'AWS announces Bedrock Guardrails update',
    url: 'https://aws.amazon.com/blogs/aws/1',
    score: 92,
    source: 'AWS News Blog',
    tldr: 'Adds faster policy checks for agents.',
  },
  {
    id: 'item-2',
    title: 'Kiro spec-driven hooks in production',
    url: 'https://example.com/2',
    score: 86,
    source: 'Hacker News',
    tldr: 'Teams validate specs before codegen.',
  },
  {
    id: 'item-3',
    title: 'Serverless cold start benchmarks',
    url: 'https://example.com/3',
    score: 74,
    source: 'AWS Blog',
    tldr: 'SnapStart cuts Python latency.',
  },
]

test('chunkSentences splits multiple sentences and skips empty strings', () => {
  assert.deepEqual(chunkSentences(''), [])
  assert.deepEqual(chunkSentences('   \n\t   '), [])
  assert.deepEqual(
    chunkSentences('First sentence. Second sentence! Third question?'),
    ['First sentence.', 'Second sentence!', 'Third question?'],
  )
})

test('chunkSentences preserves common abbreviations and decimal numbers', () => {
  const input =
    'Dr. Smith tested v1.5 on U.S. servers, e.g. AWS Bedrock. Latency dropped 1.8x!'
  assert.deepEqual(chunkSentences(input), [
    'Dr. Smith tested v1.5 on U.S. servers, e.g. AWS Bedrock.',
    'Latency dropped 1.8x!',
  ])
})

test('chunkSentences splits overly long sentences within maxLength', () => {
  const longSentence =
    'AWS builders running autonomous coding agents in production need deterministic evaluation harnesses, strict IAM boundaries, repeatable sandbox environments, and observable tool-use logs before shipping changes automatically.'
  const chunks = chunkSentences(longSentence, 80)
  assert.ok(chunks.length >= 3)
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 80, `chunk exceeded 80 chars: ${chunk}`)
  }
  assert.equal(chunks.join(' '), longSentence)
})

test('buildBriefingUtterances builds headline and TL;DR utterances once per item', () => {
  const utterances = buildBriefingUtterances(SAMPLE_BRIEFING)
  assert.equal(utterances.length, 6)
  assert.equal(utterances[0]?.itemIndex, 0)
  assert.equal(utterances[0]?.kind, 'headline')
  assert.equal(utterances[1]?.itemIndex, 0)
  assert.equal(utterances[1]?.kind, 'tldr')
  assert.equal(utterances[4]?.itemIndex, 2)
  assert.equal(utterances[4]?.itemId, 'item-3')
})

test('createBriefingPlayer plays items in order and notifies item changes', () => {
  const stub = createStubEngine()
  const player = createBriefingPlayer(stub.engine)
  const states: string[] = []
  const itemOrder: number[] = []
  let completed = false

  player.subscribe({
    onStateChange: (s) => states.push(s),
    onItemChange: (index) => itemOrder.push(index),
    onComplete: () => {
      completed = true
    },
  })

  player.play(SAMPLE_BRIEFING, { voiceURI: 'stub-en-us', rate: 1.25 })
  assert.equal(player.getStatus(), 'speaking')
  assert.deepEqual(itemOrder, [0])
  assert.equal(stub.requests[0]?.voiceURI, 'stub-en-us')
  assert.equal(stub.requests[0]?.rate, 1.25)

  // Complete all 6 utterances (2 per item * 3 items)
  for (let i = 0; i < 6; i++) {
    stub.finishNext()
  }

  assert.deepEqual(itemOrder, [0, 1, 2])
  assert.equal(player.getStatus(), 'idle')
  assert.equal(completed, true)
  assert.deepEqual(states, ['speaking', 'idle'])
})

test('createBriefingPlayer handles pause and resume transitions', () => {
  const stub = createStubEngine()
  const player = createBriefingPlayer(stub.engine)

  player.play(SAMPLE_BRIEFING)
  assert.equal(player.getStatus(), 'speaking')

  player.pause()
  assert.equal(player.getStatus(), 'paused')
  assert.equal(stub.counts().pauseCount, 1)

  player.resume()
  assert.equal(player.getStatus(), 'speaking')
  assert.equal(stub.counts().resumeCount, 1)

  stub.finishNext()
  assert.equal(stub.spoken.length, 2)
})

test('createBriefingPlayer stop clears queue and ignores stale callbacks', () => {
  const stub = createStubEngine()
  const player = createBriefingPlayer(stub.engine)
  const errors: string[] = []

  player.subscribe({
    onError: (msg) => errors.push(msg),
  })

  player.play(SAMPLE_BRIEFING)
  assert.equal(stub.pending.length, 1)

  player.stop()
  assert.equal(player.getStatus(), 'idle')
  assert.equal(player.getCurrentIndex(), -1)

  // Stale onEnd and onError arriving after stop must be ignored
  stub.finishAt(0)
  assert.equal(stub.spoken.length, 1)
  assert.equal(player.getStatus(), 'idle')

  // Simulate delayed error callback from cancelled run
  player.play(SAMPLE_BRIEFING)
  player.stop()
  stub.failAt(0, 'late failure')
  assert.deepEqual(errors, [])
  assert.equal(player.getStatus(), 'idle')
})

test('rapid play twice only advances the second playlist', () => {
  const stub = createStubEngine()
  const player = createBriefingPlayer(stub.engine)
  const itemIds: string[] = []

  player.subscribe({
    onItemChange: (_idx, item) => itemIds.push(item.id),
  })

  const firstPlaylist: DailyBriefingItem[] = [SAMPLE_BRIEFING[0]!]
  const secondPlaylist: DailyBriefingItem[] = [SAMPLE_BRIEFING[2]!]

  player.play(firstPlaylist)
  player.play(secondPlaylist)

  // Delayed onEnd from firstPlaylist (pending[0]) must NOT advance secondPlaylist
  stub.finishAt(0)
  assert.deepEqual(itemIds, ['item-1', 'item-3'])
  assert.equal(stub.spoken.length, 2)

  // Completing secondPlaylist utterance 1 advances to secondPlaylist utterance 2
  stub.finishAt(0)
  assert.equal(stub.spoken.length, 3)
  assert.match(stub.spoken[2]!, /SnapStart cuts Python latency/)

  stub.finishAt(0)
  assert.equal(player.getStatus(), 'idle')
})