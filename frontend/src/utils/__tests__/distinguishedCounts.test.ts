/* #2554 (part): the district KPI's confirmed / provisional pair.
 * Confirmed is the headline and the basis of the rank beside it; provisional
 * is shown separately and never summed in. The pipeline's
 * `distinguishedCounts` wins; until the daily run publishes it, the existing
 * fields stand in (ADR 0019): the rankings row's `distinguishedClubs` is
 * confirmed, the performance-targets `currentProgress.distinguished` is
 * qualifying today (confirmed + provisional). */
import { describe, it, expect } from 'vitest'
import { resolveDistinguishedCounts } from '../distinguishedCounts'

describe('resolveDistinguishedCounts (#2554)', () => {
  it('uses the pipeline pair when the analytics file carries it', () => {
    expect(
      resolveDistinguishedCounts({
        counts: { confirmed: 3, provisional: 3 },
        rankingConfirmed: 99,
        qualifyingToday: 99,
      })
    ).toEqual({ confirmed: 3, provisional: 3, source: 'analytics' })
  })

  it('falls back to rankings confirmed, provisional = qualifying - confirmed', () => {
    // D61 on 2026-10-27: 6 qualifying today, 3 confirmed.
    expect(
      resolveDistinguishedCounts({
        counts: undefined,
        rankingConfirmed: 3,
        qualifyingToday: 6,
      })
    ).toEqual({ confirmed: 3, provisional: 3, source: 'rankings' })
  })

  it('never reports a negative provisional when the bases differ', () => {
    expect(
      resolveDistinguishedCounts({
        rankingConfirmed: 8,
        qualifyingToday: 6,
      })
    ).toEqual({ confirmed: 8, provisional: 0, source: 'rankings' })
  })

  it('with neither source of confirmed, shows qualifying-today alone', () => {
    expect(
      resolveDistinguishedCounts({ counts: null, qualifyingToday: 6 })
    ).toEqual({ confirmed: 6, provisional: 0, source: 'qualifying-today' })
  })

  // #2580: the What Changed tile has no qualifying-today figure, so the
  // resolver must accept its absence and report what it could not know.
  describe('without a qualifying-today figure (#2580)', () => {
    it('uses the pipeline pair when present', () => {
      expect(
        resolveDistinguishedCounts({ counts: { confirmed: 4, provisional: 1 } })
      ).toEqual({ confirmed: 4, provisional: 1, source: 'analytics' })
    })

    it('takes confirmed from the rankings row and leaves provisional unknown', () => {
      expect(resolveDistinguishedCounts({ rankingConfirmed: 7 })).toEqual({
        confirmed: 7,
        provisional: null,
        source: 'rankings',
      })
    })

    it('reports nothing when neither source is loaded', () => {
      expect(resolveDistinguishedCounts({ counts: null })).toEqual({
        confirmed: null,
        provisional: null,
        source: 'none',
      })
    })
  })
})
