import { describe, it, expect } from 'vitest'
import { getAvailableProgramYears } from '../programYear'

/**
 * Malformed-date robustness regression (#1353).
 *
 * `getAvailableProgramYears` derives a program year per date with no guard
 * against an unparseable one: `calendarParts` returns `NaN` for a non-ISO
 * string, `NaN >= 7` is `false`, so `programYearStart = NaN - 1 = NaN`, and
 * the dedup Set gains a `NaN` entry. `getProgramYear(NaN)` then yields a
 * `label: "NaN-NaN"` program year that renders as a selectable dropdown
 * option (`DataControlsBar.tsx`).
 *
 * The two derivation paths (`useProgramYearControls` vs
 * `useDefaultProgramYear`) disagree about filtering malformed dates before
 * calling this function — see `useDefaultProgramYear.ts`. Regardless of
 * which caller is at fault, this function must be defensive at the source:
 * it must never emit a program year whose `year` is `NaN`.
 */
describe('getAvailableProgramYears malformed-date robustness (#1353)', () => {
  it('skips empty, non-date, and non-ISO-suffixed entries and yields exactly one program year', () => {
    const dates = ['', 'not-a-date', '2026-07-30T00:00:00Z', '2026-07-30']
    const result = getAvailableProgramYears(dates)

    expect(result).toHaveLength(1)
    expect(result[0]?.year).toBe(2026)
    expect(result[0]?.label).toBe('2026-2027')
  })

  it('never emits a program year whose year is NaN', () => {
    const dates = ['', 'not-a-date', 'garbage', '2026-07-30']
    const result = getAvailableProgramYears(dates)

    expect(result.every(py => !Number.isNaN(py.year))).toBe(true)
  })

  it('returns an empty list when every date is malformed', () => {
    const dates = ['', 'not-a-date', 'garbage']
    const result = getAvailableProgramYears(dates)

    expect(result).toEqual([])
  })

  it('still derives every program year correctly when all dates are well-formed', () => {
    // Behaviour for well-formed input must be unchanged by the guard.
    const dates = ['2024-08-15', '2025-01-15', '2025-09-30', '2026-06-30']
    const result = getAvailableProgramYears(dates)

    expect(result.map(py => py.year)).toEqual([2025, 2024])
  })
})
