/**
 * Unit tests for the backfill fetch guard (#1384).
 *
 * Every fixture below is a real shape observed against the live dashboard on
 * 2026-08-02; the probe letter in each comment identifies which request
 * produced it.
 */

import { describe, it, expect } from 'vitest'
import {
  resolveExportPathStyle,
  countCsvDataRows,
  verifyBackfillCsv,
} from '../backfillContentGuard.js'
import { parseFooterAsOfDate } from '../csvFooterParser.js'

const HEADER = '"REGION","DISTRICT","Paid Clubs"'
const ROW = '"02","61","150"'

function csv(rows: string[], footer: string | undefined): string {
  return [HEADER, ...rows, ...(footer ? [footer] : [])].join('\n')
}

describe('resolveExportPathStyle (#1384)', () => {
  it('uses the root path only for the live program year', () => {
    expect(resolveExportPathStyle('2026-2027', '2026-2027')).toBe('live')
  })

  it('uses /{PY}/ for every other year', () => {
    expect(resolveExportPathStyle('2025-2026', '2026-2027')).toBe('archive')
    expect(resolveExportPathStyle('2017-2018', '2026-2027')).toBe('archive')
  })

  it('falls back to /{PY}/ when the live year is unknown', () => {
    // The archive path is the safe default: its URL constrains the year,
    // the root path's does not (#1342).
    expect(resolveExportPathStyle('2026-2027', undefined)).toBe('archive')
  })
})

describe('parseFooterAsOfDate (#1384)', () => {
  it('reads the as-of date from a 3-letter-month footer', () => {
    expect(
      parseFooterAsOfDate(csv([ROW], 'Month of Jul, As of 07/26/2026'))
    ).toBe('2026-07-26')
  })

  it('reads it from a full-month, quoted footer', () => {
    expect(
      parseFooterAsOfDate(csv([ROW], '"Month of March, As of 3/1/2026"'))
    ).toBe('2026-03-01')
  })

  it('returns undefined when there is no footer — undecided, not a verdict', () => {
    expect(parseFooterAsOfDate(csv([ROW], undefined))).toBeUndefined()
    expect(parseFooterAsOfDate('')).toBeUndefined()
  })
})

describe('countCsvDataRows (#1384)', () => {
  it('excludes the header and the footer', () => {
    expect(
      countCsvDataRows(csv([ROW, ROW], 'Month of Jul, As of 07/26/2026'))
    ).toBe(2)
  })

  it('reports zero for a header-plus-footer body (probe E)', () => {
    expect(countCsvDataRows(csv([], 'Month of Jul, As of 07/20/2026'))).toBe(0)
  })

  it('reports zero for a header-only body', () => {
    expect(countCsvDataRows(HEADER)).toBe(0)
  })

  it('counts an unrecognised trailing row as data — conservative by design', () => {
    expect(countCsvDataRows([HEADER, ROW, 'As of 02/26/2026'].join('\n'))).toBe(
      2
    )
  })
})

describe('verifyBackfillCsv (#1384)', () => {
  const liveRequest = {
    programYear: '2026-2027',
    date: '2026-07-26',
    pathStyle: 'live' as const,
  }

  it('accepts a live-path body whose footer matches the request (probe B)', () => {
    const verdict = verifyBackfillCsv({
      ...liveRequest,
      content: csv([ROW], 'Month of Jul, As of 07/26/2026'),
    })
    expect(verdict).toEqual({ status: 'ok' })
  })

  it('rejects the empty-month-end-slot trap: as-of ignored, today served (probe C)', () => {
    const verdict = verifyBackfillCsv({
      ...liveRequest,
      content: csv([ROW], 'Month of Jul, As of 08/01/2026'),
    })
    expect(verdict.status).toBe('mismatch')
    expect(verdict).toMatchObject({
      reason: expect.stringContaining('As of 2026-08-01'),
    })
  })

  it('rejects the #1342 classic — historical year fetched from the root (probe G)', () => {
    // Requested PY 2025-2026 as of 2026-06-30; root served today's live data.
    // The footer-derived program year cannot see this (Jul > Jun rolls the
    // year back to 2025-2026, matching the request) — the as-of date is what
    // catches it. That is precisely why both axes exist.
    const verdict = verifyBackfillCsv({
      programYear: '2025-2026',
      date: '2026-06-30',
      pathStyle: 'live',
      content: csv([ROW], 'Month of Jul, As of 08/01/2026'),
    })
    expect(verdict.status).toBe('mismatch')
  })

  it('rejects a body whose footer program year disagrees with the request', () => {
    const verdict = verifyBackfillCsv({
      programYear: '2024-2025',
      date: '2026-03-15',
      pathStyle: 'archive',
      content: csv([ROW], 'Month of Mar, As of 03/15/2026'),
    })
    expect(verdict).toMatchObject({
      status: 'mismatch',
      reason: expect.stringContaining('2025-2026'),
    })
  })

  it('excuses the July window, where the prior year’s June close is still live (probe H)', () => {
    // A legitimate archive request for 2025-2026 as of 2025-07-02 comes back
    // describing June — i.e. PY 2024-2025. Hard-failing this would break
    // every early-July date of every historical backfill.
    const verdict = verifyBackfillCsv({
      programYear: '2025-2026',
      date: '2025-07-02',
      pathStyle: 'archive',
      content: csv([ROW], 'Month of Jun, As of 07/02/2025'),
    })
    expect(verdict).toEqual({ status: 'ok' })
  })

  it('does not excuse a prior-year footer outside July', () => {
    const verdict = verifyBackfillCsv({
      programYear: '2025-2026',
      date: '2025-11-02',
      pathStyle: 'archive',
      content: csv([ROW], 'Month of Nov, As of 11/02/2025'),
    })
    expect(verdict).toEqual({ status: 'ok' })

    const wrongYear = verifyBackfillCsv({
      programYear: '2026-2027',
      date: '2025-11-02',
      pathStyle: 'archive',
      content: csv([ROW], 'Month of Nov, As of 11/02/2025'),
    })
    expect(wrongYear.status).toBe('mismatch')
  })

  it('reports a zero-row body as empty, not ok (probe E — TI dark window)', () => {
    const verdict = verifyBackfillCsv({
      programYear: '2026-2027',
      date: '2026-07-20',
      pathStyle: 'live',
      content: csv([], 'Month of Jul, As of 07/20/2026'),
    })
    expect(verdict).toMatchObject({ status: 'empty' })
  })

  it('reports the live path misused for history as empty, not ok (probe F)', () => {
    const verdict = verifyBackfillCsv({
      programYear: '2025-2026',
      date: '2026-03-15',
      pathStyle: 'live',
      content: csv([], 'Month of Feb, As of 03/15/2026'),
    })
    expect(verdict.status).not.toBe('ok')
  })

  it('accepts a footer-less ARCHIVE body — the URL pinned the year', () => {
    // Rejecting these would break historical backfills of older exports.
    const verdict = verifyBackfillCsv({
      programYear: '2017-2018',
      date: '2017-09-05',
      pathStyle: 'archive',
      content: csv([ROW], undefined),
    })
    expect(verdict).toEqual({ status: 'ok' })
  })

  it('rejects a footer-less LIVE body — nothing pins the year there', () => {
    const verdict = verifyBackfillCsv({
      ...liveRequest,
      content: csv([ROW], undefined),
    })
    expect(verdict.status).toBe('mismatch')
  })

  it('treats a blank body as empty', () => {
    expect(verifyBackfillCsv({ ...liveRequest, content: '' })).toMatchObject({
      status: 'empty',
    })
    expect(
      verifyBackfillCsv({ ...liveRequest, content: undefined })
    ).toMatchObject({ status: 'empty' })
  })
})
