/* Data for the council print packs (#2299).
 *
 * The same reads the Area and Division pages make — the district's snapshot
 * (`useDistrictStatistics(..., 'divisions')`) and its analytics clubs
 * (`useDistrictAnalytics`) — pinned by `useDistrictProgramYearControls`, so
 * `?py=` / `?date=` carry over from the page that linked here and the pack
 * prints the figures that page showed (R3). The as-of date is the shared
 * `useGlobalFreshness` rule: the global TI as-of date only when the viewed
 * snapshot really is the latest one. */

import React from 'react'
import { useDistrictAnalytics } from './useDistrictAnalytics'
import { useDistrictStatistics } from './useMembershipData'
import { useDistrictProgramYearControls } from './useDistrictProgramYearControls'
import { useGlobalFreshness } from './useLatestAsOfDate'
import { extractDivisionPerformance } from '../utils/extractDivisionPerformance'
import { isDistrictSlotPending } from '../utils/districtSlotPending'
import {
  buildCouncilPack,
  type CouncilPack,
  type CouncilPackScope,
} from '../utils/councilPack'
import type { ProgramYear } from '../utils/programYear'

export interface CouncilPackData {
  /** Both reads still settling: hold the document's skeleton. */
  isPending: boolean
  /** The analytics file failed or is absent once settled. */
  isError: boolean
  /** The snapshot loaded and the scope is not in it: a bad URL (404). */
  isNotFound: boolean
  pack: CouncilPack | null
  divisionName: string | undefined
  areaName: string | undefined
  programYear: ProgramYear
  /** The pinned snapshot date the figures are from. */
  snapshotDate: string | undefined
  /** TI dashboard as-of date when the snapshot is the latest; else undefined. */
  asOfDate: string | undefined
}

export function useCouncilPack(
  districtId: string | undefined,
  scope: CouncilPackScope
): CouncilPackData {
  const {
    selectedProgramYear,
    effectiveProgramYear,
    effectiveEndDate,
    hasValidDates,
    isDatesPending,
    latestSnapshotDate,
    isLatestSnapshot,
  } = useDistrictProgramYearControls(districtId)

  const { asOfDate } = useGlobalFreshness({
    districtLatestSnapshotDate: latestSnapshotDate,
    isLatestSnapshot,
  })

  const { data, error } = useDistrictAnalytics(
    hasValidDates ? (districtId ?? null) : null,
    undefined,
    effectiveEndDate ?? undefined
  )
  const { data: snapshot, isLoading: isLoadingSnapshot } =
    useDistrictStatistics(
      hasValidDates ? (districtId ?? null) : null,
      effectiveEndDate ?? undefined,
      'divisions'
    )

  const programYear = effectiveProgramYear ?? selectedProgramYear
  const { division, area } = scope
  const pack = React.useMemo(() => {
    if (!snapshot || !effectiveEndDate) return null
    return buildCouncilPack(
      {
        divisions: extractDivisionPerformance(snapshot, effectiveEndDate),
        clubs: data?.allClubs ?? [],
        snapshotDate: effectiveEndDate,
        programYear: programYear.label,
      },
      { division, area }
    )
  }, [snapshot, effectiveEndDate, data, programYear.label, division, area])

  const isPending =
    isDistrictSlotPending(
      { hasData: !!data, isError: !!error },
      { hasValidDates, datesSettled: !isDatesPending }
    ) || isLoadingSnapshot

  const scopedClub = data?.allClubs.find(
    c =>
      c.divisionId.toUpperCase() === division.toUpperCase() &&
      (!area || c.areaId.toUpperCase() === area.toUpperCase())
  )

  return {
    isPending,
    isError: !isPending && (!!error || !data),
    isNotFound: !!snapshot && !!effectiveEndDate && pack === null,
    pack,
    divisionName: scopedClub?.divisionName,
    areaName: area ? scopedClub?.areaName : undefined,
    programYear,
    snapshotDate: effectiveEndDate ?? latestSnapshotDate,
    asOfDate,
  }
}
