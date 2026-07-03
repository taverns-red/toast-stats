/**
 * useProgramYearControls — shared PY-selector state for PY-scoped aggregate
 * pages (#1301, epic #1298 Sprint 2).
 *
 * RegionsPage, RegionPage, and AwardsPage all show program-year-scoped data
 * but historically had no way to choose the year (they defaulted to "latest").
 * This hook packages everything a DataControlsBar needs so those pages own the
 * PY state at the page level (R3) and thread the selected year/date into their
 * own data query — never re-deriving it from the response.
 *
 * It composes:
 *   - useUrlProgramYear — URL-synced `?py=` / `?date=`, with Sprint 1's
 *     data-driven default (the newest PY WITH data, not the calendar year).
 *   - the shared `['available-dates']` CDN dates query (same cache key as
 *     useDefaultProgramYear + DateSelector) → the set of snapshot dates.
 *
 * and derives:
 *   - `availableProgramYears` — newest first, only years that have snapshots.
 *   - `cachedDates` — snapshot dates within the selected PY.
 *   - `effectiveDate` — the explicit `?date=` selection, else the latest date
 *     within the selected PY (what the page should fetch).
 *
 * Self-healing (L124): if a hand-edited / shared `?py=` names a year with no
 * data, it falls back to the newest available PY so the user is never stranded
 * on an empty year — validated at the page, not the picker.
 */

import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCdnDates } from '../services/cdn'
import { useUrlProgramYear } from './useUrlProgramYear'
import {
  getAvailableProgramYears,
  filterDatesByProgramYear,
  getMostRecentDateInProgramYear,
} from '../utils/programYear'
import type { ProgramYear } from '../utils/programYear'

const EMPTY_DATES: string[] = []

export interface ProgramYearControls {
  selectedProgramYear: ProgramYear
  setSelectedProgramYear: (py: ProgramYear) => void
  selectedDate: string | undefined
  setSelectedDate: (date: string | undefined) => void
  /** Program years that actually have snapshots, newest first. */
  availableProgramYears: ProgramYear[]
  /** Snapshot dates within the selected program year. */
  cachedDates: string[]
  /** The date the page should fetch: `?date=` if set, else the PY's latest. */
  effectiveDate: string | undefined
  /** True while the dates index query is in flight (freshness-pill reserve). */
  isDatesPending: boolean
}

export function useProgramYearControls(): ProgramYearControls {
  const {
    selectedProgramYear,
    setSelectedProgramYear,
    selectedDate,
    setSelectedDate,
  } = useUrlProgramYear()

  // Shares the ['available-dates'] cache with useDefaultProgramYear and the
  // DateSelector so the PY list and the data-driven default always agree.
  const { data, isPending: isDatesPending } = useQuery({
    queryKey: ['available-dates'],
    queryFn: fetchCdnDates,
    staleTime: 15 * 60 * 1000, // 15 minutes
    retry: false,
  })

  const allCachedDates = data?.dates ?? EMPTY_DATES

  const availableProgramYears = useMemo(
    () => getAvailableProgramYears(allCachedDates),
    [allCachedDates]
  )

  // Self-heal a selected PY that has no data (e.g. a hand-edited ?py=) to the
  // newest available year — never strand the user on an empty grid (L124).
  useEffect(() => {
    if (availableProgramYears.length === 0) return
    const isAvailable = availableProgramYears.some(
      py => py.year === selectedProgramYear.year
    )
    if (!isAvailable) {
      const newest = availableProgramYears[0]
      if (newest) setSelectedProgramYear(newest)
    }
  }, [availableProgramYears, selectedProgramYear.year, setSelectedProgramYear])

  const cachedDates = useMemo(
    () => filterDatesByProgramYear(allCachedDates, selectedProgramYear),
    [allCachedDates, selectedProgramYear]
  )

  const effectiveDate = useMemo(() => {
    if (selectedDate) return selectedDate
    return (
      getMostRecentDateInProgramYear(allCachedDates, selectedProgramYear) ??
      undefined
    )
  }, [selectedDate, allCachedDates, selectedProgramYear])

  return {
    selectedProgramYear,
    setSelectedProgramYear,
    selectedDate,
    setSelectedDate,
    availableProgramYears,
    cachedDates,
    effectiveDate,
    isDatesPending,
  }
}
