import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCharterCohortSurvival } from '../services/cdnCharterCohortSurvival'
import {
  buildCharterCohortSurvival,
  charterCohortSurvivalFromFile,
  type CharterCohortSurvival,
} from '../utils/charterCohortSurvival'
import { useClubDistrictHistory } from './useClubDistrictHistory'
import { CLUB_DISTRICT_HISTORY_STALE_MS } from './clubDistrictHistoryQuery'

/* #2061 — the survival page's curves. The pipeline writes one small file
   per district (`config/charter-cohort-survival/district_<id>.json`, a few
   KB); the page reads it and fetches no history shard. Until that file is
   on prod (`null`: a 404, or any failure), the page folds all 100 history
   shards itself, as #2059 did — the same fold, so the curves are equal.

   `status`:
   - `loading` — the file, or the fallback's index/shards, is in flight, or
     the program year is not known yet (`loaded` of `total` counts shards
     on the fallback);
   - `ready` — `survival` holds the curves through `throughProgramYear`;
   - `unavailable` — no file and no complete history. */

export type CharterCohortSurvivalSource = 'file' | 'shards'

export interface CharterCohortSurvivalState {
  status: 'loading' | 'ready' | 'unavailable'
  source: CharterCohortSurvivalSource | null
  survival: CharterCohortSurvival | null
  loaded: number
  total: number
}

export function useCharterCohortSurvival(
  districtId: string,
  /** The program year the page controls select, "YYYY-YYYY" (R3). */
  throughProgramYear: string | null
): CharterCohortSurvivalState {
  const fileQuery = useQuery({
    queryKey: ['charter-cohort-survival', districtId],
    queryFn: () => fetchCharterCohortSurvival(districtId),
    staleTime: CLUB_DISTRICT_HISTORY_STALE_MS,
    enabled: districtId !== '',
  })
  const file = fileQuery.data
  const fallback = file === null || fileQuery.isError
  const history = useClubDistrictHistory({ enabled: fallback })

  return useMemo((): CharterCohortSurvivalState => {
    if (file && throughProgramYear) {
      return {
        status: 'ready',
        source: 'file',
        survival: charterCohortSurvivalFromFile(file, throughProgramYear),
        loaded: 0,
        total: 0,
      }
    }
    if (!fallback) {
      return {
        status: 'loading',
        source: null,
        survival: null,
        loaded: 0,
        total: 0,
      }
    }
    const { loaded, total } = history
    if (history.status === 'unavailable') {
      return {
        status: 'unavailable',
        source: null,
        survival: null,
        loaded,
        total,
      }
    }
    if (
      history.status !== 'ready' ||
      !history.index ||
      !history.clubs ||
      !throughProgramYear
    ) {
      return { status: 'loading', source: null, survival: null, loaded, total }
    }
    return {
      status: 'ready',
      source: 'shards',
      survival: buildCharterCohortSurvival({
        index: history.index,
        clubs: history.clubs,
        districtId,
        throughProgramYear,
      }),
      loaded,
      total,
    }
  }, [file, fallback, history, districtId, throughProgramYear])
}
