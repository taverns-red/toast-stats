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

  it('a PY with no snapshots resolves to a null date', () => {
    const r = resolveRequestedDate({
      requested: '2026-10-01',
      dates: [],
      programYear: py2026,
    })
    expect(r.date).toBeNull()
  })
})
