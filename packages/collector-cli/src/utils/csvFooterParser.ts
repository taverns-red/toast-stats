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

export function parseClosingPeriodFromCsv(
  csvContent: string,
  requestedDate: string
): { isClosingPeriod: boolean; dataMonth?: string } {
  if (!csvContent) return { isClosingPeriod: false }

  const lines = csvContent.split(/\r?\n/).slice(-20) // Search the end of the file
  for (const line of lines) {
    // Match e.g. "Month of March, As of 04/01/2026"
    const match = line.match(
      /^"?Month of\s+([A-Za-z]+),\s*As of\s+([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})"?$/i
    )
    if (match) {
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

      // If the parsed month differs from the requested month, it's a closing period
      const isClosingPeriod =
        parsedDataMonth.month !== referenceMonth ||
        parsedDataMonth.year !== referenceYear

      const formattedDataMonth = `${parsedDataMonth.year}-${parsedDataMonth.month.toString().padStart(2, '0')}`

      return {
        isClosingPeriod,
        dataMonth: isClosingPeriod ? formattedDataMonth : undefined,
      }
    }
  }

  return { isClosingPeriod: false }
}
