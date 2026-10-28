import { useQuery } from '@tanstack/react-query'
import type { PerDistrictData } from '@taverns-red/shared-contracts'
import { fetchCdnDistrictSnapshot } from '../services/cdn'
import {
  deriveCouncilStanding,
  type CouncilStanding,
} from '../utils/councilStanding'
import type { SnapshotDate } from '../types/snapshotDate'

/**
 * Council voting strength (#2300) from one district snapshot. The page picks
 * the snapshot (`resolveCouncilSnapshot`) and passes it in (R3); this only
 * fetches that dated file and reads TI's club status off it. Disabled while
 * the page has no usable snapshot (no data, or another dues period).
 */
export function useCouncilStanding(
  districtId: string | undefined,
  snapshotDate: SnapshotDate | undefined
) {
  return useQuery<CouncilStanding, Error>({
    queryKey: ['council-standing', districtId, snapshotDate],
    queryFn: async () => {
      const snap = await fetchCdnDistrictSnapshot<PerDistrictData>(
        snapshotDate!,
        districtId!
      )
      return deriveCouncilStanding(snap.data.clubs)
    },
    enabled: !!districtId && !!snapshotDate,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  })
}
