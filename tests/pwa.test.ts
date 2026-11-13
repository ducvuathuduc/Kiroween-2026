import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { cacheAsset, cacheNavigation, cacheRss } from '../src/lib/pwa/cachePolicy'
import {
  cachedCoverImages, clearOfflineStorage, loadReaderSnapshot, prepareSnapshot,
  saveReaderSnapshot, type ReaderSnapshot,
} from '../src/lib/storage'
import { selectDailyBriefingItems } from '../src/lib/briefing'
import { startPwaUpdates } from '../src/lib/pwa/updates'

const origin = 'https://reader.example'

test('worker activation discards old HTML only, avoiding stale hashed chunks after update', async () => {
  const source = await readFile(new URL('../public/pwa-lifecycle.js', import.meta.url), 'utf8')
  const deleted: string[] = []
  let activate!: (event: { waitUntil: (promise: Promise<unknown>) => void }) => void
  let complete!: Promise<unknown>
  runInNewContext(source, {
    self: { addEventListener: (name: string, callback: typeof activate) => {
      assert.equal(name, 'activate')
      activate = callback
    } },
    caches: { delete: async (name: string) => { deleted.push(name); return true } },
  })
  activate({ waitUntil: (promise) => { complete = promise } })
  await complete
  assert.deepEqual(deleted, ['rr-pages-v1'])
})

test('PWA runtime routes exclude every non-RSS API and protocol, including navigations', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'self')
  Object.defineProperty(globalThis, 'self', { configurable: true, value: { location: { origin } } })
  try {
    for (const path of ['/api/providers', '/api/embed', '/api/summarize', '/api/og-images',
      '/api/future.js', '/mcp', '/mcp/tool', '/a2a', '/a2a/task', '/.well-known/agent-card.json']) {
      const args = { url: new URL(path, origin), request: { mode: 'navigate', destination: 'script' } as Request }
      assert.equal(cacheNavigation(args), false, path)
      assert.equal(cacheRss(args), false, path)
      assert.equal(cacheAsset(args), false, path)
    }
    assert.equal(cacheRss({ url: new URL('/api/rss?url=https://aws.amazon.com/feed', origin) }), true)
    assert.equal(cacheNavigation({ url: new URL('/briefing', origin), request: { mode: 'navigate' } as Request }), true)
    assert.equal(cacheNavigation({ url: new URL('/briefing', 'https://other.example'), request: { mode: 'navigate' } as Request }), false)
    assert.equal(cacheAsset({ url: new URL('/assets/font.woff2', origin), request: { destination: 'font' } as Request }), true)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'self', previous)
    else Reflect.deleteProperty(globalThis, 'self')
  }
})

function snapshot(): ReaderSnapshot {
  return {
    items: Array.from({ length: 240 }, (_, index) => ({
      id: `unit-${index}`, feedId: 'unit', feedTitle: 'Unit-test fixture', title: `Unit test ${index}`,
      link: `https://example.com/${index}`, pubDate: new Date(index * 86400000).toISOString(),
      description: 'Test fixture only, never app data.', score: index < 6 ? 99 : 20,
    })),
    pulse: { hn: [], github: [], fetchedAt: '2026-11-13T10:00:00Z', cached: false, errors: {} },
    feedHealth: {}, fetchedAt: '2026-11-13T10:00:00Z', selectedId: 'unit-8', selectedFeed: 'all',
  }
}

test('snapshot bounds storage while preserving newest 20, exact briefing and selection, never SAMPLE', () => {
  const data = snapshot()
  data.items.push({ ...data.items[0], id: 'sample', sample: true })
  const prepared = prepareSnapshot(data)
  assert.ok(prepared.items.length <= 206)
  assert.ok(prepared.items.every((item) => !item.sample))
  assert.ok(prepared.items.some((item) => item.id === data.selectedId))
  for (const item of data.items.slice(220, 240)) assert.ok(prepared.items.some((other) => other.id === item.id))
  assert.deepEqual(selectDailyBriefingItems(prepared.items).map((item) => item.id),
    selectDailyBriefingItems(data.items.filter((item) => !item.sample)).map((item) => item.id))
  assert.equal(prepared.fetchedAt, data.fetchedAt)
})

test('snapshot Cache API persistence, sample protection, clear ordering and POST metadata SWR', async () => {
  const stores = new Map<string, Map<string, Response>>()
  const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches')
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const originalFetch = globalThis.fetch
  const mockCaches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map())
      const store = stores.get(name)!
      return {
        match: async (key: string) => store.get(key)?.clone(),
        put: async (key: string, response: Response) => { store.set(key, response.clone()) },
        keys: async () => [...store.keys()],
        delete: async (key: string) => store.delete(key),
      }
    },
    delete: async (name: string) => stores.delete(name),
  }
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: mockCaches })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } })
  try {
    const data = snapshot()
    assert.equal(await saveReaderSnapshot(data), true)
    assert.deepEqual(await loadReaderSnapshot(), prepareSnapshot(data))
    assert.equal(await saveReaderSnapshot({ ...data, items: data.items.map((item) => ({ ...item, sample: true })) }), false)
    assert.deepEqual(await loadReaderSnapshot(), prepareSnapshot(data))
    const pending = saveReaderSnapshot(data)
    await clearOfflineStorage()
    await pending
    assert.equal(await loadReaderSnapshot(), null)
    let calls = 0
    globalThis.fetch = async (input, init) => {
      calls++
      assert.equal(input, '/api/og-images')
      assert.equal(init?.method, 'POST')
      return Response.json({ images: { 'https://example.com/article': `https://example.com/cover-${calls}.png` } })
    }
    const urls = ['https://example.com/article']
    const first = await cachedCoverImages(urls, () => {})
    assert.equal(first[urls[0]], 'https://example.com/cover-1.png')
    let refreshed!: (value: Record<string, string | null>) => void
    const fresh = new Promise<Record<string, string | null>>((resolve) => { refreshed = resolve })
    assert.deepEqual(await cachedCoverImages(urls, refreshed), first)
    assert.equal((await fresh)[urls[0]], 'https://example.com/cover-2.png')
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } })
    assert.equal((await cachedCoverImages(urls, () => {}))[urls[0]], 'https://example.com/cover-2.png')
    assert.equal(calls, 2)
    assert.ok([...stores.get('rr-covers-v1')!.keys()].every((key) => key.startsWith('/__rr-cache/covers?')))
  } finally {
    globalThis.fetch = originalFetch
    if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches)
    else Reflect.deleteProperty(globalThis, 'caches')
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
    else Reflect.deleteProperty(globalThis, 'navigator')
  }
})

test('native update lifecycle announces new controller without reloading; cleanup detaches listeners', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const serviceWorker = new EventTarget() as EventTarget & Record<string, unknown>
  serviceWorker.controller = {}
  const reg = new EventTarget() as EventTarget & Record<string, unknown>
  reg.update = async () => {}
  let registered: unknown
  serviceWorker.register = async (...args: unknown[]) => { registered = args; return reg }
  const windowEvents = new EventTarget()
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker, onLine: true } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowEvents })
  try {
    const states: string[] = []
    const stop = startPwaUpdates((state) => states.push(state))
    await Promise.resolve()
    assert.deepEqual(registered, ['/sw.js', { scope: '/', updateViaCache: 'none' }])
    serviceWorker.dispatchEvent(new Event('controllerchange'))
    assert.deepEqual(states, ['available'])
    stop()
    serviceWorker.dispatchEvent(new Event('controllerchange'))
    assert.deepEqual(states, ['available'])
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
    else Reflect.deleteProperty(globalThis, 'navigator')
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
