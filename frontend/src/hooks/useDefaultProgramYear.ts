/**
 * useDefaultProgramYear — the DATA-DRIVEN default program year (#1300, epic #1298)
 *
 * The app default program year must be the latest program year that actually
 * has snapshot data — NOT the calendar year. Toastmasters' data rollover lags
 * July 1: on 2026-07-01 the calendar flips to PY 2026-2027, but June 2026 is
 * still in month-end reconciliation and belongs to PY 2025-2026, so the new
 * calendar year has no data yet (cf. #1284, and the collector-side principle
 * "resolve the active program year by data, not the calendar").
 *
 * This hook reads the CDN snapshot-dates index, derives the available program
 * years (newest first), and returns the newest one. It falls back to the
 * calendar current program year only while the dates are loading, empty, or
 * the fetch failed — so a consumer never sees an undefined/empty program year.
 *
 * Self-healing: the day TM publishes the new program year's first snapshot, the
 * derived newest PY advances to it automatically — no calendar flag day.
 */

import { useQuery } from '@tanstack/react-query'
import { fetchCdnDates } from '../services/cdn'
import {
  getAvailableProgramYears,
  getCurrentProgramYear,
} from '../utils/programYear'
import type { ProgramYear } from '../utils/programYear'

export function useDefaultProgramYear(): ProgramYear {
  // Shares the cache with DateSelector's identical dates query.
  const { data } = useQuery({
    queryKey: ['available-dates'],
    queryFn: fetchCdnDates,
    staleTime: 15 * 60 * 1000, // 15 minutes
    retry: false,
  })

  const availableProgramYears = data?.dates
    ? getAvailableProgramYears(data.dates)
    : []

  // getAvailableProgramYears sorts newest first; [0] is the latest PY-with-data.
  return availableProgramYears[0] ?? getCurrentProgramYear()
}
