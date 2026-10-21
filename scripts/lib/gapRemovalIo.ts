/**
 * Gap-district removal — the reads around ./gapRemoval.ts (#2232).
 *
 * Read-only: one listing of `snapshots/<date>/`, the date's metadata.json
 * and each gap district's `district_<id>.json` (single objects). gcloud (or
 * the test shim) is spawned with the injected env. Stored bytes may carry a
 * gzip layer or not (gcloud versions differ on `cat`, #1702): peeled here.
 */

import { spawnSync } from 'node:child_process'
import {
  GzipLayerError,
  peelGzipLayers,
} from '../../packages/collector-cli/src/utils/gzipLayers.js'
import {
  districtClubCount,
  planGapRemovals,
  type GapRemovalPlan,
} from './gapRemoval.js'
import { sourceGapDistricts } from './sourceGap.js'

export interface GcloudIo {
  gcloud: string
  env: Record<string, string | undefined>
}

const NO_MATCH = 'matched no objects'

/** Names under `snapshots/<date>/`, relative; [] when none; throws on error. */
export function listDate(io: GcloudIo, bucket: string, date: string): string[] {
  const prefix = `gs://${bucket}/snapshots/${date}/`
  const r = spawnSync(io.gcloud, ['storage', 'ls', `${prefix}**`], {
    encoding: 'utf-8',
    env: io.env,
  })
  if (r.status !== 0) {
    if ((r.stderr ?? '').includes(NO_MATCH)) return []
    throw new Error(`could not list ${prefix}: ${(r.stderr ?? '').trim()}`)
  }
  return r.stdout
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith(prefix))
    .map(l => l.slice(prefix.length))
}

/**
 * One object parsed as JSON: undefined when absent, null when it does not
 * decode or parse; throws when it cannot be read.
 */
export function readJson(io: GcloudIo, bucket: string, path: string): unknown {
  const url = `gs://${bucket}/${path}`
  const r = spawnSync(io.gcloud, ['storage', 'cat', url], { env: io.env })
  if (r.status !== 0) {
    if (String(r.stderr ?? '').includes(NO_MATCH)) return undefined
    throw new Error(`could not read ${url}: ${String(r.stderr ?? '').trim()}`)
  }
  try {
    return JSON.parse(peelGzipLayers(r.stdout).data.toString('utf-8'))
  } catch (e) {
    if (e instanceof GzipLayerError || e instanceof SyntaxError) return null
    throw e
  }
}

export interface BucketPlanOptions {
  /** Where the date's metadata.json is read: staging, the run's record. */
  metadataBucket: string
  /** The bucket whose objects are planned. */
  bucket: string
  date: string
  /** Names (relative) that must not be removed. */
  keep?: ReadonlySet<string>
  /**
   * Also keep every name this bucket holds for the date (prod: what staging
   * still has). Listed only when the date records a gap.
   */
  keepFromBucket?: string
}

/** The removal plan for one bucket and date. Throws on a failed read. */
export function planBucketGapRemovals(
  io: GcloudIo,
  opts: BucketPlanOptions
): GapRemovalPlan {
  const metadata = readJson(
    io,
    opts.metadataBucket,
    `snapshots/${opts.date}/metadata.json`
  )
  const gaps = sourceGapDistricts(metadata)
  if (gaps.length === 0) {
    return planGapRemovals({
      metadata,
      names: [],
      districtClubs: {},
      keep: new Set(),
    })
  }
  const keep = new Set(opts.keep ?? [])
  if (opts.keepFromBucket) {
    for (const n of listDate(io, opts.keepFromBucket, opts.date)) keep.add(n)
  }
  const names = listDate(io, opts.bucket, opts.date)
  const have = new Set(names)
  const districtClubs: Record<string, number | null> = {}
  for (const id of gaps) {
    const file = `district_${id}.json`
    if (!have.has(file) || keep.has(file)) continue
    const v = readJson(io, opts.bucket, `snapshots/${opts.date}/${file}`)
    if (v !== undefined) districtClubs[id] = districtClubCount(v)
  }
  return planGapRemovals({ metadata, names, districtClubs, keep })
}
