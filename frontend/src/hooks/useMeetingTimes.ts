/**
 * Meeting-time counts for one date (#1814) — ONE query for
 * `/regions/meetings` and every `/region/:n/meetings`; they share this key,
 * so moving between them is free.
 *
 * The page passes its own resolved snapshot date (R3); without one the hook
 * resolves latest itself. An absent artifact is `view: null` — "not
 * available yet for this date" — not an error.
 */
import { useQuery } from '@tanstack/react-query'
import { fetchCdnMeetingTimes, fetchLatestSnapshotDate } from '../services/cdn'
import type { SnapshotDate } from '../types/snapshotDate'
import type { MeetingTimesView } from '../utils/meetingTimesRollup'

export function meetingTimesQueryKey(
  date: SnapshotDate | undefined
): readonly ['meeting-times', string] {
  return ['meeting-times', date ?? 'latest'] as const
}

export interface UseMeetingTimesResult {
  view: MeetingTimesView | null
  isLoading: boolean
}

export function useMeetingTimes(
  date: SnapshotDate | undefined
): UseMeetingTimesResult {
  const query = useQuery<MeetingTimesView | null>({
    queryKey: meetingTimesQueryKey(date),
    queryFn: async () =>
      fetchCdnMeetingTimes(date ?? (await fetchLatestSnapshotDate())),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
  return { view: query.data ?? null, isLoading: query.isLoading }
}
