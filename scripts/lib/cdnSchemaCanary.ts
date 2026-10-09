/**
 * Live-CDN schema canary — pure decision logic (#1125).
 *
 * The propagation-axis complement of the publish gate (Lesson 155): the
 * gate certifies what the pipeline is about to publish; this canary runs
 * the real read-validation — the same `PerDistrictDataSchema.safeParse`
 * the mcp-server performs — against what the published CDN is actually
 * serving, and alerts when a validating consumer would get schema
 * not-available.
 *
 * Failure-to-tell (unreachable manifest, zero districts, garbage JSON) is
 * itself an alert condition, never a pass (Lesson 107).
 *
 * No I/O here — the runner (scripts/check-cdn-schema.ts) fetches and the
 * workflow alerts. Mirrors the pipelineFreshness / promotionAlert pattern.
 */

import {
  PerDistrictDataSchema,
  ProgramYearIndexFileSchema,
  TimeSeriesIndexMetadataSchema,
} from '@taverns-red/shared-contracts'
import { summarizeZodIssues } from './zodIssueSummary.js'

/**
 * A response body as the consumer receives it AFTER HTTP decoding — i.e.
 * after fetch has peeled the one `Content-Encoding` layer, exactly as a
 * browser does. Bytes are preferred (gzip magic is detectable); a string is
 * accepted for already-decoded text.
 */
export type CdnBody = string | Uint8Array

/** Transport-level outcome of fetching one CDN object. */
export interface CdnFetchOutcome {
  /** HTTP-level success (fetch resolved with a 2xx). */
  ok: boolean
  status?: number
  /** Response body after HTTP decoding, when ok. */
  body?: CdnBody
  /** Network/transport error message when the fetch itself failed. */
  error?: string
}

export interface DistrictFetchResult extends CdnFetchOutcome {
  districtId: string
}

export interface CdnObjectFetch extends CdnFetchOutcome {
  /** Object path relative to the CDN base, e.g. `config/x.json`. */
  path: string
}

/** One non-district object check, already evaluated (failure null = pass). */
export interface ObjectCheck {
  path: string
  failure: string | null
}

export interface CanaryInput {
  /** `latestSnapshotDate` from v1/latest.json, null when unavailable. */
  latestDate: string | null
  /** Set when v1/latest.json or the snapshot manifest could not be read. */
  manifestError?: string
  districts: DistrictFetchResult[]
  /** time-series/** and config/** object checks (#1710). */
  objects?: ObjectCheck[]
}

export interface CanaryFailure {
  districtId: string
  reason: string
}

export interface ObjectFailure {
  path: string
  reason: string
}

export interface CanaryResult {
  healthy: boolean
  latestDate: string | null
  checked: number
  failures: CanaryFailure[]
  objectsChecked: number
  objectFailures: ObjectFailure[]
  reason: string
}

/** gzip member header magic (RFC 1952). */
const GZIP_MAGIC = [0x1f, 0x8b] as const

export type DecodeResult =
  { ok: true; value: unknown } | { ok: false; reason: string }

/**
 * Turn a fetched body into JSON the way a browser's `response.json()` would,
 * after the HTTP layer peeled its one Content-Encoding layer. A body that
 * still starts with gzip magic is a nested-gzip object (#1702) — unreadable
 * to every consumer — and is named as such rather than as a vague parse error.
 */
export function decodeCdnJson(
  fetch: CdnFetchOutcome | CdnObjectFetch | DistrictFetchResult
): DecodeResult {
  if (!fetch.ok) {
    return {
      ok: false,
      reason: fetch.error
        ? `fetch failed: ${fetch.error}`
        : `fetch failed: HTTP ${fetch.status ?? '?'}`,
    }
  }

  const body = fetch.body ?? ''
  let text: string
  if (typeof body === 'string') {
    text = body
  } else {
    if (body[0] === GZIP_MAGIC[0] && body[1] === GZIP_MAGIC[1]) {
      return {
        ok: false,
        reason:
          'body is still gzip-encoded after HTTP decoding (nested gzip, #1702) — browsers cannot parse it',
      }
    }
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(body)
    } catch {
      return { ok: false, reason: 'body is not valid UTF-8' }
    }
  }

  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: `invalid JSON: ${message}` }
  }
}

function validateDistrict(fetch: DistrictFetchResult): CanaryFailure | null {
  const decoded = decodeCdnJson(fetch)
  if (!decoded.ok) {
    return { districtId: fetch.districtId, reason: decoded.reason }
  }

  const result = PerDistrictDataSchema.safeParse(decoded.value)
  if (result.success) return null

  return {
    districtId: fetch.districtId,
    reason: `schema validation failed: ${summarizeZodIssues(result.error.issues)}`,
  }
}

/**
 * The latest date is remote input that ends up in $GITHUB_OUTPUT lines and
 * issue titles — only a strict YYYY-MM-DD ever propagates (injection guard).
 */
const SNAPSHOT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const DAY_MS = 86_400_000

/** UTC epoch ms for a real calendar YYYY-MM-DD, or null (rejects 02-30). */
function parseCalendarDate(value: string): number | null {
  if (!SNAPSHOT_DATE_PATTERN.test(value)) return null
  const ms = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString().slice(0, 10) === value ? ms : null
}

/**
 * `time-series/district_{id}/index-metadata.json`: decode, validate, and
 * resolve the current program year from the data (its latest listed PY),
 * not the calendar (#1284).
 */
export function checkTimeSeriesMetadata(fetch: CdnFetchOutcome): {
  failure: string | null
  currentProgramYear: string | null
} {
  const decoded = decodeCdnJson(fetch)
  if (!decoded.ok) return { failure: decoded.reason, currentProgramYear: null }

  const parsed = TimeSeriesIndexMetadataSchema.safeParse(decoded.value)
  if (!parsed.success) {
    return {
      failure: `schema validation failed: ${summarizeZodIssues(parsed.error.issues)}`,
      currentProgramYear: null,
    }
  }

  const years = [...parsed.data.availableProgramYears].sort()
  const current = years[years.length - 1]
  if (current === undefined) {
    return {
      failure: 'no program year listed in availableProgramYears',
      currentProgramYear: null,
    }
  }
  return { failure: null, currentProgramYear: current }
}

/**
 * The current-PY `time-series/district_{id}/{py}.json`: decode, validate, and
 * require a last data point with a real date no older than `maxAgeDays`
 * (and not in the future) relative to `now`.
 */
export function checkTimeSeriesProgramYear(
  fetch: CdnFetchOutcome,
  opts: { now: Date; maxAgeDays: number }
): string | null {
  const decoded = decodeCdnJson(fetch)
  if (!decoded.ok) return decoded.reason

  const parsed = ProgramYearIndexFileSchema.safeParse(decoded.value)
  if (!parsed.success) {
    return `schema validation failed: ${summarizeZodIssues(parsed.error.issues)}`
  }

  const points = parsed.data.dataPoints
  const last = points[points.length - 1]
  if (last === undefined) return 'no data points — the file has no last point'

  const lastMs = parseCalendarDate(last.date)
  if (lastMs === null) {
    return `last data point has an invalid date: ${JSON.stringify(last.date)}`
  }

  const todayMs = Date.parse(`${opts.now.toISOString().slice(0, 10)}T00:00:00Z`)
  const ageDays = Math.round((todayMs - lastMs) / DAY_MS)
  if (ageDays < 0) {
    return `last data point ${last.date} is in the future`
  }
  if (ageDays > opts.maxAgeDays) {
    return `last data point ${last.date} is ${ageDays} days old (max ${opts.maxAgeDays} days)`
  }
  return null
}

/** `config/district-snapshot-index.json`: decode and shape-check. */
export function checkDistrictSnapshotIndex(
  fetch: CdnFetchOutcome
): string | null {
  const decoded = decodeCdnJson(fetch)
  if (!decoded.ok) return decoded.reason

  const value = decoded.value as { districts?: unknown } | null
  const districts = value?.districts
  if (
    typeof districts !== 'object' ||
    districts === null ||
    Array.isArray(districts)
  ) {
    return 'missing a `districts` object'
  }

  const entries = Object.entries(districts as Record<string, unknown>)
  if (entries.length === 0) return 'no districts in the index'

  for (const [id, dates] of entries) {
    if (
      !Array.isArray(dates) ||
      !dates.every(d => typeof d === 'string' && SNAPSHOT_DATE_PATTERN.test(d))
    ) {
      return `district ${id}: dates must be an array of YYYY-MM-DD strings`
    }
  }
  return null
}

/** The anchor district always checked (Ron's home district). */
export const ANCHOR_DISTRICT = '61'

/**
 * D61 plus `count` other distinct published districts, chosen at random so
 * coverage rotates across runs. `random` is injectable for tests.
 */
export function pickTimeSeriesDistricts(
  publishedIds: string[],
  count: number,
  random: () => number = Math.random
): string[] {
  const pool = [...new Set(publishedIds)].filter(id => id !== ANCHOR_DISTRICT)
  const picked: string[] = [ANCHOR_DISTRICT]
  while (picked.length <= count && pool.length > 0) {
    const index = Math.min(Math.floor(random() * pool.length), pool.length - 1)
    picked.push(...pool.splice(index, 1))
  }
  return picked
}

export function evaluateCdnSchema(input: CanaryInput): CanaryResult {
  if (
    input.latestDate !== null &&
    !SNAPSHOT_DATE_PATTERN.test(input.latestDate)
  ) {
    return {
      healthy: false,
      latestDate: null,
      checked: 0,
      failures: [],
      objectsChecked: 0,
      objectFailures: [],
      reason: `malformed latest snapshot date from v1/latest.json: ${JSON.stringify(
        input.latestDate.slice(0, 40)
      )}`,
    }
  }

  if (input.manifestError || input.latestDate === null) {
    return {
      healthy: false,
      latestDate: input.latestDate,
      checked: 0,
      failures: [],
      objectsChecked: 0,
      objectFailures: [],
      reason: `could not resolve the published snapshot to check: ${
        input.manifestError ?? 'no latest snapshot date'
      }`,
    }
  }

  if (input.districts.length === 0) {
    return {
      healthy: false,
      latestDate: input.latestDate,
      checked: 0,
      failures: [],
      objectsChecked: 0,
      objectFailures: [],
      reason:
        'no district snapshots to check — the canary cannot pass on an empty set',
    }
  }

  const failures = input.districts
    .map(validateDistrict)
    .filter((f): f is CanaryFailure => f !== null)

  const objects = input.objects ?? []
  const objectFailures: ObjectFailure[] = objects
    .filter(o => o.failure !== null)
    .map(o => ({ path: o.path, reason: o.failure as string }))

  const reasons: string[] = []
  if (failures.length === 0) {
    reasons.push(
      `all ${input.districts.length} published district snapshot(s) pass the mcp-server read-validation`
    )
  } else {
    reasons.push(
      `${failures.length} of ${input.districts.length} published district snapshot(s) would be schema not-available to validating consumers`
    )
  }
  if (objects.length > 0) {
    reasons.push(
      objectFailures.length === 0
        ? `all ${objects.length} time-series/config object(s) decode and validate`
        : `${objectFailures.length} of ${objects.length} time-series/config object(s) fail decoding or validation`
    )
  }

  return {
    healthy: failures.length === 0 && objectFailures.length === 0,
    latestDate: input.latestDate,
    checked: input.districts.length,
    failures,
    objectsChecked: objects.length,
    objectFailures,
    reason: reasons.join('; '),
  }
}

export function buildCanaryIssueTitle(result: CanaryResult): string {
  return result.healthy
    ? 'cdn schema healthy'
    : `🚨 CDN schema canary — published snapshot ${result.latestDate ?? '(unknown date)'} fails read-validation`
}

export function buildCanaryIssueBody(
  result: CanaryResult,
  opts: { baseUrl: string; now: Date }
): string {
  const lines = [
    '## CDN Schema Canary alert (#1125)',
    '',
    `- **Checked surface**: ${opts.baseUrl}`,
    `- **Snapshot date**: ${result.latestDate ?? 'unknown'}`,
    `- **Districts checked**: ${result.checked}`,
    `- **Time-series/config objects checked**: ${result.objectsChecked}`,
    `- **Checked at**: ${opts.now.toISOString()}`,
    `- **Result**: ${result.reason}`,
    '',
    'A validating consumer (mcp-server `get-district-snapshot` /',
    '`get-club-health`) gets **not-available** for every district listed',
    'below — the same outage class as the #1096 incident. A failing',
    'time-series/config object breaks the frontend the same way (#1702:',
    'nested-gzip time-series broke Trends).',
    '',
  ]

  const cell = (s: string) => s.replaceAll('|', '\\|')
  if (result.failures.length > 0) {
    lines.push('| District | Reason |', '| --- | --- |')
    for (const f of result.failures) {
      lines.push(`| ${cell(f.districtId)} | ${cell(f.reason)} |`)
    }
    lines.push('')
  }

  if (result.objectFailures.length > 0) {
    lines.push('| Object | Reason |', '| --- | --- |')
    for (const f of result.objectFailures) {
      lines.push(`| ${cell(f.path)} | ${cell(f.reason)} |`)
    }
    lines.push('')
  }

  lines.push(
    '### Remediation',
    '',
    '- Schema validation failures: the published payload has drifted from',
    '  `shared-contracts` — find the writer that produced the invalid',
    '  snapshot (transform, merge-find-a-club, or a newer post-processor)',
    '  and fix the contract or the writer. Check why the publish gate',
    '  (`scripts/validate-snapshots.ts`) did not catch it before upload.',
    '- Fetch failures: check the CDN/bucket and the daily pipeline run.',
    '- "still gzip-encoded": the object is gzip-wrapped more than once',
    '  (#1702). Check the store download normaliser and the `-Z` upload',
    '  guard in the data pipeline.',
    '- Stale last point: the time-series store stopped advancing; check',
    '  `compute-analytics` in the latest data-pipeline run.',
    '- This issue self-clears: the next healthy canary run closes it.',
    ''
  )

  return lines.join('\n')
}
