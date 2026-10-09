/**
 * Peeling stacked gzip layers off a downloaded store file (#1702).
 *
 * `gcloud storage rsync` on the CI runner downloads `Content-Encoding: gzip`
 * objects without decompressing them, and the upload step's `cp -Z` gzips
 * whatever bytes it finds, so every run added one layer: production
 * time-series objects reached ~10. A reader that peels every layer turns
 * that object back into plain JSON whatever the depth; a reader that peels
 * one (or none) leaves the store unparseable.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { gzipSync } from 'node:zlib'
import {
  GzipLayerError,
  isGzipped,
  MAX_GZIP_LAYERS,
  peelGzipLayers,
  readStoreFileText,
} from '../gzipLayers.js'

const JSON_TEXT = JSON.stringify({ dataPoints: [{ date: '2026-10-08' }] })

function wrap(text: string | Buffer, layers: number): Buffer {
  let buf = Buffer.isBuffer(text) ? text : Buffer.from(text, 'utf-8')
  for (let i = 0; i < layers; i++) buf = gzipSync(buf)
  return buf
}

describe('isGzipped (#1702)', () => {
  it('recognises the gzip magic bytes 1f 8b', () => {
    expect(isGzipped(wrap(JSON_TEXT, 1))).toBe(true)
  })

  it('does not flag plain JSON, an empty buffer, or a lone 1f byte', () => {
    expect(isGzipped(Buffer.from(JSON_TEXT))).toBe(false)
    expect(isGzipped(Buffer.alloc(0))).toBe(false)
    expect(isGzipped(Buffer.from([0x1f]))).toBe(false)
  })
})

describe('peelGzipLayers (#1702)', () => {
  it('returns plain input untouched with zero layers', () => {
    const result = peelGzipLayers(Buffer.from(JSON_TEXT))
    expect(result.layers).toBe(0)
    expect(result.data.toString('utf-8')).toBe(JSON_TEXT)
  })

  it.each([1, 2, 10, 15])('peels %i stacked layers', layers => {
    const result = peelGzipLayers(wrap(JSON_TEXT, layers))
    expect(result.layers).toBe(layers)
    expect(result.data.toString('utf-8')).toBe(JSON_TEXT)
  })

  it('throws on a gzip header over a corrupt body instead of returning junk', () => {
    const truncated = wrap(JSON_TEXT, 3).subarray(0, 12)
    expect(() => peelGzipLayers(truncated)).toThrow(GzipLayerError)
  })

  it('refuses to peel past the layer cap (bounded, never an unbounded loop)', () => {
    expect(() => peelGzipLayers(wrap(JSON_TEXT, MAX_GZIP_LAYERS + 1))).toThrow(
      /layer/i
    )
  })
})

describe('readStoreFileText (#1702)', () => {
  async function withTempFile(
    contents: Buffer,
    run: (filePath: string) => Promise<void>
  ): Promise<void> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gzip-layers-'))
    try {
      const filePath = path.join(dir, 'store.json')
      await fs.writeFile(filePath, contents)
      await run(filePath)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  }

  it('reads a 10-layer file as the plain JSON text', async () => {
    await withTempFile(wrap(JSON_TEXT, 10), async filePath => {
      expect(await readStoreFileText(filePath)).toBe(JSON_TEXT)
    })
  })

  it('reads a plain file unchanged', async () => {
    await withTempFile(Buffer.from(JSON_TEXT), async filePath => {
      expect(await readStoreFileText(filePath)).toBe(JSON_TEXT)
    })
  })

  it('lets ENOENT through untouched so callers keep the "not yet created" path', async () => {
    await expect(
      readStoreFileText(path.join(os.tmpdir(), `absent-${Date.now()}.json`))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
