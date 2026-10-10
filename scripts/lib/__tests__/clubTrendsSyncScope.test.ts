/**
 * Which club-trends program years a daily run must pull (#1728, plan E2-2).
 *
 * The store is keyed `club-trends/{calculateProgramYear(snapshotDate)}/`, and
 * a daily run writes exactly one district file per district into one PY
 * directory. Pulling the whole store (~865 MB, every PY since 2016) to touch
 * one directory is the waste E2-2 removes.
 *
 * The trap is the July rollover (#1284). TI keeps June's close live under the
 * PRIOR program year into late July, the discovery resolver returns that
 * prior PY, and the closing-period remap writes club-trends for 06-30. A pull
 * keyed on the calendar PY of a July date would miss the file actually
 * written, and the push would replace the accumulated prior-PY file with a
 * one-point one (#1111 class). So the set is built from the resolver's
 * verdict, never the calendar alone, and July always carries the prior PY.
 */

import { describe, it, expect } from 'vitest'
import {
  clubTrendsProgramYears,
  isProgramYear,
} from '../clubTrendsSyncScope.js'

describe('clubTrendsProgramYears (#1728)', () => {
  it('October: pulls only the resolved PY', () => {
    expect(
      clubTrendsProgramYears('2026-2027', ['2026-10-09', '2026-10-09'])
    ).toEqual(['2026-2027'])
  })

  it('July before TI rolls over: resolver says the prior PY; pulls prior AND calendar PY', () => {
    // raw date 07-14, closing-period remap to 06-30 (#309)
    expect(
      clubTrendsProgramYears('2025-2026', ['2026-07-14', '2026-06-30'])
    ).toEqual(['2025-2026', '2026-2027'])
  })

  it('July before rollover even if the snapshot date was not remapped', () => {
    expect(clubTrendsProgramYears('2025-2026', ['2026-07-14'])).toEqual([
      '2025-2026',
      '2026-2027',
    ])
  })

  it('July after TI rolls over: resolver says the new PY; still carries the prior PY', () => {
    expect(clubTrendsProgramYears('2026-2027', ['2026-07-28'])).toEqual([
      '2025-2026',
      '2026-2027',
    ])
  })

  it('a resolver verdict that disagrees with the calendar outside July is still pulled', () => {
    // A rollover that lags into August: the resolver is the authority.
    expect(clubTrendsProgramYears('2025-2026', ['2026-08-02'])).toEqual([
      '2025-2026',
      '2026-2027',
    ])
  })

  it('June: only the one PY', () => {
    expect(
      clubTrendsProgramYears('2025-2026', ['2026-06-15', '2026-06-15'])
    ).toEqual(['2025-2026'])
  })

  for (const verdict of [undefined, '', 'unknown', 'null', '2025-2027', 'x']) {
    it(`no usable resolver verdict (${String(verdict)}): pull the whole store`, () => {
      expect(clubTrendsProgramYears(verdict, ['2026-10-09'])).toBeNull()
    })
  }

  it('rejects a malformed date rather than guessing a PY', () => {
    expect(() => clubTrendsProgramYears('2026-2027', ['10/09/2026'])).toThrow()
  })

  it('ignores empty date entries (an unset step output)', () => {
    expect(clubTrendsProgramYears('2026-2027', ['2026-10-09', ''])).toEqual([
      '2026-2027',
    ])
  })
})

describe('isProgramYear', () => {
  it('accepts consecutive YYYY-YYYY only', () => {
    expect(isProgramYear('2026-2027')).toBe(true)
    expect(isProgramYear('2026-2028')).toBe(false)
    expect(isProgramYear('2026')).toBe(false)
    expect(isProgramYear('../2026-2027')).toBe(false)
  })
})
