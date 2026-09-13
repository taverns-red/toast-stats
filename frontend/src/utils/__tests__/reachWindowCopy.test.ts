import { describe, it, expect } from 'vitest'
import { reachWindowCopy } from '../reachWindowCopy'

/**
 * #1556 — every crossing date renders as "on D", "between A and B" or
 * "by D" per `observedAfter`. A date is never shown as a point when it was a
 * window: the collector did not look on the days in between, and saying
 * "on 19 Aug" for a club that crossed sometime after 17 Aug is a plausible
 * wrong date.
 */
describe('reachWindowCopy (#1556)', () => {
  it('"on D" when the previous observed date is the day before', () => {
    expect(reachWindowCopy('2026-08-12', '2026-08-11')).toBe('on 12 Aug')
  })

  it('"between A and B" when snapshots were not consecutive', () => {
    expect(reachWindowCopy('2026-08-19', '2026-08-17')).toBe(
      'between 17 Aug and 19 Aug'
    )
  })

  it('"by D" with the year when nothing earlier was ever observed', () => {
    expect(reachWindowCopy('2026-07-26', null)).toBe('by 26 Jul 2026')
  })

  it('names both years when a window straddles a year boundary', () => {
    expect(reachWindowCopy('2027-01-02', '2026-12-31')).toBe(
      'between 31 Dec 2026 and 2 Jan 2027'
    )
  })

  it('is timezone-invariant: a first-of-month date never rolls back a day', () => {
    expect(reachWindowCopy('2026-09-01', '2026-08-31')).toBe('on 1 Sep')
  })
})
