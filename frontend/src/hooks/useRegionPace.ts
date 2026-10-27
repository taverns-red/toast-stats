import { useQuery } from '@tanstack/react-query'
import { districtTiersForProgramYear } from '@taverns-red/analytics-core'
import {
  fetchCdnCompetitiveAwards,
  fetchCdnDates,
  fetchCdnRankingsForDateExact,
} from '../services/cdn'
import { snapshotDatesFrom } from '../types/snapshotDate'
import {
  PACE_REFERENCE_YEARS,
  paceMedians,
  paceReferenceDate,
  paceYearEndDate,
  type PaceMedian,
} from '../utils/regionPace'
import type { DistrictRecognitionTier } from '@taverns-red/analytics-core'

/* Last year's pace for the Region page's on-track line (#2307). Reads two
   single objects: the reference year's all-districts rankings on the same
   day (or the nearest earlier snapshot) and its June 30 competitive-awards
   file (year-end tiers). Program year and date come from the page (R3).
   The rankings read is exact: another date's figures would be a wrong
   answer, not a fallback. */

export interface RegionPace {
  reference: { referenceDate: string; referenceProgramYear: string } | null
  medians: Partial<Record<DistrictRecognitionTier, PaceMedian | null>> | null
}

export function useRegionPace(
  programYear: string,
  snapshotDate: string | undefined
): RegionPace {
  const referenceProgramYear = PACE_REFERENCE_YEARS[programYear] ?? null
  const { data: index } = useQuery({
    queryKey: ['available-dates'],
    queryFn: fetchCdnDates,
    staleTime: 5 * 60 * 1000,
  })
  const dates = snapshotDatesFrom(index)
  const referenceDate =
    referenceProgramYear && snapshotDate
      ? (dates.find(
          d =>
            d === paceReferenceDate(snapshotDate, referenceProgramYear, dates)
        ) ?? null)
      : null
  const yearEndDate = referenceProgramYear
    ? (dates.find(d => d === paceYearEndDate(referenceProgramYear, dates)) ??
      null)
    : null
  const enabled = referenceDate !== null && yearEndDate !== null

  const { data: rankings } = useQuery({
    queryKey: ['district-rankings-exact', referenceDate],
    queryFn: () => fetchCdnRankingsForDateExact(referenceDate!),
    enabled,
    staleTime: 60 * 60 * 1000,
  })
  const { data: awards } = useQuery({
    queryKey: ['competitive-awards', yearEndDate],
    queryFn: () => fetchCdnCompetitiveAwards(yearEndDate!),
    enabled,
    staleTime: 60 * 60 * 1000,
  })

  if (!enabled || !rankings || !awards?.distinguishedDistrict) {
    return { reference: null, medians: null }
  }
  return {
    reference: {
      referenceDate: referenceDate!,
      referenceProgramYear: referenceProgramYear!,
    },
    medians: paceMedians(
      rankings.rankings.map(r => ({
        districtId: r.districtId,
        paidClubBase: r.paidClubBase ?? 0,
        paymentBase: r.paymentBase ?? 0,
        paidClubs: r.paidClubs ?? 0,
        totalPayments: r.totalPayments ?? 0,
        distinguishedClubs: r.distinguishedClubs ?? 0,
      })),
      awards.distinguishedDistrict,
      districtTiersForProgramYear(programYear)
    ),
  }
}
