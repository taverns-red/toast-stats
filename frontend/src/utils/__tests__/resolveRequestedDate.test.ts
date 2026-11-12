/**
 * resolveRequestedDate (#2635) — the one place a `?date=` is checked against
 * the snapshots that actually exist. Cases from the 2026-11-12 UX review.
 */
import { describe, it, expect } from 'vitest'
import { resolveRequestedDate } from '../resolveRequestedDate'
import { getProgramYear } from '../programYear'
import { snapshotDatesFrom } from '../../types/snapshotDate'

// PY2025: 2025-08-01, 2026-03-15, 2026-05-01   PY2026: 2026-08-01, 2026-11-11
const dates = snapshotDatesFrom({
  dates: ['2025-08-01', '2026-03-15', '2026-05-01', '2026-08-01', '2026-11-11'],
})
const py2026 = getProgramYear(2026)
const py2025 = getProgramYear(2025)

describe('resolveRequestedDate (#2635)', () => {
  it('no param: the selected PY latest, status none', () => {
    const r = resolveRequestedDate({
      requested: null,
      dates,
      programYear: py2026,
    })
    expect(r).toMatchObject({
      status: 'none',
      date: '2026-11-11',
      programYear: py2026,
    })
  })

  it('a date in the list and the selected PY is used as-is', () => {
    const r = resolveRequestedDate({
      requested: '2026-08-01',
      dates,
      programYear: py2026,
    })
    expect(r).toMatchObject({ status: 'valid', date: '2026-08-01' })
  })

  it('a date in the list of another PY switches to that PY', () => {
    const r = resolveRequestedDate({
      requested: '2026-03-15',
      dates,
      programYear: py2026,
    })
    expect(r.status).toBe('switched-py')
    expect(r.date).toBe('2026-03-15')
    expect(r.programYear.year).toBe(2025)
  })

  it('a date inside the PY but not a snapshot falls back to the nearest earlier one', () => {
    const r = resolveRequestedDate({
      requested: '2026-10-01',
      dates,
      programYear: py2026,
    })
    expect(r).toMatchObject({
      status: 'fallback',
      date: '2026-08-01',
      requested: '2026-10-01',
    })
  })

  it('a date before every snapshot in the PY falls back to the PY latest', () => {
    const r = resolveRequestedDate({
      requested: '2020-01-01',
      dates,
      programYear: py2025,
    })
    expect(r).toMatchObject({ status: 'fallback', date: '2026-05-01' })
  })

  it('a date after the PY falls back to the PY latest', () => {
    const r = resolveRequestedDate({
      requested: '2027-05-01',
      dates,
      programYear: py2026,
    })
    expect(r).toMatchObject({ status: 'fallback', date: '2026-11-11' })
  })

  it('garbage falls back to the PY latest', () => {
    const r = resolveRequestedDate({
      requested: 'notadate',
      dates,
      programYear: py2026,
    })
    expect(r).toMatchObject({ status: 'fallback', date: '2026-11-11' })
  })

  it('never returns a date outside the list', () => {
    for (const requested of [
      '2019-01-01',
      '2026-02-30',
      '2026-09-09',
      '9999-12-31',
      '',
      'null',
    ]) {
      for (const programYear of [py2025, py2026]) {
        const r = resolveRequestedDate({ requested, dates, programYear })
        expect(r.date === null || dates.includes(r.date)).toBe(true)
      }
    }
  })

  describe('a non-snapshot date across a program-year boundary', () => {
    // Jul 1 starts PY2026; nothing in PY2026 is earlier than these, so the
    // nearest earlier snapshot is 2026-05-01 in PY2025, and the PY follows it.
    it.each(['2026-07-10', '2026-07-01'])(
      '%s (PY2026, before its first snapshot) resolves to the prior PY',
      requested => {
        const r = resolveRequestedDate({
          requested,
          dates,
          programYear: py2026,
        })
        expect(r).toMatchObject({ status: 'fallback', date: '2026-05-01' })
        expect(r.programYear.year).toBe(2025)
      }
    )

    // Jun 29/30 belong to PY2025, which has data: take its nearest earlier
    // snapshot even though PY2026 is the selected year.
    it.each(['2026-06-30', '2026-06-29'])(
      '%s (PY2025) resolves inside PY2025 when PY2026 is selected',
      requested => {
        const r = resolveRequestedDate({
          requested,
          dates,
          programYear: py2026,
        })
        expect(r).toMatchObject({ status: 'fallback', date: '2026-05-01' })
        expect(r.programYear.year).toBe(2025)
      }
    )

    it('a date before every snapshot anywhere falls back to the selected PY latest', () => {
      const r = resolveRequestedDate({
        requested: '2020-01-01',
        dates,
        programYear: py2026,
      })
      expect(r).toMatchObject({ status: 'fallback', date: '2026-11-11' })
      expect(r.programYear.year).toBe(2026)
    })

    it('a date in a PY with no data takes the nearest earlier snapshot overall', () => {
      // 2028-01-01 is PY2027, which has no snapshots.
      const r = resolveRequestedDate({
        requested: '2028-01-01',
        dates,
        programYear: py2025,
      })
      expect(r).toMatchObject({ status: 'fallback', date: '2026-11-11' })
      expect(r.programYear.year).toBe(2026)
    })
  })

  it('a PY with no snapshots resolves to a null date', () => {
    const r = resolveRequestedDate({
      requested: '2026-10-01',
      dates: [],
      programYear: py2026,
    })
    expect(r.date).toBeNull()
  })
})
