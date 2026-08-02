import { ClosingPeriodDetector } from './ClosingPeriodDetector.js'

const closingPeriodDetector = new ClosingPeriodDetector()

const MONTHS: Record<string, string> = {
  january: '01',
  jan: '01',
  february: '02',
  feb: '02',
  march: '03',
  mar: '03',
  april: '04',
  apr: '04',
  may: '05',
  june: '06',
  jun: '06',
  july: '07',
  jul: '07',
  august: '08',
  aug: '08',
  september: '09',
  sep: '09',
  october: '10',
  oct: '10',
  november: '11',
  nov: '11',
  december: '12',
  dec: '12',
}

/** The calendar month a CSV's data belongs to, per its footer. */
export interface FooterDataMonth {
  year: number
  /** 1-12. */
  month: number
}

/**
 * Parse the data month from a CSV's "Month of X, As of Y" footer.
 *
 * Returns the month **unconditionally** — unlike `parseClosingPeriodFromCsv`,
 * whose `dataMonth` is populated only for closing periods. Callers that need to
 * know *which* period the data is for (e.g. deriving its program year, #1342)
 * need the month even when it matches the collection month.
 *
 * @returns undefined when no parseable footer is present — UNDECIDED, never a
 *          verdict (#1129).
 */
export function parseFooterDataMonth(
  csvContent: string,
  requestedDate: string
): FooterDataMonth | undefined {
  if (!csvContent) return undefined

  const lines = csvContent.split(/\r?\n/).slice(-20) // Search the end of the file
  for (const line of lines) {
    // Match e.g. "Month of March, As of 04/01/2026" — TM emits both full and
    // 3-letter month names ("Month of Jul, As of 07/30/2026").
    const match = line.match(
      /^"?Month of\s+([A-Za-z]+),\s*As of\s+([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})"?$/i
    )
    if (!match) continue

    const monthName = match[1]!.toLowerCase()
    // e.g. match[2] "04/01/2026" - ignored for now as we only need the month name

    const dataMonthNumStr = MONTHS[monthName]
    if (!dataMonthNumStr) continue

    // The requestedDate is in YYYY-MM-DD
    const requestedDateObj = new Date(requestedDate)
    const referenceYear = requestedDateObj.getUTCFullYear()
    const referenceMonth = requestedDateObj.getUTCMonth() + 1

    // parseDataMonth takes ("03", 2026, 4) -> { year: 2026, month: 3 }
    const parsedDataMonth = closingPeriodDetector.parseDataMonth(
      dataMonthNumStr,
      referenceYear,
      referenceMonth
    )
    if (!parsedDataMonth) continue

    return parsedDataMonth
  }

  return undefined
}

/**
 * Parse the **"As of" date** from a CSV's `Month of X, As of MM/DD/YYYY` footer.
 *
 * This is the single most reliable thing the dashboard tells us about a
 * response (#1384). Measured across every endpoint shape on 2026-08-02, the
 * as-of date echoes the date that was requested — with exactly one exception:
 * when the export URL's month-end slot is left empty, the root `/export.aspx`
 * ignores the requested as-of and serves *today* instead. Comparing this value
 * to the date we asked for is therefore what catches a response that is not
 * for the period we requested, on either the live or the archive path.
 *
 * Unlike the "Month of" half of the footer, which tracks the as-of month when
 * data exists but echoes the requested month-end when the response is empty,
 * this value is unambiguous.
 *
 * @returns `YYYY-MM-DD`, or undefined when no parseable footer is present —
 *          UNDECIDED, never a verdict (#1129).
 */
export function parseFooterAsOfDate(
  csvContent: string | undefined | null
): string | undefined {
  if (!csvContent) return undefined

  const lines = csvContent.split(/\r?\n/).slice(-20)
  for (const line of lines) {
    const match = line.match(
      /^"?Month of\s+[A-Za-z]+,\s*As of\s+([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})"?$/i
    )
    if (!match) continue
    return `${match[3]}-${match[1]!.padStart(2, '0')}-${match[2]!.padStart(2, '0')}`
  }

  return undefined
}

export function parseClosingPeriodFromCsv(
  csvContent: string,
  requestedDate: string
): { isClosingPeriod: boolean; dataMonth?: string; footerFound: boolean } {
  // `footerFound: false` means UNDECIDED, not non-closing — a CSV without an
  // "As of" footer says nothing about its data month. Callers needing
  // fail-closed semantics (#1129) must consult the next authority instead of
  // treating the default isClosingPeriod:false as a decision.
  const parsedDataMonth = parseFooterDataMonth(csvContent, requestedDate)
  if (!parsedDataMonth) return { isClosingPeriod: false, footerFound: false }

  const requestedDateObj = new Date(requestedDate)
  const referenceYear = requestedDateObj.getUTCFullYear()
  const referenceMonth = requestedDateObj.getUTCMonth() + 1

  // If the parsed month differs from the requested month, it's a closing period
  const isClosingPeriod =
    parsedDataMonth.month !== referenceMonth ||
    parsedDataMonth.year !== referenceYear

  const formattedDataMonth = `${parsedDataMonth.year}-${parsedDataMonth.month.toString().padStart(2, '0')}`

  return {
    isClosingPeriod,
    dataMonth: isClosingPeriod ? formattedDataMonth : undefined,
    footerFound: true,
  }
}
