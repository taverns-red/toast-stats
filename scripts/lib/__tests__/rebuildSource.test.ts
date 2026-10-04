/**
 * Rebuild source resolution for month-end dates (#1608).
 *
 * A rebuild is dispatched by SNAPSHOT date (e.g. 2026-06-30), but the raw-csv
 * dir with that name is the in-month view ("As of 06/30") — TI's month close
 * lands weeks later under a next-month collection date (raw-csv/2026-07-25,
 * isClosingPeriod:true, dataMonth 2026-06). Rebuilding the month-end from
 * its same-named raw replaced the June close with pre-close data on
 * 2026-09-10. The rebuild must source a month-end from the LAST closing raw
 * for that data month whenever one exists.
 */

import { describe, it, expect } from 'vitest'
import {
  isLastDayOfMonth,
  resolveRebuildSourceDate,
  closingCandidateWindow,
} from '../rebuildSource'
import type { RawCSVEntry } from '../monthEndDates'

const nonClosing = (d: string): RawCSVEntry => ({
  collectionDate: d,
  isClosingPeriod: false,
  dataMonth: undefined,
})
const closing = (d: string, month: string): RawCSVEntry => ({
  collectionDate: d,
  isClosingPeriod: true,
  dataMonth: month,
})

// Real staging shape around the PY 2025-26 year-end (verified 2026-10-04).
const JUNE_2026: RawCSVEntry[] = [
  nonClosing('2026-06-30'),
  closing('2026-07-01', '2026-06'),
  closing('2026-07-15', '2026-06'),
  closing('2026-07-24', '2026-06'),
  closing('2026-07-25', '2026-06'),
  nonClosing('2026-07-26'),
  nonClosing('2026-07-29'),
]

describe('isLastDayOfMonth', () => {
  it.each([
    ['2026-06-30', true],
    ['2026-02-28', true],
    ['2024-02-29', true],
    ['2024-02-28', false],
    ['2026-12-31', true],
    ['2026-07-25', false],
  ])('%s → %s', (date, expected) => {
    expect(isLastDayOfMonth(date)).toBe(expected)
  })
})

describe('resolveRebuildSourceDate', () => {
  it('sources a month-end from the last closing raw for that month (the 2026-06-30 incident)', () => {
    expect(resolveRebuildSourceDate('2026-06-30', JUNE_2026)).toBe('2026-07-25')
  })

  it('keeps a month-end date when no closing raw exists for its month', () => {
    expect(
      resolveRebuildSourceDate('2026-06-30', [
        nonClosing('2026-06-30'),
        nonClosing('2026-07-01'),
      ])
    ).toBe('2026-06-30')
  })

  it('ignores closing raws for a different data month', () => {
    expect(
      resolveRebuildSourceDate('2026-05-31', [
        nonClosing('2026-05-31'),
        ...JUNE_2026,
      ])
    ).toBe('2026-05-31')
  })

  it('handles the December → January year boundary', () => {
    expect(
      resolveRebuildSourceDate('2025-12-31', [
        closing('2026-01-05', '2025-12'),
        closing('2026-01-08', '2025-12'),
      ])
    ).toBe('2026-01-08')
  })

  // Pre-2026 raws carry no metadata.json (closing is decided by the CSV
  // footer / registry), so metadata reads come back non-closing. The
  // committed registry then names the close: raw-csv/2025-07-20 → 2025-06.
  it('falls back to the closing-date registry when metadata proves nothing', () => {
    const metadataless = [nonClosing('2025-07-01'), nonClosing('2025-07-20')]
    expect(
      resolveRebuildSourceDate('2025-06-30', metadataless, {
        registry: [{ dataMonth: '2025-06', closingDate: '2025-07-20' }],
        rawDates: ['2025-07-01', '2025-07-20'],
      })
    ).toBe('2025-07-20')
  })

  it('ignores a registry closing date whose raw dir does not exist', () => {
    expect(
      resolveRebuildSourceDate('2025-06-30', [], {
        registry: [{ dataMonth: '2025-06', closingDate: '2025-07-20' }],
        rawDates: ['2025-07-01'],
      })
    ).toBe('2025-06-30')
  })

  it('prefers metadata-proven closes over the registry', () => {
    // docs/month-end-closing-dates.json lists 2026-06 → 2026-07-29, which is
    // a July daily ("Month of Jul, As of 07/29/2026"); metadata proves 07-25.
    expect(
      resolveRebuildSourceDate('2026-06-30', JUNE_2026, {
        registry: [{ dataMonth: '2026-06', closingDate: '2026-07-29' }],
        rawDates: JUNE_2026.map(e => e.collectionDate),
      })
    ).toBe('2026-07-25')
  })

  it('leaves a non-month-end date untouched (closing raws remap themselves)', () => {
    expect(resolveRebuildSourceDate('2026-07-25', JUNE_2026)).toBe('2026-07-25')
    expect(resolveRebuildSourceDate('2026-06-15', JUNE_2026)).toBe('2026-06-15')
  })
})

describe('closingCandidateWindow', () => {
  it('selects raw dates after the month-end within the closing window', () => {
    expect(
      closingCandidateWindow('2026-06-30', [
        '2026-06-29',
        '2026-06-30',
        '2026-07-01',
        '2026-07-25',
        '2026-08-14',
        '2026-08-15',
      ])
    ).toEqual(['2026-07-01', '2026-07-25', '2026-08-14'])
  })
})
