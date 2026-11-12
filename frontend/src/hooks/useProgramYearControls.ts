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
 *   - `effectiveDate` — the `?date=` selection when it names a snapshot, else
 *     the nearest earlier one / the PY's latest (#2635); always in the list.
 *
 * Self-healing (L124): if a hand-edited / shared `?py=` names a year with no
 * data, it falls back to the newest available PY so the user is never stranded
 * on an empty year — validated at the page, not the picker.
 */

import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCdnDates } from '../services/cdn'
import { useUrlProgramYear } from './useUrlProgramYear'
import { useResolvedDateSelection } from './useResolvedDateSelection'
import {
  getAvailableProgramYears,
  filterDatesByProgramYear,
} from '../utils/programYear'
import type { ProgramYear } from '../utils/programYear'
import { snapshotDatesFrom, type SnapshotDate } from '../types/snapshotDate'
import type { ProgramYearSetter, SnapshotDateSetter } from './useUrlProgramYear'

export interface ProgramYearControls {
  selectedProgramYear: ProgramYear
  setSelectedProgramYear: ProgramYearSetter
  selectedDate: SnapshotDate | undefined
  setSelectedDate: SnapshotDateSetter
  /** Program years that actually have snapshots, newest first. */
  availableProgramYears: ProgramYear[]
  /** Snapshot dates within the selected program year. */
  cachedDates: SnapshotDate[]
  /** The date the page should fetch: `?date=` if set, else the PY's latest. */
  effectiveDate: SnapshotDate | undefined
  /** True when the selected date is the most recent snapshot in the PY (or no
   * explicit date is chosen). Drives the freshness pill's reconciliation axis
   * (#1296) — memoized here so each consuming page doesn't re-sort per render. */
  isLatestSnapshot: boolean
  /** True while the dates index query is in flight (freshness-pill reserve). */
  isDatesPending: boolean
}

export function useProgramYearControls(): ProgramYearControls {
  const {
    selectedProgramYear: urlProgramYear,
    setSelectedProgramYear,
    setSelectedDate,
    setProgramYearAndDate,
    requestedDate,
  } = useUrlProgramYear()

  // Shares the ['available-dates'] cache with useDefaultProgramYear and the
  // DateSelector so the PY list and the data-driven default always agree.
  const { data, isPending: isDatesPending } = useQuery({
    queryKey: ['available-dates'],
    queryFn: fetchCdnDates,
    staleTime: 15 * 60 * 1000, // 15 minutes
    retry: false,
  })

  // The dates index is the pipeline's own enumeration of what it wrote, so this
  // is the primary mint for the brand (#1323). Everything downstream —
  // cachedDates, effectiveDate, and every per-snapshot fetch keyed on them —
  // inherits its provenance from this one call.
  const allCachedDates = useMemo(() => snapshotDatesFrom(data), [data])

  const availableProgramYears = useMemo(
    () => getAvailableProgramYears(allCachedDates),
    [allCachedDates]
  )

  // Validate `?date=` against the snapshot list ONCE, here (#2635). Everything
  // below — the PY, the dates, the date to fetch, the chip — derives from the
  // resolution, so none of them can name a date that has no snapshot.
  const resolution = useResolvedDateSelection({
    requested: requestedDate,
    dates: allCachedDates,
    programYear: urlProgramYear,
    writeUrl: true,
    setProgramYearAndDate,
  })
  const selectedProgramYear =
    resolution?.status === 'switched-py'
      ? resolution.programYear
      : urlProgramYear

  // Self-heal a selected PY that has no data (e.g. a hand-edited ?py=) to the
  // newest available year — never strand the user on an empty grid (L124).
  // Invariant: availableProgramYears[0] is the same year useDefaultProgramYear
  // resolves to — both derive from the shared ['available-dates'] query — so
  // healing to it deletes `?py=` rather than pinning the default year on. If
  // that shared-cache invariant ever breaks, this would flip `?py=` back on.
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

  // Always an element of the snapshot list (or undefined while it loads).
  const effectiveDate = resolution?.date ?? undefined
  // The explicit selection, as the chip should name it: the date whose data is
  // on screen — never the requested one when it has no snapshot.
  const selectedDate =
    resolution && resolution.status !== 'none'
      ? (resolution.date ?? undefined)
      : undefined

  // Whether the selection is the newest snapshot in the PY — the freshness
  // pill only flags month-end reconciliation for the latest snapshot (#1296).
  // Memoized once here so every consuming page skips the per-render re-sort.
  // A prior program year's newest snapshot is history, not the latest (#2635).
  const isLatestSnapshot = useMemo(() => {
    const newestYear = availableProgramYears[0]
    if (newestYear && newestYear.year !== selectedProgramYear.year) return false
    if (!selectedDate) return true
    if (cachedDates.length === 0) return false
    const latest = [...cachedDates].sort((a, b) => b.localeCompare(a))[0]
    return selectedDate === latest
  }, [selectedDate, cachedDates, availableProgramYears, selectedProgramYear])

  return {
    selectedProgramYear,
    setSelectedProgramYear,
    selectedDate,
    setSelectedDate,
    availableProgramYears,
    cachedDates,
    effectiveDate,
    isLatestSnapshot,
    isDatesPending,
  }
}
