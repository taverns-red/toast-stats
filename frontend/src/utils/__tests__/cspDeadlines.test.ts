/**
 * Club Success Plan deadline atoms (#1565) — the pieces every deadline-aware
 * surface (area + division narratives, action list, district overview)
 * composes its sentence from, so the date format, the grouping order and the
 * "automatic credit" wording exist once (lessons 61/76).
 *
 * Nothing here reads a clock: `cspOverdue` is resolved upstream against the
 * caller's pinned snapshot date (R3) and arrives as a field.
 */
import { describe, it, expect } from 'vitest'
import {
  cspAutoCreditNote,
  describeCspDueDates,
  formatCspDueDate,
  groupByCspDueDate,
  CSP_LOST_ELIGIBILITY,
} from '../cspDeadlines'

describe('formatCspDueDate', () => {
  it('renders an ISO date as "D Month YYYY" without touching the timezone', () => {
    expect(formatCspDueDate('2026-09-30')).toBe('30 September 2026')
    expect(formatCspDueDate('2027-03-01')).toBe('1 March 2027')
    expect(formatCspDueDate('2026-12-01')).toBe('1 December 2026')
  })
})

describe('groupByCspDueDate', () => {
  const a = { id: 'a', cspDueDate: '2026-09-30', cspOverdue: false }
  const b = { id: 'b', cspDueDate: '2026-12-01', cspOverdue: false }
  const c = { id: 'c', cspDueDate: '2026-09-30', cspOverdue: false }
  const d = { id: 'd', cspDueDate: '2026-09-29', cspOverdue: true }
  const e = { id: 'e', cspDueDate: '2026-09-30', cspOverdue: true }

  it('groups clubs sharing a due date, preserving input order within a group', () => {
    const groups = groupByCspDueDate([a, b, c])
    expect(groups).toEqual([
      { dueDate: '2026-09-30', overdue: false, clubs: [a, c] },
      { dueDate: '2026-12-01', overdue: false, clubs: [b] },
    ])
  })

  it('puts overdue groups first, each side ordered by due date', () => {
    const groups = groupByCspDueDate([b, e, a, d])
    expect(groups.map(g => [g.dueDate, g.overdue])).toEqual([
      ['2026-09-29', true],
      ['2026-09-30', true],
      ['2026-09-30', false],
      ['2026-12-01', false],
    ])
  })

  it('returns no groups for no clubs', () => {
    expect(groupByCspDueDate([])).toEqual([])
  })
})

describe('describeCspDueDates', () => {
  it('names a single due date plainly', () => {
    expect(
      describeCspDueDates([
        { dueDate: '2026-09-30', overdue: false, clubs: [1, 2, 3] },
      ])
    ).toBe('30 September 2026')
  })

  it('names each date with its club count when there are several', () => {
    expect(
      describeCspDueDates([
        { dueDate: '2026-09-30', overdue: false, clubs: [1, 2, 3] },
        { dueDate: '2026-12-01', overdue: false, clubs: [4] },
      ])
    ).toBe('30 September 2026 for 3 clubs and 1 December 2026 for 1 club')
    expect(
      describeCspDueDates([
        { dueDate: '2026-09-30', overdue: false, clubs: [1, 2] },
        { dueDate: '2026-11-15', overdue: false, clubs: [3] },
        { dueDate: '2026-12-01', overdue: false, clubs: [4, 5] },
      ])
    ).toBe(
      '30 September 2026 for 2 clubs, 15 November 2026 for 1 club and 1 December 2026 for 2 clubs'
    )
  })
})

describe('cspAutoCreditNote', () => {
  it('states the automatic-credit rule with the right number', () => {
    expect(cspAutoCreditNote(1)).toBe(
      '1 club chartered after 1 April has automatic credit'
    )
    expect(cspAutoCreditNote(3)).toBe(
      '3 clubs chartered after 1 April have automatic credit'
    )
  })
})

describe('CSP_LOST_ELIGIBILITY', () => {
  it('is the terminal phrase — no "until", nothing left to fix', () => {
    expect(CSP_LOST_ELIGIBILITY).toBe(
      'cannot be Distinguished this program year'
    )
    expect(CSP_LOST_ELIGIBILITY).not.toMatch(/until/)
  })
})
