import { describe, it, expect } from 'vitest'
import {
  getProgramYearForDate,
  getAvailableProgramYears,
  calculateProgramYearDay,
} from '../programYear'

/**
 * Timezone-boundary regression (#1116 item 2).
 *
 * `new Date("YYYY-MM-DD")` parses as UTC midnight, but `.getMonth()` /
 * `.getFullYear()` read LOCAL time. In a UTC-negative zone a first-of-July
 * date rolls back to June 30 of the prior calendar year, flipping the
 * derived program year (and the program-year-day) by a full year/day.
 *
 * The program-year boundary is a calendar-date fact, not a wall-clock fact,
 * so these must be TZ-invariant. Run the suite under TZ=America/New_York to
 * exercise the negative-offset path.
 */
describe('programYear timezone invariance (#1116 item 2)', () => {
  it('getProgramYearForDate puts July 1 in the program year that starts that July', () => {
    expect(getProgramYearForDate('2026-07-01').year).toBe(2026)
    // June 30 belongs to the prior program year.
    expect(getProgramYearForDate('2026-06-30').year).toBe(2025)
  })

  it('getAvailableProgramYears assigns a July-1 date to the year starting that July', () => {
    expect(getAvailableProgramYears(['2026-07-01']).map(p => p.year)).toEqual([
      2026,
    ])
    expect(getAvailableProgramYears(['2026-06-30']).map(p => p.year)).toEqual([
      2025,
    ])
  })

  it('calculateProgramYearDay treats July 1 as day 0', () => {
    expect(calculateProgramYearDay('2026-07-01')).toBe(0)
  })
})
