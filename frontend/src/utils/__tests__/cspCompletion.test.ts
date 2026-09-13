/**
 * `summarizeCspCompletion` (#1555) — the one reducer over analytics club rows
 * that the action list (and, later, the district overview) share, so the
 * "not submitted" count can never be computed two ways.
 *
 * Reuses `getCSPStatus` (analytics-core) for the boolean fold and
 * `isIneligibleStatus` (raw path) for the active/ineligible split — one rule,
 * two paths (lessons 052/061/076). It does NOT gate on the program year: the
 * caller owns that (R3) and must not call this for a pre-2025-26 year.
 */
import { describe, it, expect } from 'vitest'
import { summarizeCspCompletion } from '../cspCompletion'

type Row = { id: string; cspSubmitted?: boolean; clubStatus?: string }

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
    const s = summarizeCspCompletion([
      submitted,
      submittedLow,
      submittedIneligible,
      missing,
      missingNoStatus,
      missingSuspended,
      unknown,
    ])
    expect(s.submittedCount).toBe(3) // any status counts as submitted
    expect(s.notSubmitted.map(r => r.id)).toEqual(['m', 'm2'])
    expect(s.notSubmittedIneligible.map(r => r.id)).toEqual(['m-susp'])
    expect(s.unknownCount).toBe(1)
  })

  it('preserves input order (callers sort)', () => {
    const s = summarizeCspCompletion([missingNoStatus, missing])
    expect(s.notSubmitted.map(r => r.id)).toEqual(['m2', 'm'])
  })

  it('returns zeros and empty lists for no rows', () => {
    expect(summarizeCspCompletion([])).toEqual({
      submittedCount: 0,
      notSubmitted: [],
      notSubmittedIneligible: [],
      unknownCount: 0,
    })
  })
})
