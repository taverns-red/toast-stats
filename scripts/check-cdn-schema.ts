/**
 * Live-CDN Schema Canary — Runner (#1125, #1710)
 *
 * Thin glue around the pure functions in ./lib/cdnSchemaCanary.js:
 *   1. fetch the published v1/latest.json (production CDN by default),
 *   2. fetch the snapshot manifest for the latest date to discover the
 *      published districts,
 *   3. fetch each district snapshot and run the real read-validation
 *      (the same PerDistrictDataSchema.safeParse the mcp-server performs),
 *   4. fetch `config/district-snapshot-index.json` and, for D61 plus two
 *      random published districts, `time-series/district_{id}/index-metadata.json`
 *      and the current-PY file; decode each exactly as a browser does (one
 *      Content-Encoding layer), parse, validate, and require a fresh last
 *      point (#1710 — the #1702 nested-gzip outage class),
 *   5. emit a healthy/unhealthy decision + alert body for the workflow.
 *
 * No decision logic lives here — that is unit-tested in
 * scripts/lib/__tests__/cdnSchemaCanary.test.ts. All logging goes to
 * stderr (R4); $GITHUB_OUTPUT carries only the structured decision.
 *
 * Env:
 *   CDN_BASE_URL  — surface to check (default: the production CDN edge,
 *                   the same base the mcp-server reads)
 *   MAX_DISTRICTS — optional cap on district snapshots checked; unset, 0 or
 *                   non-numeric means ALL; skipped districts are logged
 *                   loudly (no silent caps)
 *   MAX_TIME_SERIES_AGE_DAYS — max age of the current-PY last data point
 *                   (default 3; plan S1-5)
 *
 * The process always exits 0; the workflow decides whether to open an
 * issue (and mark the run red) based on the `unhealthy` output. This
 * keeps the issue-create step reachable even when the CDN is broken.
 */

import { appendFileSync, writeFileSync } from 'node:fs'
import { SnapshotManifestSchema } from '@taverns-red/shared-contracts'
import {
  evaluateCdnSchema,
  buildCanaryIssueTitle,
  buildCanaryIssueBody,
  decodeCdnJson,
  checkDistrictSnapshotIndex,
  checkTimeSeriesMetadata,
  checkTimeSeriesProgramYear,
  pickTimeSeriesDistricts,
  type CanaryResult,
  type DistrictFetchResult,
  type ObjectCheck,
} from './lib/cdnSchemaCanary.js'
import { fetchCdnObject } from './lib/cdnFetch.js'

// The edge consumers actually read (mcp-server CdnClient default), not the
// origin bucket — an LB/edge-layer failure must also trip the canary.
const DEFAULT_BASE_URL = 'https://cdn.taverns.red'

const BODY_FILE = '/tmp/cdn-schema-canary-body.md'

/** Bound the fan-out against GCS — ~128 published districts (#1125). */
const FETCH_CONCURRENCY = 16

/** D61 plus this many random published districts get time-series checks. */
const RANDOM_TIME_SERIES_DISTRICTS = 2

const DEFAULT_MAX_TIME_SERIES_AGE_DAYS = 3

const SNAPSHOT_INDEX_PATH = 'config/district-snapshot-index.json'

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function emitOutput(key: string, value: string): void {
  const out = process.env.GITHUB_OUTPUT
  if (out) appendFileSync(out, `${key}=${value}\n`)
}

function emitDecision(result: CanaryResult, baseUrl: string, now: Date): void {
  emitOutput('unhealthy', String(!result.healthy))
  emitOutput('title', buildCanaryIssueTitle(result))
  if (!result.healthy) {
    writeFileSync(BODY_FILE, buildCanaryIssueBody(result, { baseUrl, now }))
    emitOutput('body_file', BODY_FILE)
    log('CDN schema is UNHEALTHY — alert body written.')
  } else {
    log('CDN schema is healthy — no alert.')
  }
}

/** Fetch + decode as a browser would; throws on any failure. */
async function fetchJson(baseUrl: string, path: string): Promise<unknown> {
  const decoded = decodeCdnJson(await fetchCdnObject(baseUrl, path))
  if (!decoded.ok) throw new Error(`${path}: ${decoded.reason}`)
  return decoded.value
}

async function fetchDistrict(
  baseUrl: string,
  date: string,
  districtId: string
): Promise<DistrictFetchResult> {
  const fetched = await fetchCdnObject(
    baseUrl,
    `snapshots/${encodeURIComponent(date)}/district_${encodeURIComponent(districtId)}.json`
  )
  return { ...fetched, districtId }
}

function resolveMaxAgeDays(): number {
  const raw = Number(process.env.MAX_TIME_SERIES_AGE_DAYS)
  return Number.isFinite(raw) && raw > 0
    ? raw
    : DEFAULT_MAX_TIME_SERIES_AGE_DAYS
}

/**
 * config/** and time-series/** checks. Each object is checked independently;
 * a failure is recorded, never thrown, so one broken object cannot hide the
 * state of the others.
 */
async function checkObjects(
  baseUrl: string,
  publishedIds: string[],
  now: Date
): Promise<ObjectCheck[]> {
  const maxAgeDays = resolveMaxAgeDays()
  const checks: ObjectCheck[] = [
    {
      path: SNAPSHOT_INDEX_PATH,
      failure: checkDistrictSnapshotIndex(
        await fetchCdnObject(baseUrl, SNAPSHOT_INDEX_PATH)
      ),
    },
  ]

  const ids = pickTimeSeriesDistricts(
    publishedIds,
    RANDOM_TIME_SERIES_DISTRICTS
  )
  log(
    `Checking time-series for district(s) ${ids.join(', ')} ` +
      `(last point max ${maxAgeDays} days old)...`
  )

  const perDistrict = await Promise.all(
    ids.map(async (id): Promise<ObjectCheck[]> => {
      const dir = `time-series/district_${encodeURIComponent(id)}`
      const metadataPath = `${dir}/index-metadata.json`
      const metadata = checkTimeSeriesMetadata(
        await fetchCdnObject(baseUrl, metadataPath)
      )
      const out: ObjectCheck[] = [
        { path: metadataPath, failure: metadata.failure },
      ]
      if (metadata.currentProgramYear !== null) {
        const pyPath = `${dir}/${metadata.currentProgramYear}.json`
        out.push({
          path: pyPath,
          failure: checkTimeSeriesProgramYear(
            await fetchCdnObject(baseUrl, pyPath),
            { now, maxAgeDays }
          ),
        })
      }
      return out
    })
  )
  checks.push(...perDistrict.flat())
  return checks
}

async function main(): Promise<void> {
  const baseUrl = process.env.CDN_BASE_URL || DEFAULT_BASE_URL
  const now = new Date()

  log(`Checking CDN schema: ${baseUrl}`)

  let latestDate: string | null = null
  let result: CanaryResult

  try {
    const manifest = (await fetchJson(baseUrl, 'v1/latest.json')) as {
      latestSnapshotDate?: unknown
    } | null
    latestDate =
      typeof manifest?.latestSnapshotDate === 'string'
        ? manifest.latestSnapshotDate
        : null
    if (latestDate === null) {
      throw new Error('v1/latest.json has no latestSnapshotDate')
    }
    log(`Latest published snapshot date: ${latestDate}`)

    const snapshotManifest = SnapshotManifestSchema.safeParse(
      await fetchJson(
        baseUrl,
        `snapshots/${encodeURIComponent(latestDate)}/manifest.json`
      )
    )
    if (!snapshotManifest.success) {
      throw new Error(
        `snapshots/${latestDate}/manifest.json fails its schema: ${snapshotManifest.error.issues[0]?.message ?? 'unknown'}`
      )
    }

    const publishedIds = snapshotManifest.data.districts
      .filter(d => d.status === 'success')
      .map(d => d.districtId)
      .sort()
    let districtIds = publishedIds

    const maxDistricts = Number(process.env.MAX_DISTRICTS)
    if (Number.isFinite(maxDistricts) && maxDistricts > 0) {
      const skipped = districtIds.slice(maxDistricts)
      if (skipped.length > 0) {
        log(
          `MAX_DISTRICTS=${maxDistricts} — checking first ${maxDistricts}, ` +
            `SKIPPING ${skipped.length}: ${skipped.join(', ')}`
        )
      }
      districtIds = districtIds.slice(0, maxDistricts)
    }

    log(`Checking ${districtIds.length} published district snapshot(s)...`)
    const districts: DistrictFetchResult[] = []
    for (let i = 0; i < districtIds.length; i += FETCH_CONCURRENCY) {
      const batch = districtIds.slice(i, i + FETCH_CONCURRENCY)
      districts.push(
        ...(await Promise.all(
          batch.map(id => fetchDistrict(baseUrl, latestDate as string, id))
        ))
      )
    }

    const objects = await checkObjects(baseUrl, publishedIds, now)
    for (const o of objects) {
      log(`  ${o.failure === null ? 'ok  ' : 'FAIL'} ${o.path}`)
    }

    result = evaluateCdnSchema({ latestDate, districts, objects })
  } catch (err) {
    // A fetch/parse failure on the manifest chain is itself an alert
    // condition — the canary can't tell what consumers see, and "can't
    // tell" must alert, never pass (Lesson 107).
    const message = err instanceof Error ? err.message : String(err)
    log(`Failed to resolve published snapshots: ${message}`)
    result = evaluateCdnSchema({
      latestDate,
      manifestError: message,
      districts: [],
    })
  }

  log(`Result: ${result.reason}`)
  for (const f of result.failures) {
    log(`  - district ${f.districtId}: ${f.reason}`)
  }
  for (const f of result.objectFailures) {
    log(`  - ${f.path}: ${f.reason}`)
  }
  emitDecision(result, baseUrl, now)
}

main().catch(err => {
  const message =
    err instanceof Error ? (err.stack ?? err.message) : String(err)
  log(`Unexpected error: ${message}`)
  // Surface as unhealthy — with a real body — so the canary still alerts
  // rather than passing silently.
  emitDecision(
    evaluateCdnSchema({
      latestDate: null,
      manifestError: `cdn schema canary crashed: ${message}`,
      districts: [],
    }),
    process.env.CDN_BASE_URL || DEFAULT_BASE_URL,
    new Date()
  )
  process.exit(0)
})
