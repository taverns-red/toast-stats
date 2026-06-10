/**
 * Registry Freshness — unit tests (#1128, epic #1098)
 *
 * The closing-date registry (docs/month-end-closing-dates.json) sat stale for
 * 3 months with nothing watching (audit 2026-06-09 §9b). These tests pin the
 * pure decision logic the daily pipeline's drift guard runs: derive the
 * expected (dataMonth → lastClosingDate) entries for COMPLETED closing months
 * from raw-csv metadata, compare against the committed registry, and demand
 * loudness when the registry is behind reality (L107/L155).
 */

import { describe, it, expect } from 'vitest'
import type { RawCSVEntry } from '../monthEndDates.js'
import {
  deriveCompletedClosingMonths,
  evaluateRegistryFreshness,
  buildRegistryStaleTitle,
  buildRegistryStaleBody,
} from '../registryFreshness.js'

/** Shorthand for a raw-csv metadata entry. */
function entry(
  collectionDate: string,
  isClosingPeriod: boolean,
  dataMonth?: string
): RawCSVEntry {
  return { collectionDate, isClosingPeriod, dataMonth }
}

/**
 * Real shape (verified live against staging GCS, 2026-06-10): the May-2026
 * closing window ran 2026-06-01..2026-06-05 and 2026-06-06 was the first
 * non-closing day, so 2026-05's closing date is 2026-06-05.
 */
const MAY_2026_WINDOW: RawCSVEntry[] = [
  entry('2026-06-01', true, '2026-05'),
  entry('2026-06-02', true, '2026-05'),
  entry('2026-06-03', true, '2026-05'),
  entry('2026-06-04', true, '2026-05'),
  entry('2026-06-05', true, '2026-05'),
  entry('2026-06-06', false),
]

describe('deriveCompletedClosingMonths', () => {
  it('derives the last closing date for a month whose window has ended', () => {
    const result = deriveCompletedClosingMonths(MAY_2026_WINDOW)
    expect(result).toEqual([
      { dataMonth: '2026-05', closingDate: '2026-06-05' },
    ])
  })

  it('does NOT demand a month whose closing window may still be open', () => {
    // Last entry in the feed is itself a closing day — TI may extend the
    // window tomorrow, so the final closing date is not yet knowable.
    const inProgress = MAY_2026_WINDOW.slice(0, 5) // no 2026-06-06 follower
    expect(deriveCompletedClosingMonths(inProgress)).toEqual([])
  })

  it('skips outage months that have no closing-period entries at all', () => {
    // Collection outage: nothing scraped during the closing window
    // (the 2026-02 / 2022-04 case) — underivable, so not demanded.
    const entries = [entry('2026-03-22', false), entry('2026-03-23', false)]
    expect(deriveCompletedClosingMonths(entries)).toEqual([])
  })

  it('derives multiple completed months independently', () => {
    const entries = [
      entry('2026-04-06', true, '2026-03'),
      entry('2026-04-07', true, '2026-03'),
      entry('2026-04-08', false),
      ...MAY_2026_WINDOW,
    ]
    expect(deriveCompletedClosingMonths(entries)).toEqual([
      { dataMonth: '2026-03', closingDate: '2026-04-07' },
      { dataMonth: '2026-05', closingDate: '2026-06-05' },
    ])
  })

  it('completes a month when a LATER closing window for another month follows', () => {
    // No plain non-closing day between the two windows — the next month's
    // closing entries still prove the earlier window ended.
    const entries = [
      entry('2026-05-07', true, '2026-04'),
      entry('2026-06-01', true, '2026-05'),
    ]
    expect(deriveCompletedClosingMonths(entries)).toEqual([
      { dataMonth: '2026-04', closingDate: '2026-05-07' },
    ])
  })
})

describe('evaluateRegistryFreshness', () => {
  const registryWithMay = [{ dataMonth: '2026-05', closingDate: '2026-06-05' }]

  it('is fresh when every derivable completed month is registered with a matching date', () => {
    const result = evaluateRegistryFreshness(registryWithMay, MAY_2026_WINDOW)
    expect(result.fresh).toBe(true)
    expect(result.missing).toEqual([])
    expect(result.mismatched).toEqual([])
    expect(result.emptyFeed).toBe(false)
  })

  it('is stale when a derivable completed month is missing from the registry', () => {
    const result = evaluateRegistryFreshness([], MAY_2026_WINDOW)
    expect(result.fresh).toBe(false)
    expect(result.missing).toEqual([
      { dataMonth: '2026-05', closingDate: '2026-06-05' },
    ])
  })

  it('is stale when reality moved past the registered closing date', () => {
    // Registry committed mid-window (06-03), then TI kept serving May data
    // through 06-05 — the registry is objectively behind.
    const result = evaluateRegistryFreshness(
      [{ dataMonth: '2026-05', closingDate: '2026-06-03' }],
      MAY_2026_WINDOW
    )
    expect(result.fresh).toBe(false)
    expect(result.mismatched).toEqual([
      {
        dataMonth: '2026-05',
        registryClosingDate: '2026-06-03',
        derivedClosingDate: '2026-06-05',
      },
    ])
  })

  it('trusts a registry date LATER than the derivable one (manual outage entry)', () => {
    // Partial outage: we scraped early closing days only; the operator
    // backfilled the true (later) closing date from TI behavior. The
    // registry knows more than our metadata — do not alarm.
    const result = evaluateRegistryFreshness(
      [{ dataMonth: '2026-05', closingDate: '2026-06-08' }],
      MAY_2026_WINDOW
    )
    expect(result.fresh).toBe(true)
    expect(result.mismatched).toEqual([])
  })

  it('alerts on an empty metadata feed instead of passing vacuously (L107)', () => {
    const result = evaluateRegistryFreshness(registryWithMay, [])
    expect(result.fresh).toBe(false)
    expect(result.emptyFeed).toBe(true)
  })

  it('ignores registry entries for months outside the derivable set', () => {
    // Manual entries for outage months (2026-02, 2022-04) are not derivable
    // and must not be flagged.
    const registry = [
      ...registryWithMay,
      { dataMonth: '2026-02', closingDate: '2026-03-10' },
      { dataMonth: '2022-04', closingDate: '2022-05-09' },
    ]
    const result = evaluateRegistryFreshness(registry, MAY_2026_WINDOW)
    expect(result.fresh).toBe(true)
  })
})

describe('alert builders', () => {
  it('title names the stale months', () => {
    const result = evaluateRegistryFreshness([], MAY_2026_WINDOW)
    const title = buildRegistryStaleTitle(result)
    expect(title).toContain('closing-date registry')
    expect(title).toContain('2026-05')
  })

  it('body lists missing/mismatched entries and the remediation command', () => {
    const result = evaluateRegistryFreshness(
      [{ dataMonth: '2026-04', closingDate: '2026-05-06' }],
      [entry('2026-05-07', true, '2026-04'), ...MAY_2026_WINDOW]
    )
    const body = buildRegistryStaleBody(result)
    expect(body).toContain('2026-05')
    expect(body).toContain('2026-06-05')
    expect(body).toContain('2026-04') // mismatched month
    expect(body).toContain('update-closing-date-registry')
    expect(body).toContain('docs/month-end-closing-dates.json')
  })

  it('body explains an empty feed as a monitor failure, not a pass', () => {
    const result = evaluateRegistryFreshness([], [])
    const body = buildRegistryStaleBody(result)
    expect(body).toMatch(/metadata|feed/i)
  })
})
