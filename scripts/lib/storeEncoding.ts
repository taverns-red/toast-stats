/**
 * Store encoding normalise/check (#1702).
 *
 * The time-series objects are stored `Content-Encoding: gzip` (uploaded with
 * `gcloud storage cp -Z`). `gcloud storage rsync` on the CI runner downloads
 * them without decompressing, and the next `-Z` upload gzips those bytes
 * again: one more layer a run. The daily run only rewrites the current
 * program year, so every older file would keep its layers forever unless
 * they are peeled on disk.
 *
 * - `normalizeStoreFiles` runs right after a download: peel every gzip layer
 *   off every `*.json` in place and require JSON. A file that is still not
 *   JSON is a corrupt store, reported as a failure (and left untouched).
 * - `findGzippedStoreFiles` runs right before a `-Z` upload: anything still
 *   gzip on disk would be double-encoded, so the caller fails loudly.
 *
 * Paths that do not exist are the legitimate "store not created yet" case and
 * contribute no files.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  isGzipped,
  peelGzipLayers,
} from '../../packages/collector-cli/src/utils/gzipLayers.js'

export interface NormalizeStoreResult {
  /** JSON files examined. */
  files: number
  /** Files that carried at least one gzip layer and were rewritten plain. */
  peeled: Array<{ file: string; layers: number }>
  /** Files that could not be made into JSON; left as found. */
  failures: Array<{ file: string; reason: string }>
}

/** Every `*.json` file under the given files/directories, sorted. */
export function listStoreJsonFiles(paths: readonly string[]): string[] {
  const out: string[] = []
  const visit = (p: string): void => {
    let stat: fs.Stats
    try {
      stat = fs.statSync(p)
    } catch (err) {
      if ((err as { code?: string }).code === 'ENOENT') return
      throw err
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(p)) visit(path.join(p, entry))
    } else if (stat.isFile() && p.endsWith('.json')) {
      out.push(p)
    }
  }
  for (const p of paths) visit(p)
  return out.sort()
}

export function normalizeStoreFiles(
  paths: readonly string[]
): NormalizeStoreResult {
  const files = listStoreJsonFiles(paths)
  const peeled: NormalizeStoreResult['peeled'] = []
  const failures: NormalizeStoreResult['failures'] = []

  for (const file of files) {
    const raw = fs.readFileSync(file)
    let data: Buffer
    let layers: number
    try {
      ;({ data, layers } = peelGzipLayers(raw))
      JSON.parse(data.toString('utf-8'))
    } catch (err) {
      failures.push({
        file,
        reason: err instanceof Error ? err.message : String(err),
      })
      continue
    }
    if (layers > 0) {
      fs.writeFileSync(file, data)
      peeled.push({ file, layers })
    }
  }

  return { files: files.length, peeled, failures }
}

export function findGzippedStoreFiles(paths: readonly string[]): string[] {
  return listStoreJsonFiles(paths).filter(file => {
    const fd = fs.openSync(file, 'r')
    try {
      const head = Buffer.alloc(2)
      const read = fs.readSync(fd, head, 0, 2, 0)
      return isGzipped(head.subarray(0, read))
    } finally {
      fs.closeSync(fd)
    }
  })
}
