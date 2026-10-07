/**
 * A 200 response is not proof of a CSV (#1671).
 *
 * TI's export answers some requests with its ASP.NET error page and a
 * successful status. The fixture is the real 8082-byte body stored as
 * raw-csv/2019-07-16/district-U/club-performance.csv in staging.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertCsvBody,
  NonCsvBodyError,
  validateCsvBody,
} from '../csvBodyGuard.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TI_ERROR_PAGE = fs.readFileSync(
  path.join(
    HERE,
    '../../__tests__/fixtures/ti-error-page-2019-07-16-district-U-clubperformance.html'
  ),
  'utf-8'
)

const CLUB_CSV = [
  '"District","Division","Area","Club Number","Club Name","Club Status"',
  '"61","A","1","1234","Test Club","Active"',
  '"Month of Jun, As of 07/16/2019"',
].join('\n')
const DIVISION_CSV = [
  '"District","Division","Area","Club","Club Name","October Renewals"',
  '"61","A","1","1234","Test Club","10"',
].join('\n')
const DISTRICT_CSV = [
  '"District","Division","Area","Club","Club Name","New"',
  '"61","A","1","1234","Test Club","2"',
].join('\n')
const SUMMARY_CSV = [
  '"REGION","DISTRICT","DSP","Training"',
  '"06","61","Y","Y"',
].join('\n')

describe('validateCsvBody (#1671)', () => {
  it('rejects the real 8082-byte TI error page served as club-performance', () => {
    expect(TI_ERROR_PAGE.length).toBe(8082)
    const verdict = validateCsvBody(TI_ERROR_PAGE, 'clubperformance')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toMatch(/HTML/)
  })

  it('rejects an HTML body for every report type', () => {
    for (const report of [
      'districtsummary',
      'clubperformance',
      'divisionperformance',
      'districtperformance',
    ] as const) {
      expect(validateCsvBody('<html><body>x</body></html>', report).ok).toBe(
        false
      )
    }
  })

  it('accepts each real report header', () => {
    expect(validateCsvBody(CLUB_CSV, 'clubperformance').ok).toBe(true)
    expect(validateCsvBody(DIVISION_CSV, 'divisionperformance').ok).toBe(true)
    expect(validateCsvBody(DISTRICT_CSV, 'districtperformance').ok).toBe(true)
    expect(validateCsvBody(SUMMARY_CSV, 'districtsummary').ok).toBe(true)
  })

  it('accepts a leading BOM or blank lines before the header', () => {
    const BOM = String.fromCharCode(0xfeff)
    expect(validateCsvBody(`${BOM}\n\n${CLUB_CSV}`, 'clubperformance').ok).toBe(
      true
    )
  })

  it("rejects a CSV that lacks the report's expected header", () => {
    // A division report stored as club-performance.csv is not a club report.
    const verdict = validateCsvBody(DIVISION_CSV, 'clubperformance')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toMatch(/Club Number/i)
  })

  it('rejects an empty body', () => {
    expect(validateCsvBody('', 'clubperformance').ok).toBe(false)
    expect(validateCsvBody('  \n ', 'clubperformance').ok).toBe(false)
  })
})

describe('assertCsvBody (#1671)', () => {
  it('throws a NonCsvBodyError naming what was rejected', () => {
    expect(() =>
      assertCsvBody(TI_ERROR_PAGE, 'clubperformance', 'clubperformance for U')
    ).toThrow(NonCsvBodyError)
    expect(() =>
      assertCsvBody(TI_ERROR_PAGE, 'clubperformance', 'clubperformance for U')
    ).toThrow(/clubperformance for U/)
  })

  it('passes a real CSV', () => {
    expect(() =>
      assertCsvBody(CLUB_CSV, 'clubperformance', 'clubperformance for 61')
    ).not.toThrow()
  })
})
