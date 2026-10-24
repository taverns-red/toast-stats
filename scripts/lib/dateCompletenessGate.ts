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
 *   - the object count (names of the missing objects are listed), not
 *     counting the per-district analytics files compute retired (#1798):
 *     prod keeps old copies of those, staging no longer writes them;
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
 * Plus, for a date in the Find-A-Club era, the FAC continuity check
 * (#2239 AC3, ./facContinuity.ts): a sample of staging's district files
 * against the best of prod's copy and the 3 nearest earlier prod dates, and
 * a floor no stripped baseline can satisfy. It reads prod's `v1/dates.json`
 * (failing closed without it) and lists those earlier dates.
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
import { isRetiredAnalyticsFile } from '../../packages/collector-cli/src/utils/retiredAnalyticsFiles.js'
import { districtObjectId, sourceGapDistricts } from './sourceGap.js'
import {
  compareFacContinuity,
  facBaselineDates,
  facCheckApplies,
  facCoverage,
  FAC_HOLD_MIN_DISTRICTS,
  type FacBaseline,
  type FacCoverage,
} from './facContinuity.js'

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
  /** `metadata.json`'s successfulDistricts (absent when unreadable). */
  metadataDistrictIds?: string[]
  /** Districts `metadata.json` records as a #1671 source gap (#2038). */
  gapDistricts?: string[]
  /**
   * District id → `data.clubs` length of its file, for the ids read
   * (null = unreadable or not a district snapshot).
   */
  clubCounts?: Record<string, number | null>
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
  /**
   * Find-A-Club losses too narrow to hold (#2239, "warn on few, hold on
   * many"): the date still promotes, and the runner raises them loudly.
   */
  warnings: Array<{ path: string; reason: string }>
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

/** `data.clubs` length of a district snapshot, null when it is not one. */
export function districtClubCount(value: unknown): number | null {
  return isRecord(value) &&
    isRecord(value.data) &&
    Array.isArray(value.data.clubs)
    ? value.data.clubs.length
    : null
}

export function metadataDistrictIds(value: unknown): string[] | undefined {
  return isRecord(value) && Array.isArray(value.successfulDistricts)
    ? value.successfulDistricts.filter(
        (id): id is string => typeof id === 'string'
      )
    : undefined
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

  // Retired names are dropped from both sides: prod's old copies are not
  // owed, and staging's stale copies must not pad its count (#1798).
  const prodObjects = prod.objectNames.filter(n => !isRetiredAnalyticsFile(n))
  const stagingObjects = staging.objectNames.filter(
    n => !isRetiredAnalyticsFile(n)
  )

  // A district staging records as a #1671 source gap (#2038) is accounted
  // for, not lost, when production has nothing real for it: no file, or the
  // 0-club junk an earlier build wrote from TI's HTML error page. Its
  // objects may be missing from staging, and it stands in for itself in the
  // district counts, only where production counted it. A gap production has
  // real clubs for (or cannot read) is a regression.
  const prodNames = new Set(prodObjects)
  const excused = new Set<string>()
  for (const id of staging.gapDistricts ?? []) {
    const file = `district_${id}.json`
    if (!prodNames.has(file)) {
      excused.add(id)
      continue
    }
    const clubs = prod.clubCounts?.[id]
    if (clubs === 0) excused.add(id)
    else if (typeof clubs === 'number') {
      push(
        file,
        `staging records ${id} as a #1671 source gap but production has ${clubs} club(s) for it — a lost district, not a known gap`
      )
    } else {
      push(
        file,
        `staging records ${id} as a #1671 source gap but production's copy could not be read — not excused`
      )
    }
  }
  const prodCounted = new Set(prod.metadataDistrictIds ?? [])
  const gapCredit = [...excused].filter(id => prodCounted.has(id)).length
  const isExcused = (name: string) => {
    const id = districtObjectId(name)
    return id !== null && excused.has(id)
  }

  const have = new Set(stagingObjects)
  const missing = prodObjects.filter(n => !have.has(n))
  const excusedMissing = missing.filter(isExcused).length
  if (stagingObjects.length + excusedMissing < prodObjects.length) {
    const unexcused = missing.filter(n => !isExcused(n))
    out.push({
      date,
      path: dir,
      reason:
        `${date}: ${stagingObjects.length} object(s) in staging vs ${prodObjects.length} in production` +
        (unexcused.length ? `; missing ${listed(unexcused)}` : ''),
    })
  }

  const credited = (n: number | null) => (n === null ? null : n + gapCredit)
  const counts: Array<[string, string, number | null, number | null]> = [
    [
      'manifest.json',
      'successfulDistricts',
      prod.manifestDistricts,
      credited(staging.manifestDistricts),
    ],
    [
      'metadata.json',
      'successfulDistricts',
      prod.metadataDistricts,
      credited(staging.metadataDistricts),
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
    if (!s && excused.has(id)) continue
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
  warnings?: DateRegression[]
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
    warnings: (input.warnings ?? []).map(r => ({
      path: r.path,
      reason: r.reason,
    })),
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
  const what = `${held.length} of ${input.dates.length} touched date(s) regress against production or, for Find-A-Club, against earlier dates (${held.join(', ')})`
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

const cell = (s: string) => s.replaceAll('|', '\\|')

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
    '- Asserted: object count (retired analytics files excluded, #1798), `manifest`/`metadata` district counts, `global-totals` clubs and countries, district `data` keys and the most complete club record’s keys — staging ≥ production. A district staging records as a #1671 source gap counts for itself when production holds no clubs for it (#2038).',
    '- Find-A-Club continuity (#2239), dates from 2026-05-15 on less the known-unenriched ones: each sampled district keeps the FAC merge and its coordinates / address / meeting coverage against the best of production’s copy and the 3 nearest earlier production dates (a drop of 10 points and 3 clubs; suspended clubs left out), and at least half the sampled districts are FAC-merged. Losses in 1–2 districts warn and promote; 3 or more, or the half rule, hold.',
    '',
  ]
  if (result.warnings.length) {
    lines.push(
      `### ⚠️ Find-A-Club warning: ${result.warnings.length} district loss(es) too narrow to hold — promoted anyway (#2239)`,
      '',
      '| Object | Loss |',
      '| --- | --- |'
    )
    for (const w of result.warnings.slice(0, MAX_LISTED)) {
      lines.push(`| ${cell(w.path)} | ${cell(w.reason)} |`)
    }
    lines.push('')
  }
  if (result.failures.length) {
    lines.push('| Object | Regression |', '| --- | --- |')
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

/**
 * The `fac-loss` issue body for a run whose gate warned (#2239), null when
 * nothing warned. The dates promoted: the issue is the loud record.
 */
export function buildFacWarningBody(
  result: CompletenessGateResult
): string | null {
  if (result.warnings.length === 0) return null
  const dates = [
    ...new Set(
      result.warnings
        .map(w => /snapshots\/(\d{4}-\d{2}-\d{2})\//.exec(w.path)?.[1])
        .filter((d): d is string => d !== undefined)
    ),
  ].sort()
  return [
    `## ⚠️ Find-A-Club loss on ${dates.join(', ') || 'a promoted date'} (#2239)`,
    '',
    `The completeness gate found ${result.warnings.length} district-level Find-A-Club loss(es), fewer than the ${FAC_HOLD_MIN_DISTRICTS} districts that hold a date, so the date was **promoted** with the loss: those districts show no map points or meeting details for it.`,
    '',
    ...result.warnings.map(w => `- \`${w.path}\`: ${w.reason}`),
    '',
    'To repair: once FAC is back for the district, re-derive the date with a `fac_prior_root` holding an enriched copy, or accept the loss. A re-derive from `raw-fac/` alone reproduces it, since the daily fallback is never persisted.',
    '',
  ].join('\n')
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
  const files = await mapLimit(sample, CONCURRENCY, id =>
    readJson(bucket, byName.get(`district_${id}.json`))
  )
  return {
    objectNames: [...byName.keys()].sort(),
    manifestDistricts: manifestDistricts(manifest),
    metadataDistricts: metadataDistricts(metadata),
    metadataDistrictIds: metadataDistrictIds(metadata),
    gapDistricts: sourceGapDistricts(metadata),
    globalClubs: globalClubs(totals),
    globalCountries: globalCountries(totals),
    districts: Object.fromEntries(
      sample.map((id, i) => [id, districtShape(files[i])])
    ),
    clubCounts: Object.fromEntries(
      sample.map((id, i) => [id, districtClubCount(files[i])])
    ),
  }
}

/**
 * Club counts of production's file for each staging gap district the sample
 * did not already read (#2038): one read per gap, only when prod has one.
 */
async function addGapClubCounts(
  bucket: GateBucket,
  dir: string,
  listing: GcsObjectMeta[],
  prod: DateProfile,
  staging: DateProfile | null
): Promise<void> {
  const byName = new Map(listing.map(o => [o.name.slice(dir.length), o]))
  const counts = (prod.clubCounts ??= {})
  const unread = (staging?.gapDistricts ?? []).filter(
    id => !(id in counts) && byName.has(`district_${id}.json`)
  )
  const files = await mapLimit(unread, CONCURRENCY, id =>
    readJson(bucket, byName.get(`district_${id}.json`))
  )
  unread.forEach((id, i) => (counts[id] = districtClubCount(files[i])))
}

/** prod's `v1/dates.json` dates. Throws when it cannot be read (fail closed). */
async function readProdDates(prod: GateBucket): Promise<string[]> {
  const path = 'v1/dates.json'
  let value: unknown
  try {
    // 'gzip' only lets the decoder gunzip a gzip body; a plain one is kept.
    const decoded = decodeStoredObject(await readStored(prod, path, 'gzip'))
    if (!decoded.ok) throw new Error(decoded.reason)
    value = decoded.value
  } catch (err) {
    throw new Error(
      `cannot read production ${path} for the Find-A-Club baseline: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  const dates = isRecord(value) ? value.dates : undefined
  if (!Array.isArray(dates)) {
    throw new Error(`production ${path} has no dates[]`)
  }
  return dates.filter((d): d is string => typeof d === 'string')
}

/**
 * FAC coverage of `ids` in one bucket's date, cached across touched dates
 * (adjacent dates share their earlier baseline dates).
 */
function facReader(bucket: GateBucket) {
  const listings = new Map<string, Promise<Map<string, GcsObjectMeta>>>()
  const files = new Map<string, Promise<FacCoverage | null>>()
  const listing = (date: string) => {
    const dir = `snapshots/${date}/`
    let l = listings.get(date)
    if (!l) {
      l = listFlat(bucket, dir).then(
        list => new Map(list.map(o => [o.name.slice(dir.length), o]))
      )
      listings.set(date, l)
    }
    return l
  }
  /** Reuse a listing the gate already made, so no date is listed twice. */
  const seed = (date: string, list: GcsObjectMeta[]) => {
    const dir = `snapshots/${date}/`
    listings.set(
      date,
      Promise.resolve(new Map(list.map(o => [o.name.slice(dir.length), o])))
    )
  }
  const read = async (
    date: string,
    ids: readonly string[]
  ): Promise<Record<string, FacCoverage | null>> => {
    const byName = await listing(date)
    const covs = await mapLimit(ids, CONCURRENCY, id => {
      const key = `${date}/${id}`
      let f = files.get(key)
      if (!f) {
        f = readJson(bucket, byName.get(`district_${id}.json`)).then(
          facCoverage
        )
        files.set(key, f)
      }
      return f
    })
    return Object.fromEntries(ids.map((id, i) => [id, covs[i] ?? null]))
  }
  return { read, seed }
}

type FacReader = ReturnType<typeof facReader>

/**
 * The FAC continuity check of one touched date (#2239 AC3, facContinuity.ts):
 * staging's sampled districts against the best of prod's copy of the date
 * and its nearest earlier prod dates.
 */
async function facRegressions(
  date: string,
  stagingIds: readonly string[],
  perDate: number,
  readStaging: FacReader,
  readProd: FacReader,
  prodDates: () => Promise<string[]>,
  prodHasDate: boolean
): Promise<{
  regressions: DateRegression[]
  warnings: DateRegression[]
  sampled: number
}> {
  if (!facCheckApplies(date)) {
    return { regressions: [], warnings: [], sampled: 0 }
  }
  const sample = sampleDistricts(stagingIds, perDate)
  const baseDates = [
    ...(prodHasDate ? [date] : []),
    ...facBaselineDates(await prodDates(), date),
  ]
  const staged = await readStaging.read(date, sample)
  const baselines: Record<string, FacBaseline[]> = Object.fromEntries(
    sample.map(id => [id, []])
  )
  for (const d of baseDates) {
    const covs = await readProd.read(d, sample)
    for (const id of sample) {
      baselines[id]!.push({ date: d, coverage: covs[id] ?? null })
    }
  }
  const found = compareFacContinuity(date, staged, baselines)
  return {
    regressions: found.holds,
    warnings: found.warnings,
    sampled: sample.length,
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
  const warnings: DateRegression[] = []
  const newDates: string[] = []
  let districtsSampled = 0
  const readStagingFac = facReader(staging)
  const readProdFac = facReader(prod)
  let prodDates: Promise<string[]> | undefined
  const loadProdDates = () => (prodDates ??= readProdDates(prod))

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
    else {
      districtsSampled += sample.length
      await addGapClubCounts(prod, dir, prodList, p, s)
    }
    const found = compareDateProfiles(date, p, s)
    regressions.push(...found)
    readStagingFac.seed(date, stagingList)
    readProdFac.seed(date, prodList)
    const fac = await facRegressions(
      date,
      districtIdsIn(stagingList.map(o => o.name.slice(dir.length))),
      perDate,
      readStagingFac,
      readProdFac,
      loadProdDates,
      p !== null
    )
    regressions.push(...fac.regressions)
    warnings.push(...fac.warnings)
    log(
      `[completeness-gate] ${date}: ${stagingList.length} staging / ${prodList.length} prod objects, ` +
        `${p ? `${sample.length} district(s) sampled, ${found.length} regression(s)` : 'new date (no production baseline)'}` +
        (fac.sampled
          ? `; Find-A-Club continuity: ${fac.sampled} district(s), ${fac.regressions.length} regression(s), ${fac.warnings.length} warning(s)`
          : '')
    )
  }

  return evaluateCompletenessGate({
    dates: [...dates],
    regressions,
    allowValueChanges: opts.allowValueChanges,
    newDates,
    districtsSampled,
    warnings,
  })
}
