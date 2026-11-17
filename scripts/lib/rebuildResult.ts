/**
 * classifyRebuildResult — pure classification of one date's analytics compute
 * result for scripts/rebuild-analytics.ts (#2530).
 *
 * `districtsSucceeded` / `districtsSkipped` are district-id arrays, so the
 * counts come from `.length` (comparing the arrays with `> 0` never fired).
 */

export interface RebuildComputeResult {
  success: boolean
  districtsSucceeded?: string[]
  districtsSkipped?: string[]
  // Real compute results carry { districtId, error, timestamp } objects;
  // plain strings are still accepted.
  errors?: (RebuildError | string)[]
}

export interface RebuildError {
  districtId: string
  error: string
  timestamp?: string
}

function formatRebuildError(err: RebuildError | string | undefined): string {
  if (err === undefined) return 'unknown'
  if (typeof err === 'string') return err
  return err.districtId ? `${err.districtId}: ${err.error}` : err.error
}

export type RebuildCategory = 'ok' | 'skipped' | 'failed'

export interface RebuildClassification {
  category: RebuildCategory
  label: string
}

export function classifyRebuildResult(
  result: RebuildComputeResult
): RebuildClassification {
  if (!result.success) {
    return {
      category: 'failed',
      label: `⚠️  failed: ${formatRebuildError(result.errors?.[0])}`,
    }
  }
  const s = result.districtsSkipped?.length ?? 0
  const p = result.districtsSucceeded?.length ?? 0
  if (p > 0) return { category: 'ok', label: `✓ (${p} districts)` }
  if (s > 0) return { category: 'skipped', label: `⊘ skipped (${s} unchanged)` }
  return { category: 'ok', label: '✓' }
}
