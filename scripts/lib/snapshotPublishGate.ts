/**
 * Publish-time snapshot schema gate — pure decision logic (#1125).
 *
 * Validates district snapshot files against the shared
 * `PerDistrictDataSchema` so the data pipeline can refuse to upload a
 * contract-violating snapshot (fail-loud at publish time, staging-side).
 *
 * Why this exists: the transform write path already validates, but
 * `merge-find-a-club` (and any future post-processor) rewrites the files
 * in place WITHOUT re-validating — exactly how the #1096 FAC-enrichment
 * drift reached prod and broke the first validating consumer (mcp-server).
 * The gate validates the final on-disk bytes immediately before upload,
 * covering every writer.
 *
 * No I/O here — the runner (scripts/validate-snapshots.ts) reads files and
 * the workflow decides what to do. Mirrors the pipelineFreshness /
 * promotionAlert pattern.
 */

import { PerDistrictDataSchema } from '@taverns-red/shared-contracts'
import { summarizeZodIssues } from './zodIssueSummary.js'
import {
  districtIdFromSnapshotFileName,
  isDistrictSnapshotFile,
} from './snapshotFileNames.js'

// The canonical matcher lives in ./snapshotFileNames.ts (#1428) — re-exported
// here so scripts/validate-snapshots.ts keeps its single import site.
export { isDistrictSnapshotFile }

export interface SnapshotFileInput {
  /** Base file name, e.g. `district_61.json`. */
  fileName: string
  /** Raw file content (bytes as UTF-8 string). */
  content: string
}

export interface SnapshotGateFailure {
  fileName: string
  /** From the payload when parseable, else recovered from the file name. */
  districtId: string | null
  /** From the payload when parseable. */
  snapshotDate: string | null
  reason: string
}

export interface SnapshotGateResult {
  ok: boolean
  /** Number of district files validated (non-district files are ignored). */
  checked: number
  failures: SnapshotGateFailure[]
  reason: string
}

function validateDistrictFile(
  file: SnapshotFileInput
): SnapshotGateFailure | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(file.content)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      fileName: file.fileName,
      districtId: districtIdFromSnapshotFileName(file.fileName),
      snapshotDate: null,
      reason: `invalid JSON: ${message}`,
    }
  }

  const result = PerDistrictDataSchema.safeParse(parsed)
  if (result.success) return null

  const record = parsed as {
    districtId?: unknown
    data?: { snapshotDate?: unknown }
  }
  const districtId =
    typeof record?.districtId === 'string'
      ? record.districtId
      : districtIdFromSnapshotFileName(file.fileName)
  const snapshotDate =
    typeof record?.data?.snapshotDate === 'string'
      ? record.data.snapshotDate
      : null

  return {
    fileName: file.fileName,
    districtId,
    snapshotDate,
    reason: `schema validation failed: ${summarizeZodIssues(result.error.issues)}`,
  }
}

/**
 * Validate every `district_*.json` in the given file set against
 * `PerDistrictDataSchema`. Zero district files is a FAILURE — a gate that
 * validates nothing must not pass vacuously (Lesson 107: "can't tell" is
 * an alert, not a pass).
 */
export function evaluateSnapshotFiles(
  files: SnapshotFileInput[]
): SnapshotGateResult {
  const districtFiles = files.filter(f => isDistrictSnapshotFile(f.fileName))

  if (districtFiles.length === 0) {
    return {
      ok: false,
      checked: 0,
      failures: [],
      reason:
        'no district snapshot files found — the gate cannot pass on an empty set',
    }
  }

  const failures = districtFiles
    .map(validateDistrictFile)
    .filter((f): f is SnapshotGateFailure => f !== null)

  return {
    ok: failures.length === 0,
    checked: districtFiles.length,
    failures,
    reason:
      failures.length === 0
        ? `all ${districtFiles.length} district snapshot(s) match the shared contract`
        : `${failures.length} of ${districtFiles.length} district snapshot(s) violate the shared contract`,
  }
}

/** Markdown block for $GITHUB_STEP_SUMMARY. */
export function buildGateSummary(
  result: SnapshotGateResult,
  opts: { snapshotDir: string }
): string {
  const lines = [
    '## 🛡️ Snapshot Schema Gate (#1125)',
    '',
    `- **Directory**: \`${opts.snapshotDir}\``,
    `- **District files checked**: ${result.checked}`,
    `- **Result**: ${result.ok ? '✅ PASS' : '❌ FAIL'} — ${result.reason}`,
  ]
  if (result.failures.length > 0) {
    lines.push('', '| File | District | Snapshot date | Reason |')
    lines.push('| --- | --- | --- | --- |')
    for (const f of result.failures) {
      lines.push(
        `| \`${f.fileName}\` | ${f.districtId ?? '?'} | ${f.snapshotDate ?? '?'} | ${f.reason} |`
      )
    }
  }
  return lines.join('\n') + '\n'
}
