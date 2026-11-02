/**
 * usePriorYearClubGoals (#2432) — last year's DCP goals for every club in a
 * district, for the Clubs table's "since last year" preset.
 *
 * One read of an EXISTING file: the district's own snapshot on the same date
 * last program year, or the nearest earlier one (`resolvePriorYearDate`).
 * The same dated `district_<id>.json` the club history and the snapshot diff
 * read, so no new pipeline data. Disabled unless the preset is on, so the
 * Clubs page makes no extra request by default.
 *
 * A district with no snapshot in that window (every 2xx district formed in
 * the 2026 realignment) resolves to `clubs: null` without a request: every
 * club then has no prior-year data.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PerDistrictData } from '@taverns-red/shared-contracts'
import { fetchCdnDistrictSnapshot } from '../services/cdn'
import type { SnapshotDate } from '../types/snapshotDate'
import {
  resolvePriorYearDate,
  type PriorYearClub,
  type PriorYearClubGoals,
} from '../utils/sinceLastYear'

export interface UsePriorYearClubGoalsResult {
  data: PriorYearClubGoals | undefined
  isLoading: boolean
  isError: boolean
}

export function usePriorYearClubGoals(
  districtId: string | null | undefined,
  currentDate: SnapshotDate | null | undefined,
  districtDates: readonly SnapshotDate[],
  enabled: boolean
): UsePriorYearClubGoalsResult {
  const resolved = useMemo(() => {
    if (!currentDate) return null
    const { targetDate, comparisonDate } = resolvePriorYearDate(
      currentDate,
      districtDates
    )
    // Re-take the comparison date from the district's own list so it keeps
    // the SnapshotDate provenance the fetch requires (#1323).
    const date = districtDates.find(d => d === comparisonDate) ?? null
    return { targetDate, comparisonDate: date }
  }, [currentDate, districtDates])

  const comparisonDate = resolved?.comparisonDate ?? null
  const active = enabled && !!districtId && resolved !== null

  const query = useQuery<PriorYearClub[], Error>({
    queryKey: ['prior-year-club-goals', districtId, comparisonDate],
    enabled: active && comparisonDate !== null,
    queryFn: async () => {
      const snap = await fetchCdnDistrictSnapshot<PerDistrictData>(
        comparisonDate!,
        districtId!
      )
      // A `failed` collection has no usable clubs — an error, not "no clubs".
      if (snap.status === 'failed' || !snap.data?.clubs) {
        throw new Error(`No usable snapshot for ${comparisonDate}`)
      }
      return snap.data.clubs.map(c => ({
        clubId: c.clubId,
        dcpGoals: c.dcpGoals,
      }))
    },
    staleTime: 15 * 60 * 1000, // a past snapshot is immutable
    gcTime: 30 * 60 * 1000,
  })

  if (!active || !resolved) {
    return { data: undefined, isLoading: false, isError: false }
  }
  if (comparisonDate === null) {
    return {
      data: {
        targetDate: resolved.targetDate,
        comparisonDate: null,
        clubs: null,
      },
      isLoading: false,
      isError: false,
    }
  }
  return {
    data: query.data
      ? { targetDate: resolved.targetDate, comparisonDate, clubs: query.data }
      : undefined,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
