/**
 * `snapshots/{date}/meeting-times.json` (#1814, epic #1781).
 *
 * @module @taverns-red/analytics-core/rollup
 */
import type {
  DistrictRanking,
  DistrictRegionHistory,
  MeetingSlotClub,
  MeetingTimes,
} from '@taverns-red/shared-contracts'

export interface MeetingTimesDistrictInput {
  readonly districtId: string
  readonly clubs: readonly MeetingSlotClub[]
}

export interface MeetingTimesInput {
  readonly snapshotDate: string
  readonly rankings: readonly Pick<DistrictRanking, 'districtId'>[]
  readonly districts: readonly MeetingTimesDistrictInput[]
  readonly regionHistory: DistrictRegionHistory | null
  readonly regionHistoryNote?: string
  readonly generatedAt?: string
}

export interface MeetingTimesResult {
  readonly meetingTimes: MeetingTimes
  readonly missingDistricts: string[]
}

export function buildMeetingTimes(
  _input: MeetingTimesInput
): MeetingTimesResult {
  throw new Error('not implemented (#1814)')
}

export function readMeetingTimesInput(_snapshotDir: string): {
  rankings: DistrictRanking[]
  districts: MeetingTimesDistrictInput[]
} {
  throw new Error('not implemented (#1814)')
}
