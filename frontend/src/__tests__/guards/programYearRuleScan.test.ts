/* Program-year rule-signal scanner (#1400).

   This is the falsifiability half of the rule-change log's drift guard: the
   census in programYearRuleChangeLog.test.ts is only worth having if the
   scanner it stands on actually fires on a NEW year-conditional branch. Those
   cases can't be proven against the repo (the repo is, by construction, always
   in the state the guard passes on), so they're proven here against synthetic
   sources. */

import { describe, it, expect } from 'vitest'
import {
  normaliseProgramYear,
  scanProgramYearSignals,
  programYearsIn,
} from './programYearRuleScan'

describe('normaliseProgramYear', () => {
  it('accepts both written forms of the same year', () => {
    expect(normaliseProgramYear('2026', '2027')).toBe('2026-2027')
    expect(normaliseProgramYear('2026', '27')).toBe('2026-2027')
  })

  it('rejects non-consecutive halves — that is how ISO dates are excluded', () => {
    expect(normaliseProgramYear('2026', '08')).toBeNull()
    expect(normaliseProgramYear('2026', '2029')).toBeNull()
  })
})

describe('scanProgramYearSignals — fires on a new rule branch', () => {
  it('catches a year comparison in a ruleset dispatcher', () => {
    const signals = scanProgramYearSignals(
      [
        'function rulesetForProgramYear(programYear) {',
        '  const startYear = Number.parseInt(programYear.slice(0, 4), 10)',
        '  if (startYear >= 2027) return RULESET_2027',
        '  if (startYear >= 2026) return CURRENT_RULESET',
        '}',
      ].join('\n')
    )
    expect([...programYearsIn(signals)]).toEqual(
      expect.arrayContaining(['2026-2027', '2027-2028'])
    )
  })

  it('catches a rule stated only in a comment', () => {
    const signals = scanProgramYearSignals(
      [
        '// TI retired the officer-training gate for 2027-28.',
        'const gates = BASE_GATES',
      ].join('\n')
    )
    expect(signals).toHaveLength(1)
    expect(signals[0]!.programYears).toEqual(['2027-2028'])
    expect(signals[0]!.line).toBe(1)
  })

  it('reads rule language from the surrounding lines, not only the hit line', () => {
    const signals = scanProgramYearSignals(
      [
        '/**',
        ' * Prerequisites required by each era.',
        ' *',
        ' * 2027-2028: two new gates.',
        ' */',
      ].join('\n')
    )
    expect(signals).toHaveLength(1)
  })
})

describe('scanProgramYearSignals — stays quiet on incidental years', () => {
  it('ignores an ISO date', () => {
    expect(
      scanProgramYearSignals('// Rule changed on 2026-08-01, see the issue.')
    ).toEqual([])
  })

  it('ignores a program year with no rule language nearby', () => {
    expect(
      scanProgramYearSignals(
        [
          '/** @param programYear - the program year (e.g. "2023-2024"). */',
          'const load = programYear => fetch(`/data/${programYear}.json`)',
        ].join('\n')
      )
    ).toEqual([])
  })

  it('ignores a bare number that is not compared against a year', () => {
    expect(scanProgramYearSignals('const clubs = 2026')).toEqual([])
  })
})
