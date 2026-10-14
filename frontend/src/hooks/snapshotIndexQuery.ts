import { queryOptions } from '@tanstack/react-query'
import { fetchCdnSnapshotIndex } from '../services/cdn'

/** Query key for the shared district snapshot index (the availability set). */
export const snapshotIndexQueryKey: readonly unknown[] = [
  'district-snapshot-index',
]

/**
 * The `['district-snapshot-index']` query: one entry for
 * `config/district-snapshot-index.json` (~400 KB). Shared by
 * `useClubGrowthMilestones` and `districtCachedDatesQueryOptions` (which reads
 * through it), so the hub downloads the file once. Before #2027 the two read
 * it under separate keys and the hub fetched it twice.
 */
export function snapshotIndexQueryOptions() {
  return queryOptions({
    queryKey: snapshotIndexQueryKey,
    queryFn: fetchCdnSnapshotIndex,
    staleTime: 60 * 60 * 1000,
  })
}
