/**
 * `time-series/regions/{programYear}.json` — region and world membership
 * series (#2127). Stub: the builder lands in the next commit.
 *
 * @module @taverns-red/analytics-core/rollup
 */

import type {
  DistrictRegionHistory,
  RegionMembershipSeries,
} from '@taverns-red/shared-contracts'

export interface RegionSeriesDistrictInput {
  readonly districtId: string
  readonly dataPoints: ReadonlyArray<{
    readonly date: string
    readonly membership: number
  }>
  readonly sourceGapDates?: readonly string[]
}

export interface RegionMembershipSeriesInput {
  readonly programYear: string
  readonly districts: readonly RegionSeriesDistrictInput[]
  readonly regionHistory: DistrictRegionHistory | null
  readonly regionHistoryNote?: string
}

export function buildRegionMembershipSeries(
  _input: RegionMembershipSeriesInput
): RegionMembershipSeries {
  throw new Error('buildRegionMembershipSeries: not implemented (#2127)')
}
