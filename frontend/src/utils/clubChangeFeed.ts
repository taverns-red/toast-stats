/**
 * Club "Recent changes" feed (#2430) — RED stub, implemented in the next commit.
 */
import type {
  DiffEventCategory,
  DistrictStatisticsFile,
} from '@taverns-red/shared-contracts'

export interface FeedPoint {
  date: string
  snapshot: DistrictStatisticsFile | null
}

export interface ClubChangeReason {
  text: string
  source: string
}

export interface ClubChangeEntry {
  key: string
  category: DiffEventCategory
  fromDate: string
  toDate: string
  text: string
  magnitude: number
  spansMissingData: boolean
  reason?: ClubChangeReason
}

export interface ClubChangeFeed {
  entries: ClubChangeEntry[]
  totalEvents: number
  truncated: boolean
  comparable: boolean
  hasReasons: boolean
  windowStart: string | null
  windowEnd: string | null
  unavailableDates: string[]
}

export function pickFeedDates<T extends string>(
  _dates: readonly T[],
  _asOf: string
): T[] {
  return []
}

export function reduceSnapshotToClub(
  _snapshot: DistrictStatisticsFile,
  _clubId: string
): DistrictStatisticsFile | null {
  return null
}

export function buildClubChangeFeed(
  _points: readonly FeedPoint[],
  _options: { maxEvents?: number } = {}
): ClubChangeFeed {
  return {
    entries: [],
    totalEvents: 0,
    truncated: false,
    comparable: false,
    hasReasons: false,
    windowStart: null,
    windowEnd: null,
    unavailableDates: [],
  }
}
