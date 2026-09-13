/**
 * `summarizeCspCompletion` (#1555, #1565) — the one reducer over analytics
 * club rows that the action list and the district overview share, so the
 * "not submitted" count and each club's deadline can never be computed two
 * ways.
 *
 * Reuses `getCSPStatus` (analytics-core) for the boolean fold,
 * `isIneligibleStatus` (raw path) for the active/ineligible split and
 * `cspDueDate` / `isCspOverdue` (analytics-core) for the per-club deadline —
 * one rule, two paths (lessons 052/061/076). It does NOT gate on the program
 * year: the caller owns that (R3) and must not call this for a pre-2025-26
 * year. The program year and pinned snapshot date are passed in, never read
 * from a clock.
 */
import { describe, it, expect } from 'vitest'
import { summarizeCspCompletion } from '../cspCompletion'

type Row = {
  id: string
  cspSubmitted?: boolean
  clubStatus?: string
  charterDate?: string
}

// PY 2026-27, snapshot before the 30 September deadline.
const AS_OF = { programYear: '2026-2027', snapshotDate: '2026-09-11' }
const STANDARD_DUE = '2026-09-30'

const submitted: Row = { id: 's', cspSubmitted: true }
const submittedLow: Row = { id: 's-low', cspSubmitted: true, clubStatus: 'Low' }
const submittedIneligible: Row = {
  id: 's-inel',
  cspSubmitted: true,
  clubStatus: 'Ineligible',
}
const missing: Row = { id: 'm', cspSubmitted: false, clubStatus: 'Active' }
const missingNoStatus: Row = { id: 'm2', cspSubmitted: false }
const missingSuspended: Row = {
  id: 'm-susp',
  cspSubmitted: false,
  clubStatus: 'Suspended',
}
const unknown: Row = { id: 'u' }

describe('summarizeCspCompletion', () => {
  it('splits rows into submitted / active-missing / ineligible-missing / unknown', () => {
    const s = summarizeCspCompletion(
      [
        submitted,
        submittedLow,
        submittedIneligible,
        missing,
        missingNoStatus,
        missingSuspended,
        unknown,
      ],
      AS_OF
    )
    expect(s.submittedCount).toBe(3) // any status counts as submitted
    // …but the overview's "of N active clubs" denominator needs to know how
    // many of those submitters are ineligible (#1555 part 4).
    expect(s.submittedIneligibleCount).toBe(1)
    expect(s.notSubmitted.map(r => r.id)).toEqual(['m', 'm2'])
    expect(s.notSubmittedIneligible.map(r => r.id)).toEqual(['m-susp'])
    expect(s.notSubmittedAutoCredit).toEqual([])
    expect(s.unknownCount).toBe(1)
  })

  it('annotates each active missing club with its due date and whether it is overdue (#1565)', () => {
    const s = summarizeCspCompletion([missing, missingNoStatus], AS_OF)
    expect(s.notSubmitted).toEqual([
      { ...missing, cspDueDate: STANDARD_DUE, cspOverdue: false },
      { ...missingNoStatus, cspDueDate: STANDARD_DUE, cspOverdue: false },
    ])
  })

  it('reads overdue from the pinned snapshot date, never the clock', () => {
    const s = summarizeCspCompletion([missing], {
      programYear: '2026-2027',
      snapshotDate: '2026-10-01',
    })
    expect(s.notSubmitted[0]).toMatchObject({
      cspDueDate: STANDARD_DUE,
      cspOverdue: true,
    })
  })

  it('gives a club chartered in-year charter + 90 days', () => {
    const newborn: Row = {
      id: 'new',
      cspSubmitted: false,
      clubStatus: 'Active',
      charterDate: '2026-08-15',
    }
    const s = summarizeCspCompletion([newborn], {
      programYear: '2026-2027',
      snapshotDate: '2026-10-05',
    })
    expect(s.notSubmitted[0]).toMatchObject({
      cspDueDate: '2026-11-13',
      cspOverdue: false,
    })
  })

  it('files a club chartered after 1 April as automatic credit — never listed, in neither count', () => {
    const springMissing: Row = {
      id: 'spring-n',
      cspSubmitted: false,
      clubStatus: 'Active',
      charterDate: '2027-04-15',
    }
    const springFiled: Row = {
      id: 'spring-y',
      cspSubmitted: true,
      clubStatus: 'Active',
      charterDate: '2027-05-22',
    }
    const s = summarizeCspCompletion(
      [submitted, missing, springMissing, springFiled],
      { programYear: '2026-2027', snapshotDate: '2027-05-31' }
    )
    expect(s.notSubmitted.map(r => r.id)).toEqual(['m'])
    expect(s.notSubmittedAutoCredit.map(r => r.id)).toEqual(['spring-n'])
    // The auto-credit club that filed anyway is not a submitter for the ratio.
    expect(s.submittedCount).toBe(1)
    expect(s.submittedIneligibleCount).toBe(0)
  })

  it('a suspended club chartered after 1 April is ineligible first, not auto-credit', () => {
    const s = summarizeCspCompletion(
      [
        {
          id: 'gone',
          cspSubmitted: false,
          clubStatus: 'Suspended',
          charterDate: '2027-04-15',
        },
      ],
      { programYear: '2026-2027', snapshotDate: '2027-05-31' }
    )
    expect(s.notSubmittedIneligible.map(r => r.id)).toEqual(['gone'])
    expect(s.notSubmittedAutoCredit).toEqual([])
  })

  it('preserves input order (callers sort)', () => {
    const s = summarizeCspCompletion([missingNoStatus, missing], AS_OF)
    expect(s.notSubmitted.map(r => r.id)).toEqual(['m2', 'm'])
  })

  it('returns zeros and empty lists for no rows', () => {
    expect(summarizeCspCompletion([], AS_OF)).toEqual({
      submittedCount: 0,
      submittedIneligibleCount: 0,
      notSubmitted: [],
      notSubmittedIneligible: [],
      notSubmittedAutoCredit: [],
      unknownCount: 0,
    })
  })
})
