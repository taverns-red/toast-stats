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

import { gunzipSync } from 'node:zlib'
import { ProgramYearIndexFileSchema } from '@taverns-red/shared-contracts'
import {
  ANCHOR_DISTRICT,
  checkDistrictSnapshotIndex,
  checkTimeSeriesMetadata,
  decodeCdnJson,
  type DecodeResult,
} from './cdnSchemaCanary.js'
import { summarizeZodIssues } from './zodIssueSummary.js'
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
  | 'latest'
  | 'json'

export interface PlannedCheck {
  path: string
  kind: ObjectKind
  /** Also read the prod copy (time-series last-point regression). */
  compareWithProd?: boolean
}

export interface CheckContext {
  /** Staging `v1/latest.json` date, null when unreadable. */
  latestSnapshotDate: string | null
  /** Staging `v1/dates.json` dates, empty when unreadable. */
  availableDates: string[]
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

/** The kind of content check an object gets; null = not JSON, not checked. */
export function classifyObject(path: string): ObjectKind | null {
  if (!path.endsWith('.json')) return null
  if (TS_METADATA.test(path)) return 'time-series-metadata'
  if (TS_PROGRAM_YEAR.test(path)) return 'time-series-program-year'
  if (AWARDS.test(path)) return 'competitive-awards'
  if (DISTRICT_ANALYTICS.test(path)) return 'district-analytics'
  if (path === SNAPSHOT_INDEX_PATH) return 'snapshot-index'
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
    } else if (c.kind === 'latest' || c.kind === 'snapshot-index') {
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
  const decoded = decodeStoredObject(object)
  if (!decoded.ok) return decoded.reason
  const value = decoded.value

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
  latest: 'decoded, latestSnapshotDate is a real date',
  json: 'decoded (no nested gzip) and parses as JSON',
  'cross-check': 'latest.json’s date is listed by the snapshot index',
}

const MAX_LISTED = 300

export function buildContentGateSummary(result: ContentGateResult): string {
  const lines = [
    '## 🧪 Content gate (staging objects promotion would copy, #1715)',
    '',
    `- **Result**: ${result.promote ? '✅ pass' : '❌ **HOLD**'} — ${result.reason}`,
    `- Changed objects vs production: ${result.changedCount} · checked: ${result.checked.length} · not JSON: ${result.notJson} · outside the sample: ${result.sampledOut}`,
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
