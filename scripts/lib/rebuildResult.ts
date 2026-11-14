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
  // Real compute results carry objects here ({ districtId, error, timestamp });
  // the script has always interpolated errors[0] as-is, kept for no behaviour change.
  errors?: unknown[]
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
      label: `⚠️  failed: ${result.errors?.[0] ?? 'unknown'}`,
    }
  }
  const s = result.districtsSkipped?.length ?? 0
  const p = result.districtsSucceeded?.length ?? 0
  if (p > 0) return { category: 'ok', label: `✓ (${p} districts)` }
  if (s > 0) return { category: 'skipped', label: `⊘ skipped (${s} unchanged)` }
  return { category: 'ok', label: '✓' }
}
