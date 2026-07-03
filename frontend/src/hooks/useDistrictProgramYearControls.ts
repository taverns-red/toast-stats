/**
 * useDistrictProgramYearControls — shared PY-selector state for DISTRICT-scoped
 * pages (#1302, epic #1298 Sprint 3).
 *
 * DivisionPage, AreaPage, and ClubDetailPage all show program-year-scoped data
 * for one district but historically either hardcoded "latest snapshot" or read
 * `?py=` with no selector UI. This hook packages everything those pages (and a
 * shared DataControlsBar) need so each page owns the PY/date state at the page
 * level (R3) and threads the selected date into its own data query — never
 * re-deriving it from the response.
 *
 * It is the district-scoped sibling of useProgramYearControls: the dates come
 * from the per-district snapshot index (useDistrictCachedDates), NOT the global
 * ['available-dates'] query. The derivation (available PYs, in-PY dates,
 * effective end date, self-heal to the newest year) mirrors the proven inline
 * logic that DistrictClubsPage / DistrictDivisionsPage already ship, so those
 * routes and these leaf pages behave identically (R6 — real code overlap).
 *
 * Self-healing (L124): a hand-edited / shared `?py=` naming a year with no
 * district data falls back to the newest available PY, so the user is never
 * stranded on an empty grid — validated at the page, not the picker.
 */

import { useEffect, useMemo } from 'react'
import { useDistrictCachedDates } from './useDistrictData'
import { useUrlProgramYear } from './useUrlProgramYear'
import {
  getAvailableProgramYears,
  filterDatesByProgramYear,
  getMostRecentDateInProgramYear,
  isDateInProgramYear,
} from '../utils/programYear'
import type { ProgramYear } from '../utils/programYear'

const EMPTY_DATES: string[] = []

export interface DistrictProgramYearControls {
  selectedProgramYear: ProgramYear
  setSelectedProgramYear: (py: ProgramYear) => void
  selectedDate: string | undefined
  setSelectedDate: (date: string | undefined) => void
  /** Program years that actually have snapshots for this district, newest first. */
  availableProgramYears: ProgramYear[]
  /** Snapshot dates within the selected PY, newest first — feeds the date chip. */
  availableDates: string[]
  /** The selected PY reconciled to one with data (self-heal); null until dates load. */
  effectiveProgramYear: ProgramYear | null
  /** The date the page should fetch: `?date=` when in-PY, else the PY's latest. */
  effectiveEndDate: string | null
  /** True once a program year AND an end date have resolved. */
  hasValidDates: boolean
  /** The district's overall most-recent snapshot date (for the freshness pill). */
  latestSnapshotDate: string | undefined
}

export function useDistrictProgramYearControls(
  districtId: string | null | undefined
): DistrictProgramYearControls {
  const {
    selectedProgramYear,
    setSelectedProgramYear,
    selectedDate,
    setSelectedDate,
  } = useUrlProgramYear()

  const { data: cachedDatesData } = useDistrictCachedDates(districtId || '')
  const allCachedDates = useMemo(
    () => cachedDatesData?.dates || EMPTY_DATES,
    [cachedDatesData?.dates]
  )

  const availableProgramYears = useMemo(
    () => getAvailableProgramYears(allCachedDates),
    [allCachedDates]
  )

  // Self-heal a selected PY that has no district data (e.g. a hand-edited ?py=)
  // to the newest available year — never strand the user on an empty grid (L124).
  useEffect(() => {
    if (availableProgramYears.length === 0) return
    const has = availableProgramYears.some(
      py => py.year === selectedProgramYear.year
    )
    if (!has) {
      const newest = availableProgramYears[0]
      if (newest) setSelectedProgramYear(newest)
    }
  }, [availableProgramYears, selectedProgramYear.year, setSelectedProgramYear])

  // Derive (don't sync) the reconciled selection so the fetched date can never
  // lag a render behind the self-heal effect above.
  const effectiveProgramYear = useMemo(() => {
    if (availableProgramYears.length === 0) return null
    const has = availableProgramYears.some(
      py => py.year === selectedProgramYear.year
    )
    if (has) return selectedProgramYear
    return availableProgramYears[0] ?? null
  }, [availableProgramYears, selectedProgramYear])

  const effectiveEndDate = useMemo(() => {
    if (!effectiveProgramYear) return null
    if (
      selectedDate &&
      isDateInProgramYear(selectedDate, effectiveProgramYear)
    ) {
      return selectedDate
    }
    return (
      getMostRecentDateInProgramYear(allCachedDates, effectiveProgramYear) ||
      effectiveProgramYear.endDate
    )
  }, [selectedDate, effectiveProgramYear, allCachedDates])

  const hasValidDates =
    effectiveProgramYear !== null && effectiveEndDate !== null

  const availableDates = useMemo(
    () =>
      effectiveProgramYear
        ? filterDatesByProgramYear(allCachedDates, effectiveProgramYear).sort(
            (a, b) => b.localeCompare(a)
          )
        : EMPTY_DATES,
    [allCachedDates, effectiveProgramYear]
  )

  return {
    selectedProgramYear,
    setSelectedProgramYear,
    selectedDate,
    setSelectedDate,
    availableProgramYears,
    availableDates,
    effectiveProgramYear,
    effectiveEndDate,
    hasValidDates,
    latestSnapshotDate: cachedDatesData?.dateRange?.endDate,
  }
}
