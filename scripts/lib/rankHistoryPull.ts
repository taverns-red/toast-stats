/**
 * Rank-history pull (#1733, plan E2-3).
 *
 * `Generate CDN manifests` builds `v1/rank-history/{districtId}.json` from
 * every `snapshots/{date}/all-districts-rankings.json`. It used to run one
 * `gcloud storage cp` per date — ~206 in sequence, ~4 minutes — each ending
 * in `|| true`, so a failed download silently dropped that date from every
 * district's history while the run stayed green.
 *
 * This is one listing (`matchGlob`, filtered server-side) and one
 * bounded-concurrency download into the same flat `{date}.json` layout the
 * builder reads. Downloads use the SDK's default `decompress: true`, which
 * was verified byte-identical (`cmp`) to `gcloud storage cp` of the same
 * Content-Encoding: gzip object (staging, 2026-10-10).
 *
 * `gcloud storage rsync --exclude` was the other option in the plan. It was
 * rejected: rsync must list all of `snapshots/` (~270k objects, 61 s for the
 * listing alone, growing daily) to keep 206 of them.
 *
 * Fail-closed: a listing error, any download error, or fewer files on disk
 * than dated objects listed rejects. An empty listing is a no-op, as before.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { mapLimit } from './promotionContentGateIo.js'

export const RANKINGS_PREFIX = 'snapshots/'
export const RANKINGS_MATCH_GLOB = 'snapshots/*/all-districts-rankings.json'
export const CONCURRENCY = 16

const RANKINGS_NAME =
  /^snapshots\/(\d{4}-\d{2}-\d{2})\/all-districts-rankings\.json$/

/** The subset of `@google-cloud/storage`'s File the pull uses. */
export interface RankHistoryFile {
  download(opts: { destination: string }): Promise<unknown>
}

/** The subset of `@google-cloud/storage`'s Bucket the pull uses. */
export interface RankHistoryBucket {
  // The SDK's overloads resolve to `[files, nextQuery, apiResponse]`.
  getFiles(query: Record<string, unknown>): Promise<unknown[]>
  file(name: string): RankHistoryFile
}

/** `snapshots/{date}/all-districts-rankings.json` → date, else null. */
export function rankingsDate(name: string): string | null {
  return RANKINGS_NAME.exec(name)?.[1] ?? null
}

function nameOf(item: unknown): string {
  const name = (item as { name?: unknown } | null)?.name
  if (typeof name !== 'string' || !name) {
    throw new Error(
      `listed object has no name: ${JSON.stringify(item)?.slice(0, 120)}`
    )
  }
  return name
}

export async function pullRankHistory(
  bucket: RankHistoryBucket,
  destDir: string,
  opts: { concurrency?: number } = {}
): Promise<{ downloaded: number }> {
  const [items] = await bucket.getFiles({
    prefix: RANKINGS_PREFIX,
    matchGlob: RANKINGS_MATCH_GLOB,
  })
  const dated: Array<{ name: string; date: string }> = []
  for (const item of (items as unknown[] | undefined) ?? []) {
    const name = nameOf(item)
    const date = rankingsDate(name)
    if (date) dated.push({ name, date })
    else console.error(`[rank-history] ignoring ${name} (not a dated snapshot)`)
  }

  fs.mkdirSync(destDir, { recursive: true })
  await mapLimit(dated, opts.concurrency ?? CONCURRENCY, async o => {
    try {
      await bucket
        .file(o.name)
        .download({ destination: path.join(destDir, `${o.date}.json`) })
    } catch (err) {
      throw new Error(`download of ${o.name} failed: ${String(err)}`)
    }
  })

  const onDisk = new Set(
    fs.readdirSync(destDir).filter(f => f.endsWith('.json'))
  )
  const landed = dated.filter(o => onDisk.has(`${o.date}.json`)).length
  if (landed !== dated.length) {
    throw new Error(
      `only ${landed} of ${dated.length} rankings files landed in ${destDir}`
    )
  }
  return { downloaded: landed }
}
