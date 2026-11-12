/**
 * useResolvedDateSelection (#2635) — validates `?date=` once, for both
 * controls hooks (useProgramYearControls, useDistrictProgramYearControls).
 *
 * It derives the resolution synchronously (so the date a page fetches can
 * never lag a render behind) and, when asked, repairs the URL in ONE write:
 * a snapshot from another program year switches the year; a date with no
 * snapshot is replaced by the date actually shown (or dropped, when that is
 * the PY's latest) and raises the "No snapshot for …" notice.
 */

import { useEffect, useMemo } from 'react'
import {
  resolveRequestedDate,
  type DateResolution,
} from '../utils/resolveRequestedDate'
import { getMostRecentDateInProgramYear } from '../utils/programYear'
import type { ProgramYear } from '../utils/programYear'
import type { SnapshotDate } from '../types/snapshotDate'
import { setDateNotice } from './dateNoticeStore'
import type { UrlWriteOptions } from './useUrlProgramYear'

export function useResolvedDateSelection({
  requested,
  dates,
  programYear,
  writeUrl,
  setProgramYearAndDate,
}: {
  /** The raw `?date=` value (untrusted). */
  requested: string | null
  /** Every snapshot date the page can fetch. */
  dates: readonly SnapshotDate[]
  /** The program year the page is showing (already healed to one with data). */
  programYear: ProgramYear | null
  /** False for pages that must not write the URL on mount (ClubDetailPage). */
  writeUrl: boolean
  setProgramYearAndDate: (
    py: ProgramYear,
    date: SnapshotDate | undefined,
    options?: UrlWriteOptions
  ) => void
}): DateResolution | null {
  const resolution = useMemo(
    () =>
      programYear
        ? resolveRequestedDate({ requested, dates, programYear })
        : null,
    [requested, dates, programYear]
  )

  const status = resolution?.status
  const resolvedDate = resolution?.date ?? null
  const resolvedYear = resolution?.programYear

  useEffect(() => {
    if (!resolvedYear || !resolvedDate) return
    if (status !== 'fallback' && status !== 'switched-py') return

    if (status === 'fallback' && requested) {
      setDateNotice({ requested, shown: resolvedDate })
    }
    if (!writeUrl) return

    const latest = getMostRecentDateInProgramYear([...dates], resolvedYear)
    const keep =
      status === 'switched-py' || resolvedDate !== latest
        ? resolvedDate
        : undefined
    setProgramYearAndDate(resolvedYear, keep)
  }, [
    status,
    resolvedDate,
    resolvedYear,
    requested,
    dates,
    writeUrl,
    setProgramYearAndDate,
  ])

  return resolution
}
