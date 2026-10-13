/**
 * The month-end dates of a program year, from the closing-date registry
 * (#1766, ADR-015 P7, audit D-6).
 *
 * rescrape `program_year` used to generate the 15th of every month. A
 * month-end is the date a close is filed under (#193) and the only date shape
 * prune keeps, so the input now expands to the month-ends of the months the
 * registry (docs/month-end-closing-dates.json, ADR-011) says have closed. An
 * in-progress program year therefore yields only its closed months.
 */

export interface ClosingRegistryMonth {
  /** YYYY-MM */
  dataMonth: string
  /** YYYY-MM-DD, the last closing-period collection for the month */
  closingDate: string
}

const PROGRAM_YEAR = /^(\d{4})-(\d{4})$/
const DATA_MONTH = /^(\d{4})-(\d{2})$/

/** YYYY-MM → the last day of that month, YYYY-MM-DD. */
function lastDayOf(dataMonth: string): string {
  const m = DATA_MONTH.exec(dataMonth)
  if (!m) throw new Error(`Bad registry dataMonth ${JSON.stringify(dataMonth)}`)
  const year = Number(m[1])
  const month = Number(m[2])
  // Day 0 of the next month is the last day of this one (UTC, no DST).
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${m[1]}-${m[2]}-${String(day).padStart(2, '0')}`
}

/**
 * The sorted month-end dates (YYYY-MM-DD) of `programYear` (`YYYY-YYYY`,
 * July to June) for which `months` holds a closing entry. Throws on a
 * malformed program year; returns [] when no month of it has closed.
 */
export function programYearMonthEnds(
  programYear: string,
  months: readonly ClosingRegistryMonth[]
): string[] {
  const m = PROGRAM_YEAR.exec(programYear)
  if (!m || Number(m[2]) !== Number(m[1]) + 1) {
    throw new Error(
      `Bad program year ${JSON.stringify(programYear)} (want YYYY-YYYY, e.g. 2023-2024)`
    )
  }
  const first = `${m[1]}-07`
  const last = `${m[2]}-06`
  const dates = new Set<string>()
  for (const { dataMonth } of months) {
    if (dataMonth >= first && dataMonth <= last) dates.add(lastDayOf(dataMonth))
  }
  return [...dates].sort()
}
