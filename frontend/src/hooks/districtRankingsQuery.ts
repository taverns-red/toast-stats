import { queryOptions } from '@tanstack/react-query'
import {
  fetchCdnRankings,
  fetchCdnRankingsForDateExact,
  type CdnRankingsData,
} from '../services/cdn'
import type { SnapshotDate } from '../types/snapshotDate'

/** Query key for one dated rankings file, read exactly (no fallback). */
export const checkpointRankingsQueryKey = (
  date: SnapshotDate
): readonly unknown[] => ['rankings-checkpoint', date]

/**
 * The exact read of `snapshots/{date}/all-districts-rankings.json`: `null`
 * when the file is missing, never a substitute. One entry per dated file,
 * shared by the club-growth checkpoint readers and (through
 * `districtRankingsQueryOptions`) every dated rankings read, so a page whose
 * displayed date is a checkpoint's pinned date downloads that file once
 * (#2027: the hub read it under two keys).
 */
export function exactRankingsQueryOptions(date: SnapshotDate) {
  return queryOptions<CdnRankingsData | null>({
    queryKey: checkpointRankingsQueryKey(date),
    queryFn: () => fetchCdnRankingsForDateExact(date),
    staleTime: 60 * 60 * 1000,
  })
}

/**
 * The `['district-rankings', date ?? 'latest']` query — one entry per rankings
 * file. Shared by `useDistrictRanking`, `useLatestAsOfDate`, and `useDistricts` (which
 * reads through it), so a page mounting several of them downloads the file
 * once (#1901: the club page fetched `v1/rankings.json` twice, under two keys).
 *
 * A dated read goes through the exact entry above and falls back to the latest
 * file when the dated one is missing — `fetchCdnRankingsForDate`'s contract,
 * which `useDistrictRanking` detects by the unset `snapshotDate`.
 */
export function districtRankingsQueryOptions(date?: SnapshotDate) {
  return queryOptions({
    queryKey: ['district-rankings', date ?? 'latest'],
    queryFn: date
      ? async ({ client }): Promise<CdnRankingsData> =>
          (await client.fetchQuery(exactRankingsQueryOptions(date))) ??
          client.fetchQuery(districtRankingsQueryOptions())
      : fetchCdnRankings,
    staleTime: 15 * 60 * 1000,
  })
}
