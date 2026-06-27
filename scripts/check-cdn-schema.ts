/**
 * Live-CDN Schema Canary — Runner (#1125)
 *
 * Thin glue around the pure functions in ./lib/cdnSchemaCanary.js:
 *   1. fetch the published v1/latest.json (production CDN by default),
 *   2. fetch the snapshot manifest for the latest date to discover the
 *      published districts,
 *   3. fetch each district snapshot and run the real read-validation
 *      (the same PerDistrictDataSchema.safeParse the mcp-server performs),
 *   4. emit a healthy/unhealthy decision + alert body for the workflow.
 *
 * No decision logic lives here — that is unit-tested in
 * scripts/lib/__tests__/cdnSchemaCanary.test.ts. All logging goes to
 * stderr (R4); $GITHUB_OUTPUT carries only the structured decision.
 *
 * Env:
 *   CDN_BASE_URL  — surface to check (default: the production CDN edge,
 *                   the same base the mcp-server reads)
 *   MAX_DISTRICTS — optional cap on districts checked; unset, 0 or
 *                   non-numeric means ALL; skipped districts are logged
 *                   loudly (no silent caps)
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
  type CanaryResult,
  type DistrictFetchResult,
} from './lib/cdnSchemaCanary.js'

// The edge consumers actually read (mcp-server CdnClient default), not the
// origin bucket — an LB/edge-layer failure must also trip the canary.
const DEFAULT_BASE_URL = 'https://cdn.taverns.red'

const BODY_FILE = '/tmp/cdn-schema-canary-body.md'

const FETCH_TIMEOUT_MS = 20_000

/** Bound the fan-out against GCS — ~128 published districts (#1125). */
const FETCH_CONCURRENCY = 16

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

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`)
  }
  return res.text()
}

async function fetchDistrict(
  baseUrl: string,
  date: string,
  districtId: string
): Promise<DistrictFetchResult> {
  const url = `${baseUrl}/snapshots/${encodeURIComponent(date)}/district_${encodeURIComponent(districtId)}.json`
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      return { districtId, ok: false, status: res.status }
    }
    return { districtId, ok: true, status: res.status, body: await res.text() }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { districtId, ok: false, error: message }
  }
}

async function main(): Promise<void> {
  const baseUrl = process.env.CDN_BASE_URL || DEFAULT_BASE_URL
  const now = new Date()

  log(`Checking CDN schema: ${baseUrl}`)

  let latestDate: string | null = null
  let result: CanaryResult

  try {
    const manifestRaw = await fetchText(`${baseUrl}/v1/latest.json`)
    const manifest = JSON.parse(manifestRaw) as {
      latestSnapshotDate?: unknown
    }
    latestDate =
      typeof manifest.latestSnapshotDate === 'string'
        ? manifest.latestSnapshotDate
        : null
    if (latestDate === null) {
      throw new Error('v1/latest.json has no latestSnapshotDate')
    }
    log(`Latest published snapshot date: ${latestDate}`)

    const snapshotManifestRaw = await fetchText(
      `${baseUrl}/snapshots/${encodeURIComponent(latestDate)}/manifest.json`
    )
    const snapshotManifest = SnapshotManifestSchema.safeParse(
      JSON.parse(snapshotManifestRaw)
    )
    if (!snapshotManifest.success) {
      throw new Error(
        `snapshots/${latestDate}/manifest.json fails its schema: ${snapshotManifest.error.issues[0]?.message ?? 'unknown'}`
      )
    }

    let districtIds = snapshotManifest.data.districts
      .filter(d => d.status === 'success')
      .map(d => d.districtId)
      .sort()

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

    result = evaluateCdnSchema({ latestDate, districts })
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
