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
import { spawnSync } from 'node:child_process'
import * as path from 'node:path'
import {
  clubTrendsProgramYears,
  clubTrendsProgramYearsForDates,
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

// #2102: a rebuild pulled the whole store (1,402 objects, 1.07 GiB) to
// re-derive a few dates. A historical run has no discovery verdict, but it
// knows the dates it computes, and the writer keys on their PY. The transform
// can remap a date to the PREVIOUS month-end (a closing raw, #193/#309); that
// only crosses a PY boundary from July to 06-30, which the July rule covers.
describe('clubTrendsProgramYearsForDates (#2102)', () => {
  it('a rebuild inside one PY pulls only that PY', () => {
    expect(
      clubTrendsProgramYearsForDates(['2018-03-31', '2018-04-30', '2017-08-31'])
    ).toEqual(['2017-2018'])
  })

  it('a July date also pulls the prior PY (a July raw can remap to 06-30)', () => {
    expect(clubTrendsProgramYearsForDates(['2017-07-31'])).toEqual([
      '2016-2017',
      '2017-2018',
    ])
  })

  it('06-30 is the PY that ends there', () => {
    expect(clubTrendsProgramYearsForDates(['2017-06-30'])).toEqual([
      '2016-2017',
    ])
  })

  it('dates across PYs pull each PY once, sorted', () => {
    expect(
      clubTrendsProgramYearsForDates([
        '2019-01-31',
        '2017-01-31',
        '2017-02-28',
        '2019-02-28',
      ])
    ).toEqual(['2016-2017', '2018-2019'])
  })

  it('no dates (rebuild of every raw date): the whole store', () => {
    expect(clubTrendsProgramYearsForDates([])).toBeNull()
    expect(clubTrendsProgramYearsForDates(['', ''])).toBeNull()
  })

  it('rejects a malformed date rather than guessing a PY', () => {
    expect(() => clubTrendsProgramYearsForDates(['2018-3-31'])).toThrow()
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

describe('scripts/club-trends-sync-scope.ts runner', () => {
  const TSX = path.resolve(process.cwd(), 'node_modules/.bin/tsx')
  const RUNNER = path.resolve(
    process.cwd(),
    'scripts/club-trends-sync-scope.ts'
  )
  const run = (args: string[]) =>
    spawnSync(TSX, [RUNNER, ...args], { encoding: 'utf-8' })

  it('prints the July set space-separated for sync-stores.sh', () => {
    const r = run([
      '--program-year',
      '2025-2026',
      '--date',
      '2026-07-14',
      '--date',
      '2026-06-30',
    ])
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toBe('2025-2026 2026-2027\n')
  })

  it('prints "all" when discovery was skipped (manual districts)', () => {
    const r = run(['--program-year', 'unknown', '--date', '2026-10-09'])
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toBe('all\n')
  })

  it("--dates without --program-year: the PYs of a rebuild's dates (#2102)", () => {
    const r = run(['--dates', '2017-07-31, 2018-01-31,2018-02-28'])
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toBe('2016-2017 2017-2018\n')
  })

  it('--dates "" (a rebuild of every raw date) prints "all"', () => {
    const r = run(['--dates', ''])
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toBe('all\n')
  })

  it('--dates with a malformed date exits 2, printing nothing', () => {
    const r = run(['--dates', '2018-01-31,Jan 31'])
    expect(r.status).toBe(2)
    expect(r.stdout).toBe('')
  })

  it('exits 2 on a malformed date', () => {
    const r = run(['--program-year', '2026-2027', '--date', 'yesterday'])
    expect(r.status).toBe(2)
    expect(r.stdout).toBe('')
  })
})
