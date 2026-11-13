/**
 * Minimal, zero-dependency PKZIP (STORE method, method 0) archive builder
 * for exporting pure client-side .zip bundles.
 */
export interface ZipEntry {
  name: string
  content: string | Uint8Array
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export function createZipBytes(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder()
  const localChunks: Uint8Array[] = []
  const centralChunks: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const dataBytes =
      typeof entry.content === 'string'
        ? encoder.encode(entry.content)
        : entry.content
    const crc = crc32(dataBytes)

    // Local file header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(localHeader.buffer)
    lv.setUint32(0, 0x04034b50, true) // Local file header signature
    lv.setUint16(4, 20, true) // Version needed to extract (2.0)
    lv.setUint16(6, 0x0800, true) // UTF-8 filename flag
    lv.setUint16(8, 0, true) // Compression method: 0 (STORE)
    lv.setUint16(10, 0, true) // Mod time
    lv.setUint16(12, 0x5421, true) // Mod date
    lv.setUint32(14, crc, true)
    lv.setUint32(18, dataBytes.length, true)
    lv.setUint32(22, dataBytes.length, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true) // Extra field length
    localHeader.set(nameBytes, 30)

    localChunks.push(localHeader, dataBytes)

    // Central directory header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(centralHeader.buffer)
    cv.setUint32(0, 0x02014b50, true) // Central directory signature
    cv.setUint16(4, 20, true) // Version made by
    cv.setUint16(6, 20, true) // Version needed
    cv.setUint16(8, 0x0800, true) // UTF-8 filename flag
    cv.setUint16(10, 0, true) // Method: STORE
    cv.setUint16(12, 0, true) // Mod time
    cv.setUint16(14, 0x5421, true) // Mod date
    cv.setUint32(16, crc, true)
    cv.setUint32(20, dataBytes.length, true)
    cv.setUint32(24, dataBytes.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true) // Extra length
    cv.setUint16(32, 0, true) // Comment length
    cv.setUint16(34, 0, true) // Disk number start
    cv.setUint16(36, 0, true) // Internal file attributes
    cv.setUint32(38, 0, true) // External file attributes
    cv.setUint32(42, offset, true) // Relative offset of local header
    centralHeader.set(nameBytes, 46)

    centralChunks.push(centralHeader)
    offset += localHeader.length + dataBytes.length
  }

  const centralSize = centralChunks.reduce((sum, c) => sum + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true) // End of central directory signature
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true)

  const totalSize = offset + centralSize + eocd.length
  const out = new Uint8Array(totalSize)
  let pos = 0
  for (const chunk of localChunks) {
    out.set(chunk, pos)
    pos += chunk.length
  }
  for (const chunk of centralChunks) {
    out.set(chunk, pos)
    pos += chunk.length
  }
  out.set(eocd, pos)
  return out
}
