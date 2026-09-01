/**
 * `snapshots/{date}/global-totals.json` — the worldwide scoreboard for one
 * snapshot date (#1498, epic #1496, ruled on #1426).
 *
 * STUB. The behaviour is specified by the failing tests in
 * `./globalTotals.test.ts` and `scripts/lib/__tests__/globalTotals.test.ts`.
 *
 * @module @taverns-red/analytics-core/rollup
 */

import type {
  DistrictRanking,
  GlobalTotals,
} from '@taverns-red/shared-contracts'
import type { DistrictClubPayments } from './globalRollup.js'

export interface GlobalTotalsInput {
  /** The snapshot's own date (YYYY-MM-DD) — the key for every window. */
  readonly snapshotDate: string
  /** Every district file found in the snapshot directory. */
  readonly districts: readonly DistrictClubPayments[]
  /** The date's own `all-districts-rankings.json` rows — the district set. */
  readonly rankings: readonly DistrictRanking[]
}

/**
 * The program year a snapshot date belongs to (July 1 → June 30), keyed on
 * the SNAPSHOT DATE and never on `metadata.sourceCsvDate`: a year-end
 * snapshot's source date falls in July, which lands one era late (Lesson 139).
 */
export function programYearForSnapshotDate(snapshotDate: string): string {
  const year = Number.parseInt(snapshotDate.slice(0, 4), 10)
  const month = Number.parseInt(snapshotDate.slice(5, 7), 10)
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

export function buildGlobalTotals(_input: GlobalTotalsInput): GlobalTotals {
  throw new Error('buildGlobalTotals is not implemented yet (#1498)')
}
