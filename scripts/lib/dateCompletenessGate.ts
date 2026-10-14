/**
 * Per-date completeness gate (#1761, ADR-015 P5.2, migration step 3).
 *
 * The count gate reads two integers, the value gate one file per date, the
 * content gate a 2.4 % sample for shape. None of them asks: for each date
 * this run touched, did staging end up with at least what production
 * already has for that date? So FAC loss (D-1: club records 36 → 25 keys,
 * `clubsByCountry.countries` 158 → 0) and subset rollups (D-2:
 * `totalDistricts` 94 → 1, `clubs` 14 513 → 161) passed every gate.
 *
 * For each touched date this compares staging's `snapshots/<date>/` with
 * production's:
 *   - the object count (names of the missing objects are listed);
 *   - the district count in `manifest.json` and `metadata.json`;
 *   - `global-totals.json`'s club count and `clubsByCountry` country count;
 *   - per sampled district file: the `data` keys, and the key set of the
 *     most complete `clubs[]` / `clubPerformance[]` record.
 * Staging must have at least what prod has. A value prod has and staging
 * lacks is a regression, never a measured zero. A date prod does not have
 * yet has no baseline and passes. Any regression HOLDS promotion (D8)
 * unless `allow_value_changes`, mirroring the value gate (ADR-009 D1).
 *
 * Bounded: lists only the touched dates' directories (metadata) and reads
 * three rollups plus a budgeted sample of district files per date, never a
 * whole date tree. Read-only. The runner is
 * `scripts/date-completeness-gate.ts`.
 *
 * The key-set comparison is a stop-gap until the ADR-014 schemas are strict
 * (lesson: a structural guard must check value honesty, not key presence).
 */

import {
  CONCURRENCY,
  listFlat,
  mapLimit,
  readStored,
  type GateBucket,
} from './promotionContentGateIo.js'
import { isClubContactKey } from '@taverns-red/shared-contracts'
import {
  decodeStoredObject,
  type GcsObjectMeta,
} from './promotionContentGate.js'

/** District files read per run across all dates (each read twice). */
export const DISTRICT_SAMPLE_BUDGET = 200
/** …but never fewer than this per date. */
export const MIN_DISTRICTS_PER_DATE = 3

const DISTRICT_FILE = /^district_([A-Za-z0-9]+)\.json$/

export interface DistrictShape {
  /** Keys of the file's `data` object. */
  dataKeys: string[]
  /** Keys of the most complete `data.clubs[]` record. */
  clubKeys: string[]
  /** Keys of the most complete `data.clubPerformance[]` record. */
  clubPerformanceKeys: string[]
}

/** What one bucket holds for one date. null fields = absent/unreadable. */
export interface DateProfile {
  /** Object names relative to `snapshots/<date>/`. */
  objectNames: string[]
  manifestDistricts: number | null
  metadataDistricts: number | null
  globalClubs: number | null
  globalCountries: number | null
  /** Sampled district id → shape (null = file absent or unreadable). */
  districts: Record<string, DistrictShape | null>
}

export interface DateRegression {
  date: string
  path: string
  reason: string
}

export interface CompletenessGateResult {
  promote: boolean
  allowValueChanges: boolean
  dates: string[]
  /** Dates production has no copy of yet (nothing to compare). */
  newDates: string[]
  districtsSampled: number
  failures: Array<{ path: string; reason: string }>
  /**
   * The dates this verdict holds (#1763: scoped promotion holds only them).
   * Empty on a pass or an allow_value_changes override — and on an error,
   * where `promote: false` with no named date means hold everything.
   */
  heldDates: string[]
  reason: string
}

/** Districts to sample per date so the whole run stays within budget. */
export function perDateSampleSize(dateCount: number): number {
  if (dateCount <= 0) return 0
  return Math.max(
    MIN_DISTRICTS_PER_DATE,
    Math.floor(DISTRICT_SAMPLE_BUDGET / dateCount)
  )
}

/** `n` ids spread evenly over the sorted list (all of them when n ≥ length). */
export function sampleDistricts(ids: readonly string[], n: number): string[] {
  if (n >= ids.length) return [...ids]
  if (n <= 0) return []
  const step = ids.length / n
  return Array.from({ length: n }, (_, i) => ids[Math.floor(i * step)]!)
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/**
 * Keys of the record with the most keys (the best-enriched one). The retired
 * club contact keys (#2026) are left out: writers no longer emit them, so
 * their absence against a prod object written earlier is not a regression.
 */
function richestKeys(records: unknown): string[] {
  if (!Array.isArray(records)) return []
  let best: string[] = []
  for (const r of records) {
    if (!isRecord(r)) continue
    const keys = Object.keys(r).filter(k => !isClubContactKey(k))
    if (keys.length > best.length) best = keys
  }
  return [...best].sort()
}

/** Shape of a `district_<id>.json` snapshot, null when it is not one. */
export function districtShape(value: unknown): DistrictShape | null {
  if (!isRecord(value) || !isRecord(value.data)) return null
  const data = value.data
  return {
    dataKeys: Object.keys(data).sort(),
    clubKeys: richestKeys(data.clubs),
    clubPerformanceKeys: richestKeys(data.clubPerformance),
  }
}

export function manifestDistricts(value: unknown): number | null {
  return isRecord(value) ? num(value.successfulDistricts) : null
}

export function metadataDistricts(value: unknown): number | null {
  return isRecord(value) && Array.isArray(value.successfulDistricts)
    ? value.successfulDistricts.length
    : null
}

export function globalClubs(value: unknown): number | null {
  return isRecord(value) && isRecord(value.membership)
    ? num(value.membership.clubsCounted)
    : null
}

export function globalCountries(value: unknown): number | null {
  if (!isRecord(value) || !isRecord(value.clubsByCountry)) return null
  const countries = value.clubsByCountry.countries
  return Array.isArray(countries) ? countries.length : null
}

/** Ids of the per-district snapshot files in a date's object list. */
export function districtIdsIn(objectNames: readonly string[]): string[] {
  return objectNames
    .map(n => DISTRICT_FILE.exec(n)?.[1])
    .filter((id): id is string => id !== undefined)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

const MAX_NAMED = 10

function listed(names: readonly string[]): string {
  const head = names.slice(0, MAX_NAMED).join(', ')
  return names.length > MAX_NAMED
    ? `${head} …and ${names.length - MAX_NAMED} more`
    : head
}

/** Every way staging has less than prod for one date. */
export function compareDateProfiles(
  date: string,
  prod: DateProfile | null,
  staging: DateProfile | null
): DateRegression[] {
  const dir = `snapshots/${date}/`
  if (!prod) return []
  if (!staging) {
    return [
      {
        date,
        path: dir,
        reason: `${date}: touched by this run but staging has no objects (production has ${prod.objectNames.length})`,
      },
    ]
  }

  const out: DateRegression[] = []
  const push = (file: string, reason: string) =>
    out.push({ date, path: `${dir}${file}`, reason: `${date}: ${reason}` })

  if (staging.objectNames.length < prod.objectNames.length) {
    const have = new Set(staging.objectNames)
    const missing = prod.objectNames.filter(n => !have.has(n))
    out.push({
      date,
      path: dir,
      reason:
        `${date}: ${staging.objectNames.length} object(s) in staging vs ${prod.objectNames.length} in production` +
        (missing.length ? `; missing ${listed(missing)}` : ''),
    })
  }

  const counts: Array<[string, string, number | null, number | null]> = [
    [
      'manifest.json',
      'successfulDistricts',
      prod.manifestDistricts,
      staging.manifestDistricts,
    ],
    [
      'metadata.json',
      'successfulDistricts',
      prod.metadataDistricts,
      staging.metadataDistricts,
    ],
    [
      'global-totals.json',
      'membership.clubsCounted',
      prod.globalClubs,
      staging.globalClubs,
    ],
    [
      'global-totals.json',
      'clubsByCountry.countries',
      prod.globalCountries,
      staging.globalCountries,
    ],
  ]
  for (const [file, field, p, s] of counts) {
    if (p === null) continue
    if (s === null) {
      push(file, `${field} is absent in staging (production has ${p})`)
    } else if (s < p) {
      push(file, `${field} ${p} → ${s}`)
    }
  }

  for (const [id, p] of Object.entries(prod.districts)) {
    if (!p) continue
    const file = `district_${id}.json`
    const s = staging.districts[id]
    if (!s) {
      push(file, 'absent or unreadable in staging')
      continue
    }
    const kinds: Array<[string, string[], string[]]> = [
      ['data', p.dataKeys, s.dataKeys],
      ['clubs[] record', p.clubKeys, s.clubKeys],
      [
        'clubPerformance[] record',
        p.clubPerformanceKeys,
        s.clubPerformanceKeys,
      ],
    ]
    for (const [label, pk, sk] of kinds) {
      const have = new Set(sk)
      const dropped = pk.filter(k => !have.has(k))
      if (dropped.length) {
        push(
          file,
          `${label} dropped ${dropped.length} key(s): ${listed(dropped)} (${pk.length} → ${sk.length})`
        )
      }
    }
  }
  return out
}

export function evaluateCompletenessGate(input: {
  dates: string[]
  regressions: DateRegression[]
  allowValueChanges: boolean
  newDates?: string[]
  districtsSampled?: number
  error?: string
}): CompletenessGateResult {
  const failures = input.regressions.map(r => ({
    path: r.path,
    reason: r.reason,
  }))
  const base = {
    allowValueChanges: input.allowValueChanges,
    dates: input.dates,
    newDates: input.newDates ?? [],
    districtsSampled: input.districtsSampled ?? 0,
    heldDates: [] as string[],
  }
  if (input.error) {
    return {
      ...base,
      promote: false,
      failures: [{ path: '(gate)', reason: input.error }],
      reason: `completeness gate could not run — failing closed: ${input.error}`,
    }
  }
  if (input.dates.length === 0) {
    return {
      ...base,
      promote: true,
      failures,
      reason: 'no dates touched by this run — nothing to compare',
    }
  }
  const held = [...new Set(input.regressions.map(r => r.date))].sort()
  if (held.length === 0) {
    return {
      ...base,
      promote: true,
      failures,
      reason: `all ${input.dates.length} touched date(s) have at least what production has`,
    }
  }
  const what = `${held.length} of ${input.dates.length} touched date(s) regress against production (${held.join(', ')})`
  return input.allowValueChanges
    ? {
        ...base,
        promote: true,
        failures,
        reason: `${what} — promoting anyway: allow_value_changes is set`,
      }
    : {
        ...base,
        promote: false,
        failures,
        heldDates: held,
        reason: `HOLD — ${what}`,
      }
}

const MAX_LISTED = 300

export function buildCompletenessGateSummary(
  result: CompletenessGateResult
): string {
  const verdict = result.promote
    ? result.failures.length
      ? '⚠️ pass (overridden)'
      : '✅ pass'
    : '❌ **HOLD**'
  const lines = [
    '## 📏 Completeness gate (touched dates vs production, #1761)',
    '',
    `- **Result**: ${verdict} — ${result.reason}`,
    `- Touched dates: ${result.dates.length ? result.dates.join(', ') : '—'}`,
    `- New in this run (no production baseline): ${result.newDates.length ? result.newDates.join(', ') : '—'}`,
    `- District files sampled per bucket: ${result.districtsSampled}`,
    '- Asserted: object count, `manifest`/`metadata` district counts, `global-totals` clubs and countries, district `data` keys and the most complete club record’s keys — staging ≥ production.',
    '',
  ]
  if (result.failures.length) {
    lines.push('| Object | Regression |', '| --- | --- |')
    const cell = (s: string) => s.replaceAll('|', '\\|')
    for (const f of result.failures.slice(0, MAX_LISTED)) {
      lines.push(`| ${cell(f.path)} | ${cell(f.reason)} |`)
    }
    if (result.failures.length > MAX_LISTED) {
      lines.push(`| … | ${result.failures.length - MAX_LISTED} more |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

// ── Bucket I/O ──────────────────────────────────────────────────────────────

async function readJson(
  bucket: GateBucket,
  meta: GcsObjectMeta | undefined
): Promise<unknown> {
  if (!meta) return undefined
  const decoded = decodeStoredObject(
    await readStored(bucket, meta.name, meta.contentEncoding)
  )
  return decoded.ok ? decoded.value : undefined
}

/** One bucket's view of one date, reading only the rollups and `sample`. */
async function profileDate(
  bucket: GateBucket,
  dir: string,
  listing: GcsObjectMeta[],
  sample: readonly string[]
): Promise<DateProfile | null> {
  if (listing.length === 0) return null
  const byName = new Map(listing.map(o => [o.name.slice(dir.length), o]))
  const [manifest, metadata, totals] = await Promise.all(
    ['manifest.json', 'metadata.json', 'global-totals.json'].map(f =>
      readJson(bucket, byName.get(f))
    )
  )
  const shapes = await mapLimit(sample, CONCURRENCY, async id =>
    districtShape(await readJson(bucket, byName.get(`district_${id}.json`)))
  )
  return {
    objectNames: [...byName.keys()].sort(),
    manifestDistricts: manifestDistricts(manifest),
    metadataDistricts: metadataDistricts(metadata),
    globalClubs: globalClubs(totals),
    globalCountries: globalCountries(totals),
    districts: Object.fromEntries(sample.map((id, i) => [id, shapes[i]!])),
  }
}

/** Compare every touched date, staging vs prod. Throws on listing errors. */
export async function runCompletenessGate(
  staging: GateBucket,
  prod: GateBucket,
  dates: readonly string[],
  opts: { allowValueChanges: boolean; log?: (msg: string) => void }
): Promise<CompletenessGateResult> {
  const log = opts.log ?? (() => {})
  const perDate = perDateSampleSize(dates.length)
  const regressions: DateRegression[] = []
  const newDates: string[] = []
  let districtsSampled = 0

  // Dates one at a time (each fans out to CONCURRENCY reads) so memory stays
  // bounded to one date's sample.
  for (const date of dates) {
    const dir = `snapshots/${date}/`
    const [stagingList, prodList] = await Promise.all([
      listFlat(staging, dir),
      listFlat(prod, dir),
    ])
    const prodIds = districtIdsIn(prodList.map(o => o.name.slice(dir.length)))
    const sample = sampleDistricts(prodIds, perDate)
    const [p, s] = await Promise.all([
      profileDate(prod, dir, prodList, sample),
      profileDate(staging, dir, stagingList, sample),
    ])
    if (!p) newDates.push(date)
    else districtsSampled += sample.length
    const found = compareDateProfiles(date, p, s)
    regressions.push(...found)
    log(
      `[completeness-gate] ${date}: ${stagingList.length} staging / ${prodList.length} prod objects, ` +
        `${p ? `${sample.length} district(s) sampled, ${found.length} regression(s)` : 'new date (no production baseline)'}`
    )
  }

  return evaluateCompletenessGate({
    dates: [...dates],
    regressions,
    allowValueChanges: opts.allowValueChanges,
    newDates,
    districtsSampled,
  })
}
