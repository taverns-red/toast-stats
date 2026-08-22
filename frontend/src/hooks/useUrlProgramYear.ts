/**
 * useUrlProgramYear — URL-synced program year and date (#272)
 *
 * Reads `?py=` and `?date=` from the URL, syncs back to ProgramYearContext.
 * URL is the source of truth when params are present.
 *
 * @example
 * ```tsx
 * const { selectedProgramYear, setSelectedProgramYear, selectedDate, setSelectedDate } =
 *   useUrlProgramYear()
 * ```
 */

import { useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useProgramYear } from '../contexts/ProgramYearContext'
import { getProgramYear, isDateInProgramYear } from '../utils/programYear'
import type { ProgramYear } from '../utils/programYear'
import { useDefaultProgramYear } from './useDefaultProgramYear'
import { toSnapshotDate, type SnapshotDate } from '../types/snapshotDate'

export function useUrlProgramYear() {
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    selectedProgramYear: contextPY,
    setSelectedProgramYear: setContextPY,
    selectedDate: contextDate,
    setSelectedDate: setContextDate,
  } = useProgramYear()

  // The "invisible default" PY is DATA-DRIVEN — the latest program year with
  // snapshots (#1300), not the calendar year. Only a *non-default* PY writes
  // `?py=`; selecting the default omits it. This keeps the July rollover from
  // pinning `?py=<last-calendar-year>` on every URL (which blocked release
  // #1253) and self-heals when the new PY's data publishes.
  const defaultPY = useDefaultProgramYear()

  // Read program year from URL; fall back to context value (not the default)
  // This avoids extra render cycles when context already has the right year
  const urlPyRaw = searchParams.get('py')
  const urlPyYear = urlPyRaw !== null ? parseInt(urlPyRaw, 10) : null
  const effectivePyYear =
    urlPyYear !== null && !isNaN(urlPyYear) ? urlPyYear : contextPY.year

  const selectedProgramYear = useMemo(
    () => getProgramYear(effectivePyYear),
    [effectivePyYear]
  )

  // Read date from URL. `?date=` is untrusted input — a hand-edited or stale
  // shared link can carry anything — so it is MINTED, not trusted (#1323). A
  // malformed value resolves to undefined and the caller falls back to the PY's
  // latest snapshot, rather than keying a fetch on garbage and rendering blank.
  const urlDate = searchParams.get('date')
  const selectedDate = toSnapshotDate(urlDate)

  // Sync program year to context when URL differs
  useEffect(() => {
    if (selectedProgramYear.year !== contextPY.year) {
      setContextPY(selectedProgramYear)
    }
  }, [
    selectedProgramYear.year,
    contextPY.year,
    setContextPY,
    selectedProgramYear,
  ])

  // Sync date to context when URL has a date that differs from context
  useEffect(() => {
    if (selectedDate !== contextDate) {
      setContextDate(selectedDate)
    }
  }, [selectedDate, contextDate, setContextDate])

  const setSelectedProgramYear = useCallback(
    (py: ProgramYear) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          if (py.year === defaultPY.year) {
            next.delete('py')
          } else {
            next.set('py', py.year.toString())
          }
          return next
        },
        { replace: true }
      )
      setContextPY(py)
    },
    [setSearchParams, setContextPY, defaultPY.year]
  )

  const setSelectedDate = useCallback(
    (date: SnapshotDate | undefined) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          if (!date) {
            next.delete('date')
          } else {
            next.set('date', date)
          }
          return next
        },
        { replace: true }
      )
      setContextDate(date)
    },
    [setSearchParams, setContextDate]
  )

  /**
   * Move the program year and the snapshot date TOGETHER, in one navigation
   * (#1436).
   *
   * `?py=` and `?date=` are read independently above, so a `?date=` outside the
   * selected program year leaves the page self-inconsistent — the hazard
   * `searchIndex.ts` documents and sets both params to avoid. Calling
   * `setSelectedProgramYear` and then `setSelectedDate` cannot avoid it:
   * react-router's `setSearchParams` hands the functional updater the
   * RENDER-TIME `searchParams`, not the pending value, so the second call is
   * computed from a stale base and silently discards the first call's key.
   *
   * A `date` outside `py` is dropped rather than written — the inconsistent
   * pair must not be reachable through this setter even by a caller mistake.
   */
  const setProgramYearAndDate = useCallback(
    (py: ProgramYear, date: SnapshotDate | undefined) => {
      const dateInYear =
        date && isDateInProgramYear(date, py) ? date : undefined
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          if (py.year === defaultPY.year) {
            next.delete('py')
          } else {
            next.set('py', py.year.toString())
          }
          if (!dateInYear) {
            next.delete('date')
          } else {
            next.set('date', dateInYear)
          }
          return next
        },
        { replace: true }
      )
      setContextPY(py)
      setContextDate(dateInYear)
    },
    [setSearchParams, setContextPY, setContextDate, defaultPY.year]
  )

  return {
    selectedProgramYear,
    setSelectedProgramYear,
    selectedDate,
    setSelectedDate,
    setProgramYearAndDate,
  }
}
