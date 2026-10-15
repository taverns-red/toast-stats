/**
 * One-off prune of a #1671 gap district's stale per-district objects
 * (#2038).
 *
 * The 2026-06-11 build wrote `district_<id>.json` and its analytics from
 * TI's HTML error page for district U (2017-02..2020-07 closing raws) and
 * 102 (2017-01..05): 0 clubs, `clubPerformance[]` made of HTML lines. Since
 * #2036 a rebuild records those districts as gaps and writes nothing for
 * them, but uploads and promotion only add files, so the junk stays on
 * staging and prod.
 *
 * A one-off tool rather than a pipeline-side delete: the stale set is
 * bounded and historical (transform no longer writes a gap district's
 * files, so it cannot recur), and a delete step in every run and in
 * promotion would be a new class of unattended, irreversible prod writes.
 * Each run is dispatched by hand with Ron's approval, dry run by default.
 *
 * What it removes, and nothing else:
 * - only districts the target bucket's OWN `metadata.json` records as a
 *   source gap (`sourceGapDistricts`: failed, with an `<id>: Skipped: `
 *   reason, not also successful);
 * - only while that district's `district_<id>.json` is the 0-club junk; a
 *   file with clubs, an unreadable one, or none at all keeps everything;
 * - only `district_<id>.json` and `analytics/district_<id>_*.json` of that
 *   date;
 * - each delete conditional on the listed generation (a concurrent writer
 *   wins and is reported);
 * - analytics first, the district file last, and the district file only
 *   once every sibling is gone, so a re-run after a partial failure can
 *   still prove the district is junk.
 *
 * Audit rows hold paths, generations, md5s, sizes and our own reasons;
 * never object content.
 */

import { sourceGapDistricts, districtObjectId } from './sourceGap.js'
import type { StoredObjectMeta } from './stripClubContact.js'
import {
  GzipLayerError,
  peelGzipLayers,
} from '../../packages/collector-cli/src/utils/gzipLayers.js'

/** A date recording more gaps than this is refused, not pruned. */
export const MAX_GAPS_PER_DATE = 5

/** The bucket operations the prune needs. */
export interface PruneIo {
  /** Every object under `prefix`, with its generation. */
  list(prefix: string): Promise<StoredObjectMeta[]>
  /** The stored bytes (gzip layer intact) of that exact generation. */
  read(name: string, generation: string): Promise<Buffer>
  /** Delete the object only if its live generation is `ifGenerationMatch`. */
  delete(name: string, ifGenerationMatch: string): Promise<void>
}

export interface PruneRow {
  bucket: string
  date: string
  districtId: string | null
  path: string
  /** planned: a dry run would delete; kept: refused, left in place. */
  action: 'planned' | 'deleted' | 'kept' | 'error'
  generation: string | null
  md5: string | null
  size: string | null
  reason: string
}

export interface PruneSummary {
  bucket: string
  dryRun: boolean
  dates: string[]
  /** Districts recorded as a gap, across all dates (`<date>:<id>`). */
  gapDistricts: string[]
  planned: number
  deleted: number
  kept: number
  errors: number
}

export interface PruneOptions {
  bucket: string
  dates: string[]
  dryRun: boolean
}

/** A failure whose message is ours and holds no object content. */
class PruneError extends Error {}

function decodeJson(stored: Buffer): unknown {
  let text: string
  try {
    text = peelGzipLayers(stored).data.toString('utf-8')
  } catch (err) {
    if (err instanceof GzipLayerError) {
      throw new PruneError('gzip layer does not inflate')
    }
    throw err
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new PruneError('object is not JSON')
  }
}

/** A loggable message for any failure: never content. */
function safeError(err: unknown): string {
  if (err instanceof PruneError) return err.message
  const code = (err as { code?: unknown }).code
  if (typeof code === 'number') return `HTTP ${code}`
  if (typeof code === 'string') return `error ${code}`
  return err instanceof Error ? err.name : 'unknown error'
}

/** `data.clubs` length, or null when the value is not a district snapshot. */
function clubCount(value: unknown): number | null {
  const data = (value as { data?: { clubs?: unknown } } | null)?.data
  return data && Array.isArray(data.clubs) ? data.clubs.length : null
}

const byName = (a: StoredObjectMeta, b: StoredObjectMeta) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0

async function pruneDate(
  io: PruneIo,
  date: string,
  opts: PruneOptions,
  gapsOut: string[]
): Promise<PruneRow[]> {
  const dir = `snapshots/${date}/`
  const row = (
    meta: StoredObjectMeta | { name: string },
    districtId: string | null,
    action: PruneRow['action'],
    reason: string
  ): PruneRow => {
    const m = meta as Partial<StoredObjectMeta>
    return {
      bucket: opts.bucket,
      date,
      districtId,
      path: meta.name,
      action,
      generation: m.generation ?? null,
      md5: m.md5Hash ?? null,
      size: m.size ?? null,
      reason,
    }
  }

  const listing = await io.list(dir)
  const metaObj = listing.find(o => o.name === `${dir}metadata.json`)
  if (!metaObj) {
    return [
      row({ name: `${dir}metadata.json` }, null, 'error', 'no metadata.json'),
    ]
  }
  let gaps: string[]
  try {
    gaps = sourceGapDistricts(
      decodeJson(await io.read(metaObj.name, metaObj.generation))
    )
  } catch (err) {
    return [row(metaObj, null, 'error', `metadata.json: ${safeError(err)}`)]
  }
  if (gaps.length > MAX_GAPS_PER_DATE) {
    return [
      row(
        metaObj,
        null,
        'error',
        `metadata.json records ${gaps.length} source gaps (more than ${MAX_GAPS_PER_DATE}); refusing the date`
      ),
    ]
  }

  const rows: PruneRow[] = []
  for (const id of gaps) {
    gapsOut.push(`${date}:${id}`)
    const own = listing
      .filter(o => districtObjectId(o.name.slice(dir.length)) === id)
      .sort(byName)
    if (own.length === 0) continue
    const districtFile = own.find(o => o.name === `${dir}district_${id}.json`)
    // Analytics first; the district file, the junk witness, last.
    const siblings = own.filter(o => o !== districtFile)
    const keepAll = (reason: string) =>
      own.forEach(o => rows.push(row(o, id, 'kept', reason)))

    if (!districtFile) {
      keepAll(
        `district_${id}.json is absent, so nothing proves the district is junk`
      )
      continue
    }
    let clubs: number | null
    try {
      clubs = clubCount(
        decodeJson(await io.read(districtFile.name, districtFile.generation))
      )
    } catch (err) {
      own.forEach(o =>
        rows.push(row(o, id, 'error', `district_${id}.json: ${safeError(err)}`))
      )
      continue
    }
    if (clubs !== 0) {
      keepAll(
        clubs === null
          ? `district_${id}.json is not a district snapshot`
          : `district_${id}.json has ${clubs} club(s) — not the 0-club junk this prune removes`
      )
      continue
    }

    const reason = `metadata.json records ${id} as a #1671 source gap; district_${id}.json has 0 clubs`
    if (opts.dryRun) {
      own.forEach(o => rows.push(row(o, id, 'planned', reason)))
      continue
    }
    let failed = false
    for (const o of siblings) {
      try {
        await io.delete(o.name, o.generation)
        rows.push(row(o, id, 'deleted', reason))
      } catch (err) {
        failed = true
        rows.push(row(o, id, 'error', `delete: ${safeError(err)}`))
      }
    }
    if (failed) {
      rows.push(
        row(
          districtFile,
          id,
          'kept',
          'a sibling delete failed; kept so a re-run can prove the district is junk'
        )
      )
      continue
    }
    try {
      await io.delete(districtFile.name, districtFile.generation)
      rows.push(row(districtFile, id, 'deleted', reason))
    } catch (err) {
      rows.push(row(districtFile, id, 'error', `delete: ${safeError(err)}`))
    }
  }
  return rows
}

/** Prune each date in turn. A date's failure is a row, not a throw. */
export async function runPrune(
  io: PruneIo,
  opts: PruneOptions
): Promise<{ rows: PruneRow[]; summary: PruneSummary }> {
  const rows: PruneRow[] = []
  const gapDistricts: string[] = []
  for (const date of opts.dates) {
    rows.push(...(await pruneDate(io, date, opts, gapDistricts)))
  }
  const count = (action: PruneRow['action']) =>
    rows.filter(r => r.action === action).length
  return {
    rows,
    summary: {
      bucket: opts.bucket,
      dryRun: opts.dryRun,
      dates: opts.dates,
      gapDistricts,
      planned: count('planned'),
      deleted: count('deleted'),
      kept: count('kept'),
      errors: count('error'),
    },
  }
}

/** One JSON row per line, newline-terminated. */
export function toJsonl(rows: readonly PruneRow[]): string {
  return rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')
}
