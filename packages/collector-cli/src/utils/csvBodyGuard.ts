/**
 * A 200 response is not proof of a CSV (#1671).
 *
 * TI's export endpoint answers some requests with its ASP.NET error page
 * (`<!DOCTYPE html …>`, `__VIEWSTATE`) and a successful status. Stored as
 * raw-csv, that page reaches transform as if it were a report. The known case
 * is raw-csv/2019-07-16 and 2019-07-17 district-U club-performance.csv: two
 * 8082-byte HTML pages. This is the same principle as the #1284
 * districtsummary header check, extended to every report type: the body must
 * look like the report that was asked for before it is stored or read.
 *
 * Each report's required header columns are ones present in every year of
 * the archive (checked 2017-02 through 2026-10). Comparison ignores case,
 * quotes and surrounding whitespace.
 */

import type { ReportType } from '../services/HttpCsvDownloader.js'

const REQUIRED_HEADERS: Record<ReportType, readonly string[]> = {
  districtsummary: ['DISTRICT'],
  clubperformance: ['CLUB NUMBER'],
  divisionperformance: ['DIVISION'],
  districtperformance: ['DISTRICT'],
}

export type CsvBodyVerdict =
  | { ok: true }
  | { ok: false; kind: 'empty' | 'html' | 'header'; reason: string }

/** Thrown when a downloaded or cached body is not the CSV it should be. */
export class NonCsvBodyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NonCsvBodyError'
  }
}

/**
 * Is this body the CSV for `reportType`? An HTML page, an empty body, or a
 * header row without the report's columns is not.
 */
export function validateCsvBody(
  content: string | undefined | null,
  reportType: ReportType
): CsvBodyVerdict {
  const text = (content ?? '').replace(/^\uFEFF/, '').trimStart()
  if (text.length === 0) {
    return { ok: false, kind: 'empty', reason: 'body is empty' }
  }

  // A CSV header never starts with '<'. TI's error page starts with
  // `<!DOCTYPE html`, and its 302 target with `<html>`.
  if (text.startsWith('<')) {
    return {
      ok: false,
      kind: 'html',
      reason: `body is HTML (starts "${text.slice(0, 40).replace(/\s+/g, ' ')}…"), not a CSV`,
    }
  }

  const headerLine = text.split(/\r?\n/, 1)[0] ?? ''
  const headers = new Set(
    headerLine.split(',').map(h => h.replace(/"/g, '').trim().toUpperCase())
  )
  const missing = REQUIRED_HEADERS[reportType].filter(h => !headers.has(h))
  if (missing.length > 0) {
    return {
      ok: false,
      kind: 'header',
      reason:
        `${reportType} header lacks ${missing.map(m => `"${m}"`).join(', ')} ` +
        `(first line: "${headerLine.slice(0, 60)}")`,
    }
  }

  return { ok: true }
}

/**
 * Throw a {@link NonCsvBodyError} unless the body is the CSV for
 * `reportType`. `what` names the fetch in the message, for example
 * "clubperformance for U".
 */
export function assertCsvBody(
  content: string | undefined | null,
  reportType: ReportType,
  what: string
): void {
  const verdict = validateCsvBody(content, reportType)
  if (!verdict.ok) {
    throw new NonCsvBodyError(
      `${what} is not a CSV: ${verdict.reason} — refusing to store it (#1671)`
    )
  }
}
