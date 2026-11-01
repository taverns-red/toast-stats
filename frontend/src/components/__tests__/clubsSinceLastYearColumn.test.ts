import { describe, expect, it } from 'vitest'
import { sinceLastYearPhoneMeta } from '../clubsSinceLastYearColumn'

/* #2432 — the phone row's DCP meta while the since-last-year preset is on.
   At 375 the meta shares line 2 with the status chip, so last year's value
   has to fit in the DCP figure itself, not a trailing "(was 3)" that the row
   ellipsizes away. */
describe('sinceLastYearPhoneMeta (#2432)', () => {
  it('shows then → now in the DCP figure', () => {
    expect(
      sinceLastYearPhoneMeta({ kind: 'compared', now: 4, then: 1, delta: 3 }, 4)
    ).toBe('1→4/10 DCP')
  })

  it('marks a club with no prior-year data briefly', () => {
    expect(
      sinceLastYearPhoneMeta({ kind: 'no-prior', reason: 'not-in-district' }, 7)
    ).toBe('7/10 DCP · no prior yr')
  })

  it('falls back to the plain figure without an entry', () => {
    expect(sinceLastYearPhoneMeta(undefined, 5)).toBe('5/10 DCP')
  })
})
