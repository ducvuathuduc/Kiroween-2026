import assert from 'node:assert/strict'
import test from 'node:test'
import app from '../server.ts'

test('A2A total feed outage returns a failed Task without samples or artifacts', async (t) => {
  if (process.env.READER_TEST_URL) return t.skip('Fault injection is in-process only; live Worker skills are covered separately.')
  const original = globalThis.fetch
  // Simulate a transport outage, not fabricated feed/provider data.
  globalThis.fetch = async () => { throw new Error('Network unavailable') }
  t.after(() => { globalThis.fetch = original })
  const response = await app.request('/a2a/tasks', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'message/send', params: {
      message: { kind: 'message', role: 'user', messageId: 'outage', parts: [{ kind: 'data', data: { skill: 'get_briefing' } }] },
    } }),
  })
  assert.equal(response.status, 200)
  const { result } = await response.json()
  assert.equal(result.kind, 'task')
  assert.equal(result.status.state, 'failed')
  assert.match(result.status.message.parts[0].text, /No live feed items are available/)
  assert.equal(result.artifacts, undefined)
  assert.deepEqual(result.metadata.transitions.map((entry: { state: string }) => entry.state), ['submitted', 'working', 'failed'])
})
