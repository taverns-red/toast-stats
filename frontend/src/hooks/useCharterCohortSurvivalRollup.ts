import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCharterCohortSurvivalRollup } from '../services/cdnCharterCohortSurvivalRollup'
import {
  charterCohortSurvivalFromRollupFile,
  type CharterCohortSurvivalRollup,
  type CharterCohortSurvivalScope,
} from '../utils/charterCohortSurvival'
import { CLUB_DISTRICT_HISTORY_STALE_MS } from './clubDistrictHistoryQuery'

/* #1818 — a region's or the world's survival curves, read from the one
   small file the pipeline folds (`config/charter-cohort-survival/
   {region_<NN>,world}.json`). The program year is the page's (R3).

   `status`:
   - `loading` — the file is in flight, or the program year is not known;
   - `ready` — `survival` holds the curves through `throughProgramYear`;
   - `not-available` — no file yet (a 404, or a file that fails its
     contract): never shown as an empty or zero curve;
   - `error` — the file could not be loaded (network or server error). */

export interface CharterCohortSurvivalRollupState {
  status: 'loading' | 'ready' | 'not-available' | 'error'
  survival: CharterCohortSurvivalRollup | null
}

export function useCharterCohortSurvivalRollup(
  scope: CharterCohortSurvivalScope,
  /** The program year the page controls select, "YYYY-YYYY" (R3). */
  throughProgramYear: string | null
): CharterCohortSurvivalRollupState {
  const key = scope.kind === 'world' ? 'world' : `region_${scope.regionId}`
  // A region id that names no file (not two digits) has no survival.
  const valid = scope.kind === 'world' || /^\d{2}$/.test(scope.regionId)
  const query = useQuery({
    queryKey: ['charter-cohort-survival-rollup', key],
    queryFn: () => fetchCharterCohortSurvivalRollup(scope),
    staleTime: CLUB_DISTRICT_HISTORY_STALE_MS,
    enabled: valid,
  })
  const file = query.data
  return useMemo((): CharterCohortSurvivalRollupState => {
    if (!valid) return { status: 'not-available', survival: null }
    if (query.isError) return { status: 'error', survival: null }
    if (file === null) return { status: 'not-available', survival: null }
    if (!file || !throughProgramYear) {
      return { status: 'loading', survival: null }
    }
    return {
      status: 'ready',
      survival: charterCohortSurvivalFromRollupFile(file, throughProgramYear),
    }
  }, [valid, file, query.isError, throughProgramYear])
}
