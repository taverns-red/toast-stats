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
 * effective end date, self-heal to the newest year) is lifted from the proven
 * inline logic that DistrictClubsPage / DistrictDivisionsPage still ship — those
 * two index pages feed a DistrictDetailHeader and haven't been migrated to this
 * hook yet (a deliberate scope boundary for #1302); the shared derivation keeps
 * both behaving the same until they are.
 *
 * Self-healing (L124): a hand-edited / shared `?py=` naming a year with no
 * district data falls back to the newest available PY, so the user is never
 * stranded on an empty grid — validated at the page, not the picker.
 *
 * `selfHeal` (default true) controls whether that fallback is WRITTEN back to
 * the URL. Pages reached via a plain Link (DivisionPage, AreaPage) want the
 * write so the chip and `?py=` agree. ClubDetailPage receives navigation state
 * (`location.state.fromClubsSearch`, the #577 filter round-trip) that a mount-
 * time `setSearchParams` would clobber, so it opts OUT and instead renders the
 * derived `effectiveProgramYear` in the chip — honest without touching the URL.
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
import type { SnapshotDate } from '../types/snapshotDate'

const EMPTY_DATES: SnapshotDate[] = []

export interface DistrictProgramYearControls {
  selectedProgramYear: ProgramYear
  setSelectedProgramYear: (py: ProgramYear) => void
  selectedDate: SnapshotDate | undefined
  setSelectedDate: (date: SnapshotDate | undefined) => void
  /** Program years that actually have snapshots for this district, newest first. */
  availableProgramYears: ProgramYear[]
  /** Snapshot dates within the selected PY — feeds the date chip (which sorts). */
  availableDates: SnapshotDate[]
  /** The selected PY reconciled to one with data (self-heal); null until dates load. */
  effectiveProgramYear: ProgramYear | null
  /** The date the page should fetch: `?date=` when in-PY, else the PY's latest. */
  effectiveEndDate: SnapshotDate | null
  /** True once a program year AND an end date have resolved. */
  hasValidDates: boolean
  /** The district's overall most-recent snapshot date (for the freshness pill). */
  latestSnapshotDate: SnapshotDate | undefined
  /** True when the effective end date is the district's newest snapshot — the
   * signal computeFreshness needs to flag month-end reconciliation only on the
   * live snapshot, never a finalized historical date (#1310). */
  isLatestSnapshot: boolean
}

export function useDistrictProgramYearControls(
  districtId: string | null | undefined,
  { selfHeal = true }: { selfHeal?: boolean } = {}
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
  // Skipped when selfHeal is false so a mount-time URL write can't clobber the
  // caller's navigation state (ClubDetailPage's #577 filter round-trip); that
  // caller instead reads the derived effectiveProgramYear below.
  //
  // NOTE (vs. the sibling useProgramYearControls): that hook heals to a year
  // drawn from the SAME global ['available-dates'] cache that useUrlProgramYear's
  // default is computed from, so healing to it deletes `?py=`. Here the healed
  // year comes from the per-DISTRICT index, which can lag the global newest —
  // so when a district's data trails, healing may WRITE `?py=<districtNewest>`
  // rather than clear it. Still correct (it points at data that exists); the
  // "heal clears ?py=" parity with the sibling simply doesn't hold district-side.
  useEffect(() => {
    if (!selfHeal) return
    if (availableProgramYears.length === 0) return
    const has = availableProgramYears.some(
      py => py.year === selectedProgramYear.year
    )
    if (!has) {
      const newest = availableProgramYears[0]
      if (newest) setSelectedProgramYear(newest)
    }
  }, [
    selfHeal,
    availableProgramYears,
    selectedProgramYear.year,
    setSelectedProgramYear,
  ])

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
    // null is unreachable here — effectiveProgramYear comes from
    // getAvailableProgramYears(allCachedDates). See getMostRecentDateInProgramYear
    // for why, and why a `|| endDate` fallback must not come back (#1323).
    return getMostRecentDateInProgramYear(allCachedDates, effectiveProgramYear)
  }, [selectedDate, effectiveProgramYear, allCachedDates])

  const hasValidDates =
    effectiveProgramYear !== null && effectiveEndDate !== null

  const latestSnapshotDate = cachedDatesData?.dateRange?.endDate
  const isLatestSnapshot =
    !!effectiveEndDate && effectiveEndDate === latestSnapshotDate

  // Dates within the selected PY. Left unsorted — DataControlsBar (the only
  // consumer) sorts newest-first itself, matching the sibling
  // useProgramYearControls which also returns its in-PY dates unsorted.
  const availableDates = useMemo(
    () =>
      effectiveProgramYear
        ? filterDatesByProgramYear(allCachedDates, effectiveProgramYear)
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
    latestSnapshotDate,
    isLatestSnapshot,
  }
}
