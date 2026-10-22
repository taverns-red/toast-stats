/**
 * FindAClubCarryForward — re-applies the Find-A-Club enrichment a date's
 * existing snapshot already holds onto a re-derived copy of it (#2237).
 *
 * A rebuild re-transforms a date from its raw CSVs, which carry no FAC
 * fields; the per-date loop then merges the persisted raw-fac/<date>/. But
 * raw-fac persistence (#1758) began on 2026-10-11, and the dailies from
 * 2026-05-15 to 2026-10-10 enriched their dates with nothing persisted. For
 * those dates the existing snapshot is the only record of the enrichment,
 * so it is carried forward from there rather than stripped.
 *
 * Semantics:
 *
 *   - The rebuilt snapshot is the spine: rows are neither added nor removed,
 *     and every non-FAC field keeps its rebuilt value.
 *   - For each row of `clubPerformance[]` (keyed by `Club Number`) and
 *     `clubs[]` (keyed by `clubId`), both canonicalized with
 *     `normalizeClubId` (#1440), the FAC fields the prior row holds are
 *     copied over. A club the prior snapshot did not match gets nothing.
 *   - Carried free text goes through the same scrubs a fresh FAC parse
 *     applies (normaliseTiClub: scrubFacStreet, scrubFacText,
 *     scrubFacLocation; #2069, #2157, #2167), so a staging copy written under
 *     older rules is never re-published unscrubbed. Contact fields never
 *     come along (#2026).
 *   - `data.prospectiveClubs` (the FAC-only clubs, #489) is carried, less any
 *     club the rebuild now lists (the merger's own rule: prospective means
 *     "in FAC, not in the snapshot", joined by canonical id), with its free
 *     text scrubbed.
 *   - A prior snapshot that is not enriched, or a rebuilt one that is
 *     already merged (`prospectiveClubs` present), is returned unchanged.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import {
  normalizeClubId,
  omitClubContactFields,
} from '@taverns-red/shared-contracts'
import {
  TI_CLUB_NUMBER_KEY,
  type DistrictSnapshot,
} from '../types/findAClub.js'
import {
  scrubFacLocation,
  scrubFacStreet,
  scrubFacText,
} from './FacMeetingSchedule.js'

/**
 * The fields mergeFacIntoSnapshot writes onto both a `clubPerformance[]` row
 * and a `clubs[]` row. A test pins this against the merger's output.
 */
export const FAC_ROW_FIELDS: readonly string[] = [
  'charterDate',
  'coordinates',
  'meetsOnline',
  'address',
  'website',
  'facebookLink',
  'twitterLink',
  'meetingDay',
  'meetingTime',
  'allowsVirtualAttendance',
  'isProspective',
]

/** The fields the merger writes onto `clubs[]` rows only (#1789). */
export const FAC_PARSED_ONLY_FIELDS: readonly string[] = [
  'location',
  'meetingSchedule',
]

type Row = Record<string, unknown>

function dataOf(snapshot: unknown): Row | undefined {
  if (typeof snapshot !== 'object' || snapshot === null) return undefined
  const data = (snapshot as Row)['data']
  return typeof data === 'object' && data !== null ? (data as Row) : undefined
}

function rowsOf(data: Row | undefined, key: string): Row[] {
  const rows = data?.[key]
  return Array.isArray(rows)
    ? rows.filter((r): r is Row => typeof r === 'object' && r !== null)
    : []
}

/**
 * Whether a district snapshot was merged with FAC: the merge always writes
 * `data.prospectiveClubs` (even empty). The rebuilt side is judged by this
 * mark alone — a transform writes `clubs[].charterDate` itself when a CSV
 * has a Charter Date column, so a FAC-named field proves nothing there.
 */
export function isFacMerged(snapshot: unknown): boolean {
  return Array.isArray(dataOf(snapshot)?.['prospectiveClubs'])
}

/**
 * Whether a (prior) district snapshot carries any FAC enrichment: the merge
 * mark, or a row with a FAC field.
 */
export function isFacEnriched(snapshot: unknown): boolean {
  const data = dataOf(snapshot)
  if (!data) return false
  if (isFacMerged(snapshot)) return true
  return ['clubs', 'clubPerformance'].some(key =>
    rowsOf(data, key).some(row => FAC_ROW_FIELDS.some(f => f in row))
  )
}

/** Free text through `scrub`; the key is dropped when nothing is left. */
function scrubKey(
  row: Row,
  key: string,
  scrub: (raw: string) => string | undefined
): void {
  const value = row[key]
  if (typeof value !== 'string') return
  const clean = scrub(value)
  if (clean === undefined) delete row[key]
  else row[key] = clean
}

/** A carried location is already lines joined by "\n": scrub each line. */
function scrubCarriedLocation(raw: string): string | undefined {
  const lines = raw
    .split('\n')
    .map(line => scrubFacLocation(line))
    .filter((line): line is string => line !== undefined)
  return lines.length > 0 ? lines.join('\n') : undefined
}

/** The carried FAC fields of one row, scrubbed as normaliseTiClub would. */
function scrubCarried(picked: Row): Row {
  const out: Row = { ...picked }
  const address = out['address']
  if (typeof address === 'object' && address !== null) {
    const a: Row = { ...(address as Row) }
    scrubKey(a, 'street', scrubFacStreet)
    for (const k of ['city', 'region', 'postalCode'])
      scrubKey(a, k, scrubFacText)
    if (Object.keys(a).length > 0) out['address'] = a
    else delete out['address']
  }
  scrubKey(out, 'meetingDay', scrubFacText)
  scrubKey(out, 'meetingTime', scrubFacText)
  scrubKey(out, 'location', scrubCarriedLocation)
  return out
}

/** A carried prospective club, its free text scrubbed (projectProspectiveClub). */
function scrubProspective(club: Row): Row {
  const out: Row = { ...club }
  for (const k of ['city', 'region', 'meetingDay', 'meetingTime']) {
    scrubKey(out, k, scrubFacText)
  }
  return omitClubContactFields(out)
}

/** The FAC fields of each prior row, by canonical club id. */
function facFieldsById(
  rows: Row[],
  idKey: string,
  fields: readonly string[]
): Map<string, Row> {
  const byId = new Map<string, Row>()
  for (const row of rows) {
    const id = normalizeClubId(row[idKey])
    if (!id) continue
    const picked: Row = {}
    for (const f of fields) if (f in row) picked[f] = row[f]
    if (Object.keys(picked).length > 0) byId.set(id, picked)
  }
  return byId
}

export interface CarryForwardResult {
  snapshot: DistrictSnapshot
  /** Rebuilt rows (clubs[] plus clubPerformance[]) that received FAC fields. */
  carried: number
  /** Prior rows that held FAC fields: carried 0 of N > 0 is a join failure. */
  priorRows: number
  /** Prior prospective clubs dropped because the rebuild lists them. */
  prospectiveDropped: number
}

/**
 * Carry the FAC enrichment of `prior` (the date's existing snapshot) onto
 * `rebuilt` (the same date, re-derived).
 */
export function carryForwardFac(
  rebuilt: DistrictSnapshot,
  prior: DistrictSnapshot
): CarryForwardResult {
  const unchanged = {
    snapshot: rebuilt,
    carried: 0,
    priorRows: 0,
    prospectiveDropped: 0,
  }
  if (!isFacEnriched(prior) || isFacMerged(rebuilt)) return unchanged
  const priorData = dataOf(prior)
  const rebuiltData = dataOf(rebuilt)
  if (!rebuiltData) return unchanged

  let carried = 0
  let priorRows = 0
  const carry = (
    key: string,
    idKey: string,
    fields: readonly string[]
  ): unknown[] | undefined => {
    const fac = facFieldsById(rowsOf(priorData, key), idKey, fields)
    priorRows += fac.size
    const rows = rebuiltData[key]
    if (!Array.isArray(rows)) return undefined
    return rows.map(raw => {
      if (typeof raw !== 'object' || raw === null) return raw
      const row = raw as Row
      const id = normalizeClubId(row[idKey])
      const picked = id ? fac.get(id) : undefined
      if (!picked) return omitClubContactFields(row)
      carried += 1
      return omitClubContactFields({ ...row, ...scrubCarried(picked) })
    })
  }

  const clubPerformance = carry(
    'clubPerformance',
    TI_CLUB_NUMBER_KEY,
    FAC_ROW_FIELDS
  )
  const clubs = carry('clubs', 'clubId', [
    ...FAC_ROW_FIELDS,
    ...FAC_PARSED_ONLY_FIELDS,
  ])

  // Prospective = in FAC but not in the snapshot (FindAClubMerger): a club
  // the rebuild lists has chartered since, and is not double-listed.
  const rebuiltIds = new Set<string>()
  for (const r of rowsOf(rebuiltData, 'clubs')) {
    const id = normalizeClubId(r['clubId'])
    if (id) rebuiltIds.add(id)
  }
  for (const r of rowsOf(rebuiltData, 'clubPerformance')) {
    const id = normalizeClubId(r[TI_CLUB_NUMBER_KEY])
    if (id) rebuiltIds.add(id)
  }
  const priorProspective = priorData?.['prospectiveClubs']
  let prospectiveDropped = 0
  let prospectiveClubs: Row[] | undefined
  if (Array.isArray(priorProspective)) {
    prospectiveClubs = []
    for (const p of priorProspective) {
      if (typeof p !== 'object' || p === null) continue
      const id = normalizeClubId((p as Row)['clubId'])
      if (id && rebuiltIds.has(id)) {
        prospectiveDropped += 1
        continue
      }
      prospectiveClubs.push(scrubProspective(p as Row))
    }
  }

  return {
    snapshot: {
      ...rebuilt,
      data: {
        ...rebuiltData,
        ...(clubPerformance !== undefined && { clubPerformance }),
        ...(clubs !== undefined && { clubs }),
        // Always written when the prior was merged, as the merge does.
        prospectiveClubs: prospectiveClubs ?? [],
      },
    } as DistrictSnapshot,
    carried,
    priorRows,
    prospectiveDropped,
  }
}

/* ── The directory command (collector-cli carry-forward-find-a-club) ── */

type Outcome = 'carried' | 'alreadyEnriched' | 'priorUnenriched'

export interface CarryForwardDirSummary {
  /** Rebuilt districts with an existing copy in the source directory. */
  totalDistricts: number
  /** Of those, the ones whose existing copy is enriched. */
  priorEnriched: number
  /** Districts rewritten with FAC fields carried onto them. */
  carried: number
  /** Rows carried, over every district. */
  rowsCarried: number
  /** Districts whose rebuilt file was already merged: left alone. */
  alreadyEnriched: number
  failed: number
  results: Array<{
    districtId: string
    ok: boolean
    outcome?: Outcome
    rows?: number
    prospectiveDropped?: number
    error?: string
  }>
}

/** A downloaded object may still be gzip (a gcloud that does not inflate). */
async function readJson(file: string): Promise<unknown> {
  const bytes = await readFile(file)
  const text =
    bytes[0] === 0x1f && bytes[1] === 0x8b
      ? gunzipSync(bytes).toString('utf-8')
      : bytes.toString('utf-8')
  return JSON.parse(text)
}

const DISTRICT_FILE = /^district_([A-Za-z0-9]+)\.json$/

/**
 * For every district_<id>.json in `snapshotDir` with a counterpart in
 * `fromDir`, carry the counterpart's FAC fields onto it in place. A district
 * fails (and is not rewritten) when its counterpart cannot be read, or is
 * enriched with FAC rows of which none matched the rebuild: carrying 0 rows
 * is the strip, never a success.
 */
export async function carryForwardFacDir(options: {
  fromDir: string
  snapshotDir: string
  log?: (line: string) => void
}): Promise<CarryForwardDirSummary> {
  const ids = (await readdir(options.snapshotDir))
    .map(f => DISTRICT_FILE.exec(f)?.[1])
    .filter((id): id is string => Boolean(id))
    .sort()
  const results: CarryForwardDirSummary['results'] = []
  let priorEnriched = 0

  for (const districtId of ids) {
    const file = `district_${districtId}.json`
    let prior: unknown
    try {
      prior = await readJson(join(options.fromDir, file))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue
      const message = err instanceof Error ? err.message : String(err)
      results.push({ districtId, ok: false, error: message })
      options.log?.(`[ERROR] district ${districtId}: ${message}`)
      continue
    }
    try {
      const snapshotPath = join(options.snapshotDir, file)
      const rebuilt = (await readJson(snapshotPath)) as DistrictSnapshot
      if (!isFacEnriched(prior)) {
        results.push({ districtId, ok: true, outcome: 'priorUnenriched' })
        continue
      }
      priorEnriched += 1
      if (isFacMerged(rebuilt)) {
        results.push({ districtId, ok: true, outcome: 'alreadyEnriched' })
        continue
      }
      const result = carryForwardFac(rebuilt, prior as DistrictSnapshot)
      if (result.priorRows > 0 && result.carried === 0) {
        throw new Error(
          `the existing copy has ${result.priorRows} FAC row(s) and none matched the rebuild`
        )
      }
      await writeFile(
        snapshotPath,
        JSON.stringify(result.snapshot, null, 2),
        'utf-8'
      )
      results.push({
        districtId,
        ok: true,
        outcome: 'carried',
        rows: result.carried,
        prospectiveDropped: result.prospectiveDropped,
      })
      options.log?.(
        `[INFO] district ${districtId}: carried ${result.carried} of ${result.priorRows} row(s), dropped ${result.prospectiveDropped} chartered prospective(s)`
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({ districtId, ok: false, error: message })
      options.log?.(`[ERROR] district ${districtId}: ${message}`)
    }
  }

  const count = (o: Outcome): number =>
    results.filter(r => r.outcome === o).length
  return {
    totalDistricts: results.length,
    priorEnriched,
    carried: count('carried'),
    rowsCarried: results.reduce((s, r) => s + (r.rows ?? 0), 0),
    alreadyEnriched: count('alreadyEnriched'),
    failed: results.filter(r => !r.ok).length,
    results,
  }
}
