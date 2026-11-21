import { useQuery } from '@tanstack/react-query'
import type {
  ReinstatableClub,
  ReinstatableClubs,
} from '@taverns-red/shared-contracts'
import { fetchCdnReinstatableClubs } from '../services/cdn'
import type { SnapshotDate } from '../types/snapshotDate'

/* #3007 — the district's reinstatable clubs for the DISPLAYED snapshot (R3),
   from `snapshots/{date}/reinstatable-clubs.json`.

   `clubs` is `null` when the list was not measured: the date has no file
   (dates before 2.94.0's first daily), the file is another date's, or the
   district is absent from it. `[]` is a measured zero. `baseProgramYear` is
   the program year whose July 1 club base a reinstatement on that date
   affects, as the pipeline computed it. */

/** The first snapshot date with a reinstatable-clubs file. No index lists
 *  which dates have one, so the Club Growth strip uses this to decide its
 *  fifth slot before the fetch settles and does not shift on older dates.
 *  Enforced by DistrictGrowthPage.test.tsx ("missing: a date before the
 *  first file never reserves the slot"). */
export const REINSTATABLE_CLUBS_FIRST_DATE = '2026-11-18'

/** #3094 — the whole dated file, every district, for the region and world
 *  funnels. Same query as the district hook, so the cache is shared. `file`
 *  is null when the date has no file. */
export function useReinstatableClubsFile(date: SnapshotDate | undefined): {
  file: ReinstatableClubs | null
  isLoading: boolean
} {
  const { data, isLoading } = useReinstatableQuery(date)
  return { file: data ?? null, isLoading }
}

function useReinstatableQuery(date: SnapshotDate | undefined) {
  return useQuery({
    queryKey: ['reinstatable-clubs', date ?? 'none'],
    queryFn: () => {
      if (!date) throw new Error('A snapshot date is required')
      return fetchCdnReinstatableClubs(date)
    },
    enabled: Boolean(date),
    staleTime: 15 * 60 * 1000,
  })
}

export function useReinstatableClubs(
  districtId: string | undefined,
  date: SnapshotDate | undefined
): {
  clubs: ReinstatableClub[] | null
  baseProgramYear: string | null
  isLoading: boolean
} {
  const { data, isLoading } = useReinstatableQuery(date)

  if (!data || !districtId || data.snapshotDate !== date) {
    return { clubs: null, baseProgramYear: null, isLoading }
  }
  return {
    clubs: data.districts[districtId] ?? null,
    baseProgramYear: data.baseProgramYear,
    isLoading,
  }
}
