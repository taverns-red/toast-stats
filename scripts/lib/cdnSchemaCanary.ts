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

import { PerDistrictDataSchema } from '@toastmasters/shared-contracts'

export interface DistrictFetchResult {
  districtId: string
  /** HTTP-level success (fetch resolved with a 2xx). */
  ok: boolean
  status?: number
  /** Raw response text when ok. */
  body?: string
  /** Network/transport error message when the fetch itself failed. */
  error?: string
}

export interface CanaryInput {
  /** `latestSnapshotDate` from v1/latest.json, null when unavailable. */
  latestDate: string | null
  /** Set when v1/latest.json or the snapshot manifest could not be read. */
  manifestError?: string
  districts: DistrictFetchResult[]
}

export interface CanaryFailure {
  districtId: string
  reason: string
}

export interface CanaryResult {
  healthy: boolean
  latestDate: string | null
  checked: number
  failures: CanaryFailure[]
  reason: string
}

/** Keep zod error detail bounded — first few issues tell the story. */
const MAX_ZOD_ISSUES = 5

function validateDistrict(fetch: DistrictFetchResult): CanaryFailure | null {
  if (!fetch.ok) {
    return {
      districtId: fetch.districtId,
      reason: fetch.error
        ? `fetch failed: ${fetch.error}`
        : `fetch failed: HTTP ${fetch.status ?? '?'}`,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(fetch.body ?? '')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { districtId: fetch.districtId, reason: `invalid JSON: ${message}` }
  }

  const result = PerDistrictDataSchema.safeParse(parsed)
  if (result.success) return null

  const issues = result.error.issues
  const detail = issues
    .slice(0, MAX_ZOD_ISSUES)
    .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ')
  const more =
    issues.length > MAX_ZOD_ISSUES
      ? ` (+${issues.length - MAX_ZOD_ISSUES} more issues)`
      : ''

  return {
    districtId: fetch.districtId,
    reason: `schema validation failed: ${detail}${more}`,
  }
}

export function evaluateCdnSchema(input: CanaryInput): CanaryResult {
  if (input.manifestError || input.latestDate === null) {
    return {
      healthy: false,
      latestDate: input.latestDate,
      checked: 0,
      failures: [],
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
      reason:
        'no district snapshots to check — the canary cannot pass on an empty set',
    }
  }

  const failures = input.districts
    .map(validateDistrict)
    .filter((f): f is CanaryFailure => f !== null)

  return {
    healthy: failures.length === 0,
    latestDate: input.latestDate,
    checked: input.districts.length,
    failures,
    reason:
      failures.length === 0
        ? `all ${input.districts.length} published district snapshot(s) pass the mcp-server read-validation`
        : `${failures.length} of ${input.districts.length} published district snapshot(s) would be schema not-available to validating consumers`,
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
    `- **Checked at**: ${opts.now.toISOString()}`,
    `- **Result**: ${result.reason}`,
    '',
    'A validating consumer (mcp-server `get-district-snapshot` /',
    '`get-club-health`) gets **not-available** for every district listed',
    'below — the same outage class as the #1096 incident.',
    '',
  ]

  if (result.failures.length > 0) {
    lines.push('| District | Reason |', '| --- | --- |')
    for (const f of result.failures) {
      lines.push(`| ${f.districtId} | ${f.reason} |`)
    }
    lines.push('')
  }

  lines.push(
    '### Remediation',
    '',
    '- Schema validation failures: the published payload has drifted from',
    '  `shared-contracts` — find the writer that bypassed the publish gate',
    '  (`scripts/validate-snapshots.ts`) and fix the contract or the writer.',
    '- Fetch failures: check the CDN/bucket and the daily pipeline run.',
    '- This issue self-clears: the next healthy canary run closes it.',
    ''
  )

  return lines.join('\n')
}
