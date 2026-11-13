import test from 'node:test'
import assert from 'node:assert/strict'
import { crc32, createZipBytes } from '../src/lib/zip'

test('crc32 matches standard IEEE 802.3 vector', () => {
  const bytes = new TextEncoder().encode('123456789')
  assert.equal(crc32(bytes), 0xcbf43926)
})

test('createZipBytes produces valid PKZIP headers and entry names', () => {
  const archive = createZipBytes([
    { name: 'demo/requirements.md', content: '# Req\n' },
    { name: 'demo/design.md', content: '# Design\n' },
    { name: 'demo/tasks.md', content: '# Tasks\n' },
  ])
  const view = new DataView(archive.buffer)
  // Local file header signature at start
  assert.equal(view.getUint32(0, true), 0x04034b50)
  // EOCD signature at end (-22 bytes)
  assert.equal(view.getUint32(archive.length - 22, true), 0x06054b50)
  // Entry count = 3
  assert.equal(view.getUint16(archive.length - 14, true), 3)
  const decoded = new TextDecoder().decode(archive)
  assert.match(decoded, /demo\/requirements\.md/)
  assert.match(decoded, /demo\/design\.md/)
  assert.match(decoded, /demo\/tasks\.md/)
})
