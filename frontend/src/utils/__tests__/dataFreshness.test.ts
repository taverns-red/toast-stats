import { describe, it, expect } from 'vitest'
import { computeFreshness } from '../dataFreshness'

describe('computeFreshness (#1296)', () => {
  it('displays the as-of date (sourceCsvDate), not the pinned snapshot date', () => {
    const f = computeFreshness({
      asOfDate: '2026-07-02',
      snapshotDate: '2026-06-30',
      isLatest: true,
    })
    expect(f.displayDate).toBe('2026-07-02')
  })

  it('flags reconciliation when the latest month-end has advanced into a later month', () => {
    const f = computeFreshness({
      asOfDate: '2026-07-02',
      snapshotDate: '2026-06-30',
      isLatest: true,
    })
    expect(f.reconciling).toBe(true)
    expect(f.reconcilingMonthLabel).toBe('June 2026')
  })

  it('handles the December→January program-year-agnostic rollover', () => {
    const f = computeFreshness({
      asOfDate: '2026-01-05',
      snapshotDate: '2025-12-31',
      isLatest: true,
    })
    expect(f.reconciling).toBe(true)
    expect(f.reconcilingMonthLabel).toBe('December 2025')
  })

  it('does NOT flag reconciliation mid-month (as-of == snapshot date)', () => {
    const f = computeFreshness({
      asOfDate: '2026-03-15',
      snapshotDate: '2026-03-15',
      isLatest: true,
    })
    expect(f.reconciling).toBe(false)
    expect(f.reconcilingMonthLabel).toBeUndefined()
    expect(f.displayDate).toBe('2026-03-15')
  })

  it('does NOT flag reconciliation for a finalized historical month-end (not latest)', () => {
    // Selecting an old month-end via the date picker: its sourceCsvDate is also
    // in the next month, but it is finalized — must not read as "reconciling".
    const f = computeFreshness({
      asOfDate: '2026-04-05',
      snapshotDate: '2026-03-31',
      isLatest: false,
    })
    expect(f.reconciling).toBe(false)
  })

  it('falls back to the snapshot date when the as-of date is unknown', () => {
    const f = computeFreshness({
      asOfDate: undefined,
      snapshotDate: '2026-06-30',
      isLatest: true,
    })
    expect(f.displayDate).toBe('2026-06-30')
    expect(f.reconciling).toBe(false)
  })
})
