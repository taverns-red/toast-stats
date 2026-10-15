import { useQuery } from '@tanstack/react-query'
import type { SuspendedClub } from '@taverns-red/shared-contracts'
import { fetchCdnSuspendedClubs } from '../services/cdn'
import type { SnapshotDate } from '../types/snapshotDate'

/* #1794 — the district's suspended-this-program-year clubs for the DISPLAYED
   snapshot (R3), from `snapshots/{date}/suspended-clubs.json` (#1953).

   `clubs` is `null` when the list was not measured: the date has no file
   (older dates until they are re-derived), the file is another date's, or
   the district is absent from it. `[]` is a measured zero. The two must never
   be merged — "none suspended" is a claim the data has to make. */

export function useSuspendedClubs(
  districtId: string | undefined,
  date: SnapshotDate | undefined
): { clubs: SuspendedClub[] | null; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['suspended-clubs', date ?? 'none'],
    queryFn: () => {
      if (!date) throw new Error('A snapshot date is required')
      return fetchCdnSuspendedClubs(date)
    },
    enabled: Boolean(date),
    staleTime: 15 * 60 * 1000,
  })

  if (!data || !districtId || data.snapshotDate !== date) {
    return { clubs: null, isLoading }
  }
  return { clubs: data.districts[districtId] ?? null, isLoading }
}
