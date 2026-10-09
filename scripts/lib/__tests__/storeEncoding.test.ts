/**
 * Store encoding normalise/check (#1702).
 *
 * `normalizeStoreFiles` runs right after a store tree is downloaded from GCS.
 * It peels every gzip layer off every `*.json` in place, then requires the
 * result to be JSON. The daily run only rewrites the CURRENT program year's
 * time-series file, so a read-side fix alone would leave every older PY file
 * gzipped on disk and the upload's `cp -Z` would stack another layer on it.
 * Peeling on disk is what repairs the 1564 untouched objects.
 *
 * `findGzippedStoreFiles` runs right before a `-Z` upload and is the
 * double-encoding guard: any gzip bytes left on disk at that point would be
 * gzipped again.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { gzipSync } from 'node:zlib'
import { findGzippedStoreFiles, normalizeStoreFiles } from '../storeEncoding.js'

const PLAIN = JSON.stringify({ programYear: '2016-2017', dataPoints: [] })

function wrap(text: string, layers: number): Buffer {
  let buf = Buffer.from(text, 'utf-8')
  for (let i = 0; i < layers; i++) buf = gzipSync(buf)
  return buf
}

describe('store encoding (#1702)', () => {
  let root: string
  const at = (...parts: string[]) => path.join(root, ...parts)
  const put = (rel: string, contents: Buffer | string) => {
    fs.mkdirSync(path.dirname(at(rel)), { recursive: true })
    fs.writeFileSync(at(rel), contents)
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'store-encoding-'))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  describe('normalizeStoreFiles', () => {
    it('peels every layer in place, recursively, and leaves plain files alone', () => {
      put('time-series/district_61/2016-2017.json', wrap(PLAIN, 10))
      put('time-series/district_61/2026-2027.json', wrap(PLAIN, 1))
      put('time-series/district_61/index-metadata.json', PLAIN)

      const result = normalizeStoreFiles([at('time-series')])

      expect(result.failures).toEqual([])
      expect(result.files).toBe(3)
      expect(
        result.peeled.map(p => [path.basename(p.file), p.layers]).sort()
      ).toEqual([
        ['2016-2017.json', 10],
        ['2026-2027.json', 1],
      ])
      for (const rel of [
        'time-series/district_61/2016-2017.json',
        'time-series/district_61/2026-2027.json',
        'time-series/district_61/index-metadata.json',
      ]) {
        expect(fs.readFileSync(at(rel), 'utf-8')).toBe(PLAIN)
      }
    })

    it('accepts a single file path as well as a directory', () => {
      put('district-awards-history.json', wrap(PLAIN, 3))
      const result = normalizeStoreFiles([at('district-awards-history.json')])
      expect(result.failures).toEqual([])
      expect(fs.readFileSync(at('district-awards-history.json'), 'utf-8')).toBe(
        PLAIN
      )
    })

    it('treats a path that does not exist yet as empty, not as a failure', () => {
      const result = normalizeStoreFiles([
        at('club-race'),
        at('district-awards-history.json'),
      ])
      expect(result).toEqual({ files: 0, peeled: [], failures: [] })
    })

    it('reports a file that is still not JSON after peeling, and leaves it untouched', () => {
      put('club-trends/2026-2027/district_61.json', '{ not json')
      put('club-trends/2026-2027/district_62.json', wrap('also not json', 2))

      const result = normalizeStoreFiles([at('club-trends')])

      expect(result.failures.map(f => path.basename(f.file)).sort()).toEqual([
        'district_61.json',
        'district_62.json',
      ])
      expect(
        fs.readFileSync(at('club-trends/2026-2027/district_61.json'), 'utf-8')
      ).toBe('{ not json')
    })

    it('reports a corrupt gzip body as a failure instead of throwing', () => {
      put(
        'time-series/district_61/2016-2017.json',
        wrap(PLAIN, 2).subarray(0, 12)
      )
      const result = normalizeStoreFiles([at('time-series')])
      expect(result.failures).toHaveLength(1)
    })

    it('ignores non-JSON files such as temp files', () => {
      put('time-series/district_61/2026-2027.json.tmp.1', wrap(PLAIN, 1))
      expect(normalizeStoreFiles([at('time-series')]).files).toBe(0)
    })
  })

  describe('findGzippedStoreFiles', () => {
    it('lists every gzip-encoded JSON file under the given paths', () => {
      put('time-series/district_61/2016-2017.json', wrap(PLAIN, 1))
      put('time-series/district_61/2026-2027.json', PLAIN)
      put('club-trends/2026-2027/district_61.json', wrap(PLAIN, 4))

      const found = findGzippedStoreFiles([
        at('time-series'),
        at('club-trends'),
      ])

      expect(found.map(f => path.basename(f)).sort()).toEqual([
        '2016-2017.json',
        'district_61.json',
      ])
    })

    it('is empty once the tree has been normalised', () => {
      put('time-series/district_61/2016-2017.json', wrap(PLAIN, 10))
      normalizeStoreFiles([at('time-series')])
      expect(findGzippedStoreFiles([at('time-series')])).toEqual([])
    })
  })
})
