/**
 * Pre-promotion content gate — pure decision logic (#1715, plan S1-4).
 *
 * The count gate checks two integers and the value gate digests one file per
 * date; promotion then rsyncs the promoted prefixes wholesale. Three corrupt
 * promotions passed that way (#1702: nested-gzip time-series; #1704: every
 * district's `priorYearAvgClubSize` null). This gate reads the objects
 * promotion is about to copy — staging objects that differ from prod — the
 * way a browser reads them, and holds promotion (decision D8) when any fails:
 *
 * - **Bytes.** Exactly one gzip layer is peeled, and only when the object is
 *   stored `Content-Encoding: gzip` (what `curl --compressed` / a browser
 *   does). Anything still gzip after that is nested gzip.
 * - **Parse.** `JSON.parse`, plus the shared-contracts schema where one
 *   exists (time-series), via the S1-5 CDN-canary decoder.
 * - **Shape.** Per kind; see `checkObject`. Every rule is chosen so
 *   legitimate data never trips it (see the notes on each).
 *
 * No I/O here — `scripts/promotion-content-gate.ts` lists, reads and emits.
 */

import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import {
  ClubDistrictHistoryIndexSchema,
  ClubDistrictHistoryShardSchema,
  clubDistrictHistoryShardKey,
  DistrictRegionHistorySchema,
  findClubContactField,
  ProgramYearIndexFileSchema,
  REGION_ROLLUPS_FILE_NAME,
  RegionRollupsSchema,
  type RegionRollupFigures,
} from '@taverns-red/shared-contracts'
import { programYearForSnapshotDate } from './ceoReportSnapshotDates.js'
import {
  ANCHOR_DISTRICT,
  checkDistrictSnapshotIndex,
  checkTimeSeriesMetadata,
  decodeCdnJson,
  type DecodeResult,
} from './cdnSchemaCanary.js'
import { summarizeZodIssues } from './zodIssueSummary.js'
import { latestByPath, type RunManifestEntry } from './runManifest.js'
import {
  isGzipped,
  peelGzipLayers,
} from '../../packages/collector-cli/src/utils/gzipLayers.js'
import {
  calculateProgramYear,
  getPriorProgramYear,
} from '../../packages/collector-cli/src/utils/CachePaths.js'

/** One listed object (GCS JSON API field names). */
export interface GcsObjectMeta {
  name: string
  size?: string | number
  crc32c?: string
  md5Hash?: string
  contentEncoding?: string
}

/** An object's stored bytes plus the Content-Encoding it is served with. */
export interface StoredObject {
  bytes: Uint8Array
  contentEncoding?: string
}

export type ObjectKind =
  | 'time-series-metadata'
  | 'time-series-program-year'
  | 'competitive-awards'
  | 'district-analytics'
  | 'snapshot-index'
  | 'district-region-history'
  | 'club-district-history-index'
  | 'club-district-history-shard'
  | 'region-rollups'
  | 'latest'
  | 'json'

export interface PlannedCheck {
  path: string
  kind: ObjectKind
  /** Also read the prod copy (time-series last-point regression). */
  compareWithProd?: boolean
  /** A run-manifest object: its served bytes must hash to this (#1762). */
  expectedSha256?: string
}

export interface CheckContext {
  /** Staging `v1/latest.json` date, null when unreadable. */
  latestSnapshotDate: string | null
  /** Staging `v1/dates.json` dates, empty when unreadable. */
  availableDates: string[]
  /**
   * Club-district history shard keys present under
   * `config/club-district-history/` (#1782), from the two listings.
   */
  clubHistoryShards: { staging: readonly string[]; prod: readonly string[] }
}

export interface CheckResult {
  path: string
  kind: ObjectKind | 'cross-check'
  failure: string | null
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TS_METADATA =
  /^time-series\/district_([A-Za-z0-9]+)\/index-metadata\.json$/
const TS_PROGRAM_YEAR =
  /^time-series\/district_([A-Za-z0-9]+)\/(\d{4}-\d{4})\.json$/
const AWARDS = /^snapshots\/(\d{4}-\d{2}-\d{2})\/competitive-awards\.json$/
const REGION_ROLLUPS = new RegExp(
  `^snapshots/(\\d{4}-\\d{2}-\\d{2})/${REGION_ROLLUPS_FILE_NAME.replace('.', '\\.')}$`
)
const DISTRICT_ANALYTICS =
  /^snapshots\/\d{4}-\d{2}-\d{2}\/analytics\/district_[A-Za-z0-9]+_[a-z-]+\.json$/

/**
 * The prefixes `Promote staging to production` rsyncs. A workflow contract
 * test keeps this list and the rsync calls identical. club-trends/ and
 * club-race/ are pipeline-internal and never promoted (#1738, D3).
 */
export const PROMOTED_PREFIXES = [
  'v1/',
  'snapshots/',
  'time-series/',
  'config/',
] as const

export const LATEST_PATH = 'v1/latest.json'
export const DATES_PATH = 'v1/dates.json'
export const SNAPSHOT_INDEX_PATH = 'config/district-snapshot-index.json'
/** District → region per program year (#1820), built by build-identity-history.sh. */
export const REGION_HISTORY_PATH = 'config/district-region-history.json'
/** The club-district history (#1782): `index.json` plus one `NN.json` per shard. */
export const CLUB_HISTORY_DIR = 'config/club-district-history/'
export const CLUB_HISTORY_INDEX_PATH = `${CLUB_HISTORY_DIR}index.json`
const CLUB_HISTORY_SHARD = /^config\/club-district-history\/(\d{2})\.json$/

/** The shard keys in a listing (`config/club-district-history/NN.json`), sorted. */
export function clubHistoryShardKeys(names: Iterable<string>): string[] {
  const keys: string[] = []
  for (const n of names) {
    const m = CLUB_HISTORY_SHARD.exec(n)
    if (m) keys.push(m[1]!)
  }
  return keys.sort()
}

/** The kind of content check an object gets; null = not JSON, not checked. */
export function classifyObject(path: string): ObjectKind | null {
  if (!path.endsWith('.json')) return null
  if (TS_METADATA.test(path)) return 'time-series-metadata'
  if (TS_PROGRAM_YEAR.test(path)) return 'time-series-program-year'
  if (AWARDS.test(path)) return 'competitive-awards'
  if (DISTRICT_ANALYTICS.test(path)) return 'district-analytics'
  if (REGION_ROLLUPS.test(path)) return 'region-rollups'
  if (path === SNAPSHOT_INDEX_PATH) return 'snapshot-index'
  if (path === REGION_HISTORY_PATH) return 'district-region-history'
  if (path === CLUB_HISTORY_INDEX_PATH) return 'club-district-history-index'
  if (CLUB_HISTORY_SHARD.test(path)) return 'club-district-history-shard'
  if (path === LATEST_PATH) return 'latest'
  return 'json'
}

/**
 * Staging objects promotion would copy: absent from prod, or with different
 * bytes (hash, else size). Promotion is additive, so prod-only objects are
 * irrelevant. A held run's corrupt object stays in this set on the next run
 * — it is re-checked until it is fixed, never waved through as "old".
 */
export function diffChangedObjects(
  staging: readonly GcsObjectMeta[],
  prod: readonly GcsObjectMeta[]
): GcsObjectMeta[] {
  const prodByName = new Map(prod.map(o => [o.name, o]))
  return staging.filter(s => {
    const p = prodByName.get(s.name)
    if (!p) return true
    if (s.crc32c && p.crc32c) return s.crc32c !== p.crc32c
    if (s.md5Hash && p.md5Hash) return s.md5Hash !== p.md5Hash
    return String(s.size) !== String(p.size)
  })
}

export interface SamplingCaps {
  /** Districts whose time-series get the full check (D61 first). */
  timeSeriesDistricts: number
  /** competitive-awards files, newest dates first. */
  awards: number
  /** Every other changed JSON object, sampled (D61 first). */
  generic: number
}

export const DEFAULT_CAPS: SamplingCaps = {
  timeSeriesDistricts: 200,
  awards: 30,
  generic: 150,
}

export interface ContentCheckPlan {
  checks: PlannedCheck[]
  /** Changed objects in the promoted prefixes. */
  changedCount: number
  /** Changed objects that are not JSON (not content-checked). */
  notJson: number
  /** Changed JSON objects left out by the sample caps. */
  sampledOut: number
  /** latest.json or the snapshot index changed: cross-check the pair. */
  crossCheckLatest: boolean
}

const isAnchor = (path: string) =>
  path.includes(`district_${ANCHOR_DISTRICT}/`) ||
  path.includes(`district_${ANCHOR_DISTRICT}.`) ||
  path.includes(`district_${ANCHOR_DISTRICT}_`)

/** Take `n` items, anchors first, the rest picked by `random`. */
function sample<T extends { path: string }>(
  items: T[],
  n: number,
  random: () => number
): T[] {
  const anchors = items.filter(i => isAnchor(i.path))
  const pool = items.filter(i => !isAnchor(i.path))
  const picked = anchors.slice(0, n)
  while (picked.length < n && pool.length > 0) {
    const index = Math.min(Math.floor(random() * pool.length), pool.length - 1)
    picked.push(...pool.splice(index, 1))
  }
  return picked
}

/**
 * Choose which changed objects to read. Bounded so a full rebuild (every
 * object changed) costs a few hundred reads, not the bucket:
 * - every changed time-series district (up to the cap): its index-metadata
 *   and its newest changed program-year file, compared with prod;
 * - the newest changed competitive-awards dates;
 * - latest + snapshot index whenever either changed;
 * - the district-region history whenever it changed (one small object that
 *   every region page and rollup reads, #1820);
 * - the club-district history index and every changed shard (#1782): at
 *   most 101 small objects (~9 MB raw in all), and a broken shard is a
 *   broken club page for 1% of clubs, so none is sampled out;
 * - a random sample of everything else (older program years, district
 *   snapshots, analytics, club stores), D61 always included.
 */
export function planContentChecks(
  changed: readonly GcsObjectMeta[],
  opts: { random?: () => number; caps?: Partial<SamplingCaps> } = {}
): ContentCheckPlan {
  const random = opts.random ?? Math.random
  const caps = { ...DEFAULT_CAPS, ...opts.caps }

  const json: PlannedCheck[] = []
  let notJson = 0
  for (const o of changed) {
    const kind = classifyObject(o.name)
    if (kind === null) notJson++
    else json.push({ path: o.name, kind })
  }

  const checks: PlannedCheck[] = []
  const rest: PlannedCheck[] = []

  // Time-series: group by district.
  const byDistrict = new Map<string, PlannedCheck[]>()
  const awards: PlannedCheck[] = []
  for (const c of json) {
    const ts = TS_METADATA.exec(c.path) ?? TS_PROGRAM_YEAR.exec(c.path)
    if (ts) {
      const list = byDistrict.get(ts[1]!) ?? []
      list.push(c)
      byDistrict.set(ts[1]!, list)
    } else if (c.kind === 'competitive-awards') {
      awards.push(c)
    } else if (
      c.kind === 'latest' ||
      c.kind === 'snapshot-index' ||
      c.kind === 'district-region-history' ||
      c.kind === 'club-district-history-index' ||
      c.kind === 'club-district-history-shard' ||
      c.kind === 'region-rollups'
    ) {
      checks.push(c)
    } else {
      rest.push(c)
    }
  }

  const districts = sample(
    [...byDistrict.keys()].map(id => ({ path: `district_${id}/`, id })),
    caps.timeSeriesDistricts,
    random
  )
  const chosen = new Set(districts.map(d => d.id))
  for (const [id, list] of byDistrict) {
    if (!chosen.has(id)) {
      rest.push(...list)
      continue
    }
    const years = list
      .filter(c => c.kind === 'time-series-program-year')
      .sort((a, b) => a.path.localeCompare(b.path))
    const newest = years[years.length - 1]
    for (const c of list) {
      if (c.kind === 'time-series-metadata') checks.push(c)
      else if (c === newest) checks.push({ ...c, compareWithProd: true })
      else rest.push(c)
    }
  }

  awards.sort((a, b) => b.path.localeCompare(a.path))
  checks.push(...awards.slice(0, caps.awards))
  rest.push(...awards.slice(caps.awards))

  const sampled = sample(rest, caps.generic, random)
  checks.push(...sampled)

  return {
    checks,
    changedCount: changed.length,
    notJson,
    sampledOut: rest.length - sampled.length,
    crossCheckLatest: json.some(
      c => c.kind === 'latest' || c.kind === 'snapshot-index'
    ),
  }
}

export interface ManifestCheckPlan extends ContentCheckPlan {
  /** Manifest objects under the promoted prefixes: every one is read. */
  manifestCount: number
}

const isPromoted = (path: string) =>
  PROMOTED_PREFIXES.some(prefix => path.startsWith(prefix))

/**
 * Plan with the run manifest (#1762, ADR-015 P5, D-13): EVERY object the run
 * wrote under a promoted prefix is read — no sampling — and must hash to
 * what the run uploaded; each program-year file is compared with prod.
 * Objects outside the promoted prefixes (raw-csv, raw-fac, internal stores)
 * are never promoted and are not read.
 *
 * Until scoped promotion (#1763) lands, promotion still copies every changed
 * object in the promoted prefixes, including ones an earlier, held run left
 * in staging. Those are not in this run's manifest, so they keep the
 * bounded, sampled plan of `planContentChecks`.
 */
export function planManifestChecks(
  written: readonly RunManifestEntry[],
  changed: readonly GcsObjectMeta[],
  opts: { random?: () => number; caps?: Partial<SamplingCaps> } = {}
): ManifestCheckPlan {
  const promoted = [...latestByPath(written).values()].filter(e =>
    isPromoted(e.path)
  )
  const writtenPaths = new Set(promoted.map(e => e.path))
  const checks: PlannedCheck[] = []
  let notJson = 0
  for (const e of promoted) {
    const kind = classifyObject(e.path)
    if (kind === null) {
      notJson++
      continue
    }
    checks.push({
      path: e.path,
      kind,
      expectedSha256: e.sha256,
      ...(kind === 'time-series-program-year' ? { compareWithProd: true } : {}),
    })
  }
  const carried = planContentChecks(
    changed.filter(o => !writtenPaths.has(o.name)),
    opts
  )
  return {
    checks: [...checks, ...carried.checks],
    changedCount: changed.length,
    notJson: notJson + carried.notJson,
    sampledOut: carried.sampledOut,
    crossCheckLatest:
      carried.crossCheckLatest ||
      checks.some(c => c.kind === 'latest' || c.kind === 'snapshot-index'),
    manifestCount: promoted.length,
  }
}

/**
 * The bytes a browser gets back: one `Content-Encoding: gzip` layer peeled.
 * The run manifest hashes exactly these (gcs-upload.sh hashes the file
 * before `-Z` compresses it).
 */
function servedBytes(object: StoredObject): Uint8Array {
  return object.contentEncoding === 'gzip' && isGzipped(object.bytes)
    ? gunzipSync(object.bytes)
    : object.bytes
}

function checkWrittenHash(
  object: StoredObject,
  expected: string
): string | null {
  let actual: string
  try {
    actual = createHash('sha256').update(servedBytes(object)).digest('hex')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return `Content-Encoding gzip body: ${message}`
  }
  return actual === expected
    ? null
    : `served bytes have sha256 ${actual.slice(0, 12)}…, but the run manifest says this run uploaded ${expected.slice(0, 12)}… (rewritten since, or corrupted in transit)`
}

/**
 * Decode stored bytes exactly as a browser receives them: peel ONE gzip layer
 * when the object is served `Content-Encoding: gzip`, then hand the body to
 * the S1-5 canary decoder, which names leftover gzip as nested gzip.
 * (If the bytes are already plain despite the header, the read was
 * transcoded server-side — the same single layer a browser would lose.)
 */
export function decodeStoredObject(object: StoredObject): DecodeResult {
  let body = object.bytes
  if (object.contentEncoding === 'gzip' && isGzipped(body)) {
    try {
      body = gunzipSync(body)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, reason: `Content-Encoding gzip body: ${message}` }
    }
  }
  const decoded = decodeCdnJson({ ok: true, body })
  if (decoded.ok || !isGzipped(body)) return decoded
  // Name the depth, using the #1703 layer peeler, so the alert says how bad.
  try {
    const { layers } = peelGzipLayers(Buffer.from(body))
    return { ok: false, reason: `${decoded.reason}; ${layers} extra layer(s)` }
  } catch {
    return decoded
  }
}

/** UTC epoch ms for a real calendar YYYY-MM-DD, or null (rejects 02-30). */
function calendarDate(value: unknown): number | null {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return null
  const ms = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString().slice(0, 10) === value ? ms : null
}

function lastPointDate(value: unknown): string | null {
  const parsed = ProgramYearIndexFileSchema.safeParse(value)
  if (!parsed.success) return null
  const last = parsed.data.dataPoints[parsed.data.dataPoints.length - 1]
  return last && calendarDate(last.date) !== null ? last.date : null
}

/**
 * A changed program-year file must validate and end in a real-dated point,
 * and that point must not be older than the one prod serves now (the #1111
 * one-point overwrite, or a store that lost points). Equal is fine: a run
 * that added no point (holiday, TI-footer lag, #1681) rewrites the same
 * last point. A prod copy that is itself unreadable is not compared.
 */
function checkProgramYear(
  value: unknown,
  prod: StoredObject | null
): string | null {
  const parsed = ProgramYearIndexFileSchema.safeParse(value)
  if (!parsed.success) {
    return `schema validation failed: ${summarizeZodIssues(parsed.error.issues)}`
  }
  const points = parsed.data.dataPoints
  const last = points[points.length - 1]
  if (last === undefined) return 'no data points — the file has no last point'
  if (calendarDate(last.date) === null) {
    return `last data point has an invalid date: ${JSON.stringify(last.date)}`
  }
  if (prod) {
    const decodedProd = decodeStoredObject(prod)
    const prodLast = decodedProd.ok ? lastPointDate(decodedProd.value) : null
    if (prodLast !== null && last.date < prodLast) {
      return `last data point ${last.date} is older than production's ${prodLast}`
    }
  }
  return null
}

/**
 * competitive-awards.json: Club Strength must list districts, and — for the
 * current program year only — not have `priorYearAvgClubSize` null for every
 * one (#1704: the transform read the awards history before it was synced).
 * Older years are exempt: the history store may not reach back to their
 * prior year, so all-null there can be legitimate. The rule also needs the
 * dataset to contain a prior-program-year date at all.
 */
function checkAwards(
  path: string,
  value: unknown,
  ctx: CheckContext
): string | null {
  const allDistricts = (
    value as { clubStrengthAward?: { allDistricts?: unknown } } | null
  )?.clubStrengthAward?.allDistricts
  if (!Array.isArray(allDistricts) || allDistricts.length === 0) {
    return 'clubStrengthAward.allDistricts is missing or empty'
  }

  const date = AWARDS.exec(path)?.[1]
  if (!date || !ctx.latestSnapshotDate) return null
  const programYear = calculateProgramYear(date)
  if (programYear !== calculateProgramYear(ctx.latestSnapshotDate)) return null
  const priorYear = getPriorProgramYear(programYear)
  if (!ctx.availableDates.some(d => calculateProgramYear(d) === priorYear)) {
    return null
  }

  const allNull = allDistricts.every(
    d =>
      (d as { priorYearAvgClubSize?: unknown } | null)?.priorYearAvgClubSize ==
      null
  )
  return allNull
    ? `clubStrengthAward: priorYearAvgClubSize is null for all ${allDistricts.length} districts although ${priorYear} is in the dataset (#1704: awards history not loaded)`
    : null
}

function checkDistrictAnalytics(value: unknown): string | null {
  const v = value as { metadata?: unknown; data?: unknown } | null
  if (typeof v?.metadata !== 'object' || v.metadata === null) {
    return 'missing a `metadata` object'
  }
  if (typeof v.data !== 'object' || v.data === null) {
    return 'missing a `data` object'
  }
  return null
}

/**
 * config/district-region-history.json (#1820): the shared-contracts schema,
 * and at least one district — the fold refuses empty input, so an empty
 * history is a broken writer, not a quiet year. A conflict (a district in
 * two regions in one PY) is reported data, not a failure.
 */
function checkRegionHistory(value: unknown): string | null {
  const parsed = DistrictRegionHistorySchema.safeParse(value)
  if (!parsed.success) {
    return `schema validation failed: ${summarizeZodIssues(parsed.error.issues)}`
  }
  return Object.keys(parsed.data.districts).length === 0
    ? 'no districts — the region history folded nothing'
    : null
}

/**
 * config/club-district-history/index.json (#1782): the schema, at least one
 * club and shard, every listed shard staged (promotion would publish an
 * index naming a missing object), and no shard prod serves dropped (clubs
 * are never removed from the history, so a shard key never disappears).
 */
function checkClubHistoryIndex(
  value: unknown,
  ctx: CheckContext
): string | null {
  const parsed = ClubDistrictHistoryIndexSchema.safeParse(value)
  if (!parsed.success) {
    return `schema validation failed: ${summarizeZodIssues(parsed.error.issues)}`
  }
  const { totalClubs, shards } = parsed.data
  if (totalClubs === 0 || shards.length === 0) {
    return 'no clubs or no shards — the club history folded nothing'
  }
  const staged = new Set(ctx.clubHistoryShards.staging)
  const missing = shards.filter(k => !staged.has(k))
  if (missing.length > 0) {
    return `names shard ${missing.join(', ')}, not in staging (the index would dangle)`
  }
  const listed = new Set(shards)
  const dropped = ctx.clubHistoryShards.prod.filter(k => !listed.has(k))
  if (dropped.length > 0) {
    return `drops shard ${dropped.join(', ')}, which prod serves (a shard key never disappears)`
  }
  return null
}

/**
 * config/club-district-history/NN.json (#1782): the schema, `shard` equal to
 * the file's key, at least one club, and every club in the shard its id maps
 * to (the readers' `clubDistrictHistoryShardKey`).
 */
function checkClubHistoryShard(path: string, value: unknown): string | null {
  const parsed = ClubDistrictHistoryShardSchema.safeParse(value)
  if (!parsed.success) {
    return `schema validation failed: ${summarizeZodIssues(parsed.error.issues)}`
  }
  const key = CLUB_HISTORY_SHARD.exec(path)?.[1]
  if (parsed.data.shard !== key) {
    return `holds shard ${parsed.data.shard} but is served as ${key}.json`
  }
  const ids = Object.keys(parsed.data.clubs)
  if (ids.length === 0)
    return 'no clubs — the writer only writes shards with clubs'
  const stray = ids.find(id => clubDistrictHistoryShardKey(id) !== key)
  return stray === undefined
    ? null
    : `club ${stray} belongs in shard ${clubDistrictHistoryShardKey(stray)}, not ${key}`
}

/** Every count of a block, flattened, for the world = Σ districts check. */
function figureCounts(f: RegionRollupFigures): Array<[string, number | null]> {
  const out: Array<[string, number | null]> = [
    ['clubs', f.clubs],
    ['membership', f.membership],
    ['payments', f.payments],
  ]
  for (const group of [
    'health',
    'clubStatus',
    'distinguished',
    'compliance',
    'growth',
  ] as const) {
    for (const [k, v] of Object.entries(f[group])) {
      out.push([`${group}.${k}`, v as number | null])
    }
  }
  return out
}

/** Σ rows figure by figure; a null in any row makes that figure null. */
function sumFigures(
  rows: readonly RegionRollupFigures[]
): Map<string, number | null> {
  const sums = new Map<string, number | null>()
  for (const row of rows) {
    for (const [k, v] of figureCounts(row)) {
      const prev = sums.has(k) ? sums.get(k)! : 0
      sums.set(k, prev === null || v === null ? null : prev + v)
    }
  }
  return sums
}

function firstMismatch(
  block: RegionRollupFigures,
  sums: Map<string, number | null>
): string | null {
  for (const [k, v] of figureCounts(block)) {
    const want = sums.has(k) ? sums.get(k)! : 0
    if (v !== want) return `${k} is ${v}, its districts sum to ${want}`
  }
  return null
}

/**
 * snapshots/<date>/region-rollups.json (#1799): the shared-contracts schema;
 * served under its own date, with that LOGICAL date's program year (a June
 * close is collected in July — the #1284 slip); world = Σ districts; and
 * each region lists only districts placed in it, summing to them.
 */
function checkRegionRollups(path: string, value: unknown): string | null {
  const parsed = RegionRollupsSchema.safeParse(value)
  if (!parsed.success) {
    return `schema validation failed: ${summarizeZodIssues(parsed.error.issues)}`
  }
  const r = parsed.data
  const date = REGION_ROLLUPS.exec(path)?.[1]
  if (r.snapshotDate !== date) {
    return `holds snapshotDate ${r.snapshotDate} but is served under ${date}`
  }
  const programYear = programYearForSnapshotDate(r.snapshotDate)
  if (r.programYear !== programYear) {
    return `programYear ${r.programYear}, but ${r.snapshotDate} is in ${programYear}`
  }
  const rows = Object.values(r.districts)
  if (r.world.districts !== rows.length) {
    return `world.districts is ${r.world.districts}, but ${rows.length} districts are listed`
  }
  const world = firstMismatch(r.world, sumFigures(rows))
  if (world !== null) return `world: ${world}`
  for (const [region, block] of Object.entries(r.regions ?? {})) {
    const members = block.districtIds.map(id => r.districts[id])
    const stray = block.districtIds.find(
      (id, i) => members[i]?.region !== region
    )
    if (stray !== undefined) {
      return `region ${region} lists district ${stray}, which is not placed in it`
    }
    const mismatch = firstMismatch(
      block,
      sumFigures(members as RegionRollupFigures[])
    )
    if (mismatch !== null) return `region ${region}: ${mismatch}`
  }
  return null
}

function checkLatest(value: unknown): string | null {
  const date = (value as { latestSnapshotDate?: unknown } | null)
    ?.latestSnapshotDate
  return calendarDate(date) === null
    ? `latestSnapshotDate is not a YYYY-MM-DD date: ${JSON.stringify(date)?.slice(0, 40)}`
    : null
}

/** Content-check one object. Returns the failure reason, or null. */
export function checkObject(
  check: PlannedCheck,
  object: StoredObject,
  prod: StoredObject | null,
  ctx: CheckContext
): string | null {
  if (check.expectedSha256 !== undefined) {
    const hash = checkWrittenHash(object, check.expectedSha256)
    if (hash !== null) return hash
  }
  const decoded = decodeStoredObject(object)
  if (!decoded.ok) return decoded.reason
  const value = decoded.value

  // #2026: club contact email/phone are never promoted. Names the path,
  // never the value, so the step summary stays safe to read.
  const contact = findClubContactField(value)
  if (contact !== null) {
    return `${contact} is a non-empty club contact field; email/phone are never promoted (#2026)`
  }

  switch (check.kind) {
    case 'time-series-metadata':
      return checkTimeSeriesMetadata({ ok: true, body: JSON.stringify(value) })
        .failure
    case 'time-series-program-year':
      return checkProgramYear(value, prod)
    case 'competitive-awards':
      return checkAwards(check.path, value, ctx)
    case 'district-analytics':
      return checkDistrictAnalytics(value)
    case 'snapshot-index':
      return checkDistrictSnapshotIndex({
        ok: true,
        body: JSON.stringify(value),
      })
    case 'district-region-history':
      return checkRegionHistory(value)
    case 'club-district-history-index':
      return checkClubHistoryIndex(value, ctx)
    case 'club-district-history-shard':
      return checkClubHistoryShard(check.path, value)
    case 'region-rollups':
      return checkRegionRollups(check.path, value)
    case 'latest':
      return checkLatest(value)
    case 'json':
      return null
  }
}

/**
 * `v1/latest.json` must name a date the snapshot index lists for at least
 * one district, or the frontend opens on a date it has no district data for.
 * (Not "equals the index's max date": a run can legitimately add a dated
 * directory with no district file, e.g. global-only outputs.)
 */
export function checkLatestAgreesWithIndex(
  latest: StoredObject,
  index: StoredObject
): string | null {
  const l = decodeStoredObject(latest)
  const i = decodeStoredObject(index)
  if (!l.ok) return `${LATEST_PATH}: ${l.reason}`
  if (!i.ok) return `${SNAPSHOT_INDEX_PATH}: ${i.reason}`
  const date = (l.value as { latestSnapshotDate?: unknown } | null)
    ?.latestSnapshotDate
  const districts = (i.value as { districts?: unknown } | null)?.districts
  if (typeof date !== 'string' || typeof districts !== 'object' || !districts) {
    return 'latest manifest or snapshot index has the wrong shape'
  }
  const listed = Object.values(districts as Record<string, unknown>).some(
    dates => Array.isArray(dates) && dates.includes(date)
  )
  return listed
    ? null
    : `${LATEST_PATH} names ${date}, but no district in ${SNAPSHOT_INDEX_PATH} lists that date`
}

export interface ContentGateInput {
  changedCount: number
  results: CheckResult[]
  notJson?: number
  sampledOut?: number
  /** Run-manifest objects under the promoted prefixes (all read, #1762). */
  manifestCount?: number
  /** Set when the gate could not list or read: fail closed. */
  error?: string
}

export interface ContentGateResult {
  promote: boolean
  changedCount: number
  checked: CheckResult[]
  failures: Array<{ path: string; reason: string }>
  notJson: number
  sampledOut: number
  manifestCount: number
  reason: string
}

export function evaluateContentGate(
  input: ContentGateInput
): ContentGateResult {
  const failures = input.results
    .filter(r => r.failure !== null)
    .map(r => ({ path: r.path, reason: r.failure as string }))
  const base = {
    changedCount: input.changedCount,
    checked: input.results,
    notJson: input.notJson ?? 0,
    sampledOut: input.sampledOut ?? 0,
    manifestCount: input.manifestCount ?? 0,
  }

  if (input.error) {
    return {
      ...base,
      promote: false,
      failures: [{ path: '(gate)', reason: input.error }],
      reason: `content gate could not run — failing closed: ${input.error}`,
    }
  }

  return {
    ...base,
    promote: failures.length === 0,
    failures,
    reason:
      failures.length === 0
        ? `all ${input.results.length} checked object(s) decode, parse and have the expected shape`
        : `${failures.length} of ${input.results.length} checked object(s) fail decoding, parsing or shape`,
  }
}

/** What each kind asserts, for the step summary. */
export const ASSERTIONS: Record<ObjectKind | 'cross-check', string> = {
  'time-series-metadata':
    'one Content-Encoding layer peeled, no gzip left, JSON, TimeSeriesIndexMetadataSchema, a program year listed',
  'time-series-program-year':
    'decoded as above, ProgramYearIndexFileSchema, a last point with a real date, not older than production’s last point',
  'competitive-awards':
    'decoded, clubStrengthAward.allDistricts non-empty; current PY: priorYearAvgClubSize not null for every district (#1704)',
  'district-analytics': 'decoded, has `metadata` and `data` objects',
  'snapshot-index': 'decoded, `districts` maps ids to YYYY-MM-DD arrays',
  'region-rollups':
    'decoded, RegionRollupsSchema, served under its snapshotDate with that date’s program year, world = Σ districts, each region = Σ its districts (#1799)',
  latest: 'decoded, latestSnapshotDate is a real date',
  json: 'decoded (no nested gzip) and parses as JSON; every kind: no non-empty club email/phone (#2026)',
  'cross-check': 'latest.json’s date is listed by the snapshot index',
}

const MAX_LISTED = 300

export function buildContentGateSummary(result: ContentGateResult): string {
  const lines = [
    '## 🧪 Content gate (staging objects promotion would copy, #1715)',
    '',
    `- **Result**: ${result.promote ? '✅ pass' : '❌ **HOLD**'} — ${result.reason}`,
    `- Written by this run (run manifest, every one read): ${result.manifestCount} · changed objects vs production: ${result.changedCount} · checked: ${result.checked.length} · not JSON: ${result.notJson} · not written by this run and outside the sample: ${result.sampledOut}`,
    '',
    '| Kind | Checked | Failed | Asserted |',
    '| --- | ---: | ---: | --- |',
  ]
  const kinds = [...new Set(result.checked.map(c => c.kind))].sort()
  for (const kind of kinds) {
    const of = result.checked.filter(c => c.kind === kind)
    const failed = of.filter(c => c.failure !== null).length
    lines.push(`| ${kind} | ${of.length} | ${failed} | ${ASSERTIONS[kind]} |`)
  }
  lines.push('')

  if (result.failures.length > 0) {
    lines.push('### Failures', '', '| Object | Reason |', '| --- | --- |')
    const cell = (s: string) => s.replaceAll('|', '\\|')
    for (const f of result.failures.slice(0, MAX_LISTED)) {
      lines.push(`| ${cell(f.path)} | ${cell(f.reason)} |`)
    }
    lines.push('')
  }

  lines.push('<details><summary>Objects checked</summary>', '')
  for (const c of result.checked.slice(0, MAX_LISTED)) {
    lines.push(`- ${c.failure === null ? '✅' : '❌'} \`${c.path}\``)
  }
  if (result.checked.length > MAX_LISTED) {
    lines.push(`- _…and ${result.checked.length - MAX_LISTED} more_`)
  }
  lines.push('', '</details>', '')
  return lines.join('\n')
}
