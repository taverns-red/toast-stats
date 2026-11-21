import { describe, it, expect } from 'vitest'
import { getProgramYear, isPastProgramYearClose } from '../programYear'

const PY_2026_27 = getProgramYear(2026)
const PY_2025_26 = getProgramYear(2025)

describe('isPastProgramYearClose (#3075)', () => {
  const dates = ['2025-04-30', '2025-05-31', '2025-06-27', '2026-07-31']

  it('is true for the last snapshot of a past year with no June 30 date', () => {
    expect(isPastProgramYearClose('2025-06-27', dates, PY_2026_27)).toBe(true)
  })

  it('is false for an earlier snapshot in that past year', () => {
    expect(isPastProgramYearClose('2025-05-31', dates, PY_2026_27)).toBe(false)
  })

  it('is false in the newest program year with data, even at its last date', () => {
    const current = ['2026-04-30', '2026-06-29']
    expect(isPastProgramYearClose('2026-06-29', current, PY_2025_26)).toBe(
      false
    )
  })

  it('takes the year from the snapshot date, not the newest year', () => {
    // A July date belongs to the next program year, so the June date is the
    // last one in its own year.
    expect(
      isPastProgramYearClose(
        '2025-06-27',
        ['2025-06-27', '2025-07-31'],
        PY_2026_27
      )
    ).toBe(true)
  })

  it('is false for a date it was not given, or with no newest year', () => {
    expect(isPastProgramYearClose('2025-06-28', dates, PY_2026_27)).toBe(false)
    expect(isPastProgramYearClose(undefined, dates, PY_2026_27)).toBe(false)
    expect(isPastProgramYearClose('2025-06-27', dates, undefined)).toBe(false)
  })
})
