/**
 * Run-scoped CDN fixtures for the PR Preview shards (#2545): the manifest of
 * objects the shards read, its expansion against the live dates, schema
 * validation of what was fetched, and the refresh that writes the directory.
 *
 * The preview build reads cdn-staging, and staging was 73% of the project's
 * CDN cache lookups. The `fixtures` job runs scripts/refresh-smoke-fixtures.ts
 * once per run; every shard then answers the CDN from that directory
 * (frontend/e2e/helpers/cdnFixtures.ts). The same fetch is the schema check
 * for staging data: drift fails one job, with the path, before any shard runs.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import type { ZodType } from 'zod'
import {
  ClosedClubNameIndexSchema,
  ClubDistrictHistoryIndexSchema,
  ClubDistrictHistoryShardSchema,
  ClubsByRegionShardReaderSchema,
  ClubsByRegionWorldReaderSchema,
  DistrictReportsDatasetReaderSchema,
  EducationRollupIndexReaderSchema,
  EducationRollupProgramYearReaderSchema,
  EducationTimelineEntityReaderSchema,
  GlobalClubRaceReaderSchema,
  GlobalHistorySchema,
  GlobalTotalsSchema,
  PerDistrictDataSchema,
  ProgramYearIndexFileSchema,
  RegionMembershipSeriesReaderSchema,
  RegionRollupsReaderSchema,
  ReportsRollupsReaderSchema,
  SuspendedClubsReaderSchema,
  TimeSeriesIndexMetadataSchema,
} from '@taverns-red/shared-contracts'
import { decodeCdnJson } from './cdnSchemaCanary.js'
import { summarizeZodIssues } from './zodIssueSummary.js'

export interface ManifestEntry {
  /** An object path; `{date}`-style placeholders are expanded. */
  path: string
  /** Districts for `{district}`; default is the manifest's. */
  districts?: string[]
  /** A 404 is recorded as a fixture instead of failing the refresh. */
  optional?: boolean
  /** Copy this repo file instead of fetching (the basemap archive). */
  copyFrom?: string
}

export interface Manifest {
  origin: string
  districts: string[]
  paths: ManifestEntry[]
}

/** The dates the shards ask for, named by role. */
export interface DateRoles {
  /** The latest snapshot date. */
  date: string
  /** The date before it. */
  prev: string | null
  /** The newest date on or before 14 days before the latest. */
  ago14: string | null
  /** Every June 30 the CDN has (program-year closes). */
  yearEnds: string[]
  /** Every month-end the CDN has within the last 26 months. */
  monthEnds: string[]
  /** The weekly dates the club page's Recent changes card reads. */
  feed?: string[]
}

export interface ExpandVars extends DateRoles {
  /** Program years, e.g. 2025-2026. */
  py: string[]
  /** Every district id (from v1/rankings.json). */
  allDistrict?: string[]
  /** Every club-district-history shard (from its index). */
  shard?: string[]
  /** Every clubs-by-region file name (from region-rollups.json). */
  region?: string[]
}

export interface ResolvedEntry {
  path: string
  optional: boolean
  copyFrom?: string
}

export interface SchemaRule {
  name: string
  match: RegExp
  schema: ZodType
}

export type Validation =
  | { kind: 'ok'; schema: string }
  | { kind: 'invalid'; schema: string; detail: string }
  | { kind: 'notjson'; detail: string }
  | { kind: 'unvalidated' }

export interface FetchedObject {
  status: number
  contentType: string
  body: Uint8Array
}
export type FetchFn = (url: string) => Promise<FetchedObject>

export interface RefreshReport {
  ok: boolean
  date: string
  written: number
  bytes: number
  failures: string[]
  unvalidated: string[]
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const DISTRICT = /^[0-9A-Za-z]{1,4}$/
const DAY_MS = 86_400_000

function calendarMs(value: string): number | null {
  if (!DATE.test(value)) return null
  const ms = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString().slice(0, 10) === value ? ms : null
}

function badPath(path: string): boolean {
  return (
    path === '' ||
    path.startsWith('/') ||
    path.split('/').some(part => part === '..' || part === '')
  )
}

/** Validate a parsed manifest; it is repo input, but a typo must fail loudly. */
export function parseManifest(json: unknown): Manifest {
  const m = json as Partial<Manifest> | null
  if (!m || typeof m !== 'object') throw new Error('manifest is not an object')
  if (typeof m.origin !== 'string' || !m.origin.startsWith('https://')) {
    throw new Error('manifest.origin must be an https:// origin')
  }
  if (
    !Array.isArray(m.districts) ||
    !m.districts.every(d => DISTRICT.test(d))
  ) {
    throw new Error('manifest.districts must be district ids')
  }
  if (!Array.isArray(m.paths) || m.paths.length === 0) {
    throw new Error('manifest.paths must list at least one path')
  }
  for (const entry of m.paths) {
    if (typeof entry?.path !== 'string' || badPath(entry.path)) {
      throw new Error(
        `manifest path is not a relative object path: ${entry?.path}`
      )
    }
    if (entry.districts && !entry.districts.every(d => DISTRICT.test(d))) {
      throw new Error(`manifest entry ${entry.path} has a bad district id`)
    }
  }
  return m as Manifest
}

/** Name the dates the shards ask for from the CDN's own date list. */
export function dateRoles(latest: string, dates: string[]): DateRoles {
  const latestMs = calendarMs(latest)
  if (latestMs === null) {
    throw new Error(`latest snapshot date is not a calendar date: ${latest}`)
  }
  const valid = dates.filter(d => calendarMs(d) !== null).sort()
  const earlier = valid.filter(d => d < latest)
  const cutoff = new Date(latestMs - 14 * DAY_MS).toISOString().slice(0, 10)
  const monthsBack = monthsBackFrom(latestMs)
  const ago = valid.filter(d => d <= cutoff)
  return {
    date: latest,
    prev: earlier[earlier.length - 1] ?? null,
    ago14: ago[ago.length - 1] ?? null,
    yearEnds: valid.filter(d => d.endsWith('-06-30')),
    monthEnds: valid.filter(d => d >= monthsBack && isMonthEnd(d)),
  }
}

/** The first day of the month 26 months before `ms`, as YYYY-MM-DD. */
function monthsBackFrom(ms: number): string {
  const d = new Date(ms)
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - 26)
  return d.toISOString().slice(0, 10)
}

function isMonthEnd(date: string): boolean {
  const ms = calendarMs(date)
  return ms !== null && new Date(ms + DAY_MS).getUTCDate() === 1
}

/** The newest `count` program years a district's time-series lists. */
export function programYearsFrom(metadata: unknown, count = 3): string[] {
  const years = (metadata as { availableProgramYears?: unknown } | null)
    ?.availableProgramYears
  if (!Array.isArray(years)) return []
  return years
    .filter((y): y is string => typeof y === 'string')
    .sort()
    .slice(-count)
}

/** Expand every `{placeholder}` of every entry; dedupe the results. */
export function expandManifest(
  manifest: Manifest,
  vars: ExpandVars
): ResolvedEntry[] {
  const out = new Map<string, ResolvedEntry>()
  for (const entry of manifest.paths) {
    let paths = [entry.path]
    let skipped = false
    for (const name of new Set(
      [...entry.path.matchAll(/\{(\w+)\}/g)].map(m => m[1] as string)
    )) {
      let values: string[]
      switch (name) {
        case 'date':
          values = [vars.date]
          break
        case 'prev':
          values = vars.prev ? [vars.prev] : []
          break
        case 'ago14':
          values = vars.ago14 ? [vars.ago14] : []
          break
        case 'yearEnd':
          values = vars.yearEnds
          break
        case 'monthEnd':
          values = vars.monthEnds
          break
        case 'py':
          values = vars.py
          break
        case 'pyCurrent':
          values = vars.py.slice(-1)
          break
        case 'allDistrict':
          values = vars.allDistrict ?? []
          break
        case 'shard':
          values = vars.shard ?? []
          break
        case 'region':
          values = vars.region ?? []
          break
        case 'district':
          values = entry.districts ?? manifest.districts
          break
        default:
          throw new Error(`manifest path ${entry.path}: unknown {${name}}`)
      }
      if (values.length === 0) skipped = true
      paths = paths.flatMap(p => values.map(v => p.split(`{${name}}`).join(v)))
    }
    if (skipped) continue
    for (const path of paths) {
      if (out.has(path)) continue
      out.set(path, {
        path,
        optional: entry.optional ?? false,
        ...(entry.copyFrom ? { copyFrom: entry.copyFrom } : {}),
      })
    }
  }
  return [...out.values()]
}

/** Recorded paths (a record run) the manifest does not produce. */
export function uncoveredPaths(
  recorded: string[],
  resolved: ResolvedEntry[]
): string[] {
  const have = new Set(resolved.map(e => e.path))
  return [...new Set(recorded)].filter(p => !have.has(p))
}

/**
 * The reader schemas of what the shards read: the ones the frontend parses
 * with, so a drift that would break the app fails here first. A path matching
 * no rule is reported as unvalidated, never skipped silently.
 */
export const SCHEMA_RULES: SchemaRule[] = [
  rule('GlobalHistory', /^v1\/global-history\.json$/, GlobalHistorySchema),
  rule(
    'GlobalTotals',
    /^snapshots\/[^/]+\/global-totals\.json$/,
    GlobalTotalsSchema
  ),
  rule(
    'GlobalClubRace',
    /^snapshots\/[^/]+\/global-club-race\.json$/,
    GlobalClubRaceReaderSchema
  ),
  rule(
    'RegionRollups',
    /^snapshots\/[^/]+\/region-rollups\.json$/,
    RegionRollupsReaderSchema
  ),
  rule(
    'ReportsRollups',
    /^snapshots\/[^/]+\/reports-rollups\.json$/,
    ReportsRollupsReaderSchema
  ),
  rule(
    'SuspendedClubs',
    /^snapshots\/[^/]+\/suspended-clubs\.json$/,
    SuspendedClubsReaderSchema
  ),
  rule(
    'ClubsByRegionWorld',
    /^snapshots\/[^/]+\/clubs-by-region\/world\.json$/,
    ClubsByRegionWorldReaderSchema
  ),
  rule(
    'ClubsByRegionShard',
    /^snapshots\/[^/]+\/clubs-by-region\/(?!world(-points)?\.json)[^/]+\.json$/,
    ClubsByRegionShardReaderSchema
  ),
  rule(
    'DistrictReports',
    /^snapshots\/[^/]+\/district_[^/]+_reports\.json$/,
    DistrictReportsDatasetReaderSchema
  ),
  rule(
    'PerDistrictData',
    /^snapshots\/[^/]+\/district_[0-9A-Za-z]+\.json$/,
    PerDistrictDataSchema
  ),
  rule(
    'TimeSeriesIndexMetadata',
    /^time-series\/district_[^/]+\/index-metadata\.json$/,
    TimeSeriesIndexMetadataSchema
  ),
  rule(
    'ProgramYearIndexFile',
    /^time-series\/district_[^/]+\/\d{4}-\d{4}\.json$/,
    ProgramYearIndexFileSchema
  ),
  rule(
    'RegionMembershipSeries',
    /^time-series\/regions\/\d{4}-\d{4}\.json$/,
    RegionMembershipSeriesReaderSchema
  ),
  rule(
    'EducationRollupIndex',
    /^derived\/education-rollup\/index\.json$/,
    EducationRollupIndexReaderSchema
  ),
  rule(
    'EducationRollupProgramYear',
    /^derived\/education-rollup\/\d{4}-\d{4}\.json$/,
    EducationRollupProgramYearReaderSchema
  ),
  rule(
    'EducationTimelineEntity',
    /^derived\/education-timeline\/\d{4}-\d{4}\/(?:world|region-[A-Za-z0-9]+|district-[A-Za-z0-9]+)\.json$/,
    EducationTimelineEntityReaderSchema
  ),
  rule(
    'ClubDistrictHistoryIndex',
    /^config\/club-district-history\/index\.json$/,
    ClubDistrictHistoryIndexSchema
  ),
  rule(
    'ClubDistrictHistoryShard',
    /^config\/club-district-history\/\d+\.json$/,
    ClubDistrictHistoryShardSchema
  ),
  rule(
    'ClosedClubNames',
    /^config\/closed-club-names\.json$/,
    ClosedClubNameIndexSchema
  ),
]

function rule(name: string, match: RegExp, schema: ZodType): SchemaRule {
  return { name, match, schema }
}

/** Decode, then parse a fetched body with the schema its path calls for. */
export function validateObject(
  path: string,
  body: Uint8Array,
  rules: SchemaRule[] = SCHEMA_RULES
): Validation {
  if (!path.endsWith('.json')) return { kind: 'unvalidated' }
  const decoded = decodeCdnJson({ ok: true, body })
  if (!decoded.ok) return { kind: 'notjson', detail: decoded.reason }
  const found = rules.find(r => r.match.test(path))
  if (!found) return { kind: 'unvalidated' }
  const parsed = found.schema.safeParse(decoded.value)
  if (parsed.success) return { kind: 'ok', schema: found.name }
  return {
    kind: 'invalid',
    schema: found.name,
    detail: summarizeZodIssues(parsed.error.issues),
  }
}

/**
 * Resolve every placeholder the manifest uses from the CDN itself: the dates
 * by role, the program years, and only the id lists an entry asks for.
 * Shared by the refresh and by smoke-fixtures-uncovered.ts.
 */
export async function loadExpandVars(
  manifest: Manifest,
  getJson: (path: string) => Promise<unknown>
): Promise<ExpandVars> {
  const latest = (await getJson('v1/latest.json')) as {
    latestSnapshotDate?: unknown
  }
  const date = String(latest.latestSnapshotDate ?? '')
  const datesFile = (await getJson('v1/dates.json')) as { dates?: unknown }
  const dates = Array.isArray(datesFile.dates)
    ? (datesFile.dates as unknown[]).map(String)
    : []
  const anchor = manifest.districts[0] ?? '61'
  const meta = await getJson(
    `time-series/district_${anchor}/index-metadata.json`
  )
  const vars: ExpandVars = {
    ...dateRoles(date, dates),
    py: programYearsFrom(meta),
  }
  const used = (name: string) =>
    manifest.paths.some(e => e.path.includes(`{${name}}`))
  if (used('allDistrict')) {
    const r = (await getJson('v1/rankings.json')) as {
      rankings?: Array<{ districtId?: unknown }>
    }
    vars.allDistrict = (r.rankings ?? []).map(x => String(x.districtId))
  }
  if (used('shard')) {
    const r = (await getJson('config/club-district-history/index.json')) as {
      shards?: unknown[]
    }
    vars.shard = (r.shards ?? []).map(String)
  }
  if (used('region')) {
    const r = (await getJson(`snapshots/${date}/region-rollups.json`)) as {
      regions?: Record<string, unknown>
    }
    vars.region = [...Object.keys(r.regions ?? {}), 'unassigned']
  }
  return vars
}

const CONCURRENCY = 8

async function inBatches<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i] as T)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, worker)
  )
  return out
}

/**
 * Fetch the manifest's objects once, check each against its schema, write
 * `<outDir>/<path>` and `_index.json`. Never throws on a bad object: every
 * problem is a line in `failures`, so one run names all of them.
 */
export async function refreshFixtures(options: {
  manifest: Manifest
  outDir: string
  fetchFn: FetchFn
  rules?: SchemaRule[]
  readLocal?: (relativePath: string) => Uint8Array
}): Promise<RefreshReport> {
  const { manifest, fetchFn } = options
  const outDir = resolve(options.outDir)
  const failures: string[] = []
  const unvalidated: string[] = []
  const report = (date: string, written = 0, bytes = 0): RefreshReport => ({
    ok: failures.length === 0,
    date,
    written,
    bytes,
    failures,
    unvalidated,
  })

  // One fetch per object, whoever asks first (the roles and the entries).
  const cache = new Map<string, Promise<FetchedObject>>()
  const get = (path: string) => {
    let hit = cache.get(path)
    if (!hit) {
      hit = fetchFn(`${manifest.origin}/${path}`)
      cache.set(path, hit)
    }
    return hit
  }
  const getJson = async (path: string): Promise<unknown> => {
    const res = await get(path)
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
    const decoded = decodeCdnJson({ ok: true, body: res.body })
    if (!decoded.ok) throw new Error(decoded.reason)
    return decoded.value
  }

  let vars: ExpandVars
  try {
    vars = await loadExpandVars(manifest, getJson)
  } catch (err) {
    failures.push(
      `cannot resolve the dates and id lists (v1/latest.json, v1/dates.json, time-series metadata, rankings, shard and region indexes): ${err instanceof Error ? err.message : String(err)}`
    )
    return report('')
  }
  const date = vars.date

  const entries = expandManifest(manifest, vars)
  const index: Record<string, { status: number; contentType: string }> = {}
  const rules = options.rules ?? SCHEMA_RULES
  let written = 0
  let bytes = 0

  const store = (path: string, body: Uint8Array) => {
    const file = resolve(outDir, path)
    if (!file.startsWith(outDir + sep)) {
      failures.push(`${path}: resolves outside the output directory`)
      return false
    }
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, body)
    written += 1
    bytes += body.length
    return true
  }

  await inBatches(entries, CONCURRENCY, async entry => {
    if (entry.copyFrom) {
      if (!options.readLocal) {
        failures.push(`${entry.path}: copyFrom needs a local reader`)
        return
      }
      const body = options.readLocal(entry.copyFrom)
      if (store(entry.path, body)) {
        index[entry.path] = {
          status: 200,
          contentType: 'application/octet-stream',
        }
      }
      return
    }
    let res: FetchedObject
    try {
      res = await get(entry.path)
    } catch (err) {
      failures.push(
        `${entry.path}: fetch failed: ${err instanceof Error ? err.message : String(err)}`
      )
      return
    }
    if (res.status !== 200 && !(entry.optional && res.status === 404)) {
      failures.push(`${entry.path}: HTTP ${res.status}`)
      return
    }
    if (res.status === 200) {
      const v = validateObject(entry.path, res.body, rules)
      if (v.kind === 'notjson') {
        failures.push(`${entry.path}: ${v.detail}`)
        return
      }
      if (v.kind === 'invalid') {
        failures.push(`${entry.path}: schema ${v.schema}: ${v.detail}`)
        return
      }
      if (v.kind === 'unvalidated' && entry.path.endsWith('.json')) {
        unvalidated.push(entry.path)
      }
    }
    if (store(entry.path, res.body)) {
      index[entry.path] = { status: res.status, contentType: res.contentType }
    }
  })

  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, '_index.json'), JSON.stringify(index, null, 1))
  return report(vars.date, written, bytes)
}

/** One screen: the verdict, the numbers, every failure, what had no schema. */
export function formatReport(report: RefreshReport): string {
  const kb = Math.round(report.bytes / 1024)
  const lines = [
    `${report.ok ? 'OK' : 'FAILED'}: ${report.written} objects, ${kb} KiB, snapshot ${report.date}`,
  ]
  for (const f of report.failures) lines.push(`  fail  ${f}`)
  if (report.unvalidated.length > 0) {
    lines.push(
      `${report.unvalidated.length} JSON object(s) have no schema rule (unvalidated):`
    )
    for (const p of report.unvalidated) lines.push(`  ${p}`)
  }
  return lines.join('\n')
}
