/**
 * Success Plan targets link grammar (#2297).
 *
 * `?targets=` is URL-seedable, so every token is whitelisted on decode
 * (Lessons 124/144, same posture as the realignment `?plan=` grammar).
 */
import { describe, it, expect } from 'vitest'
import {
  TARGETS_PARAM,
  decodeTargets,
  encodeTargets,
  goalsForProgramYear,
  parseTargetInput,
} from '../successPlanTargets'

describe('successPlanTargets grammar (#2297)', () => {
  it('uses its own param, not the realignment plan param', () => {
    expect(TARGETS_PARAM).toBe('targets')
  })

  it('encodes key-value groups joined by "_", sorted by key', () => {
    expect(
      encodeTargets({
        programYear: 2026,
        goals: { payments: 4500, paidClubs: 105, distinguishedClubs: 60 },
      })
    ).toBe('c-105_d-60_p-4500_py-2026')
  })

  it('gives the same link whatever order the goals were set in', () => {
    const a = encodeTargets({
      programYear: 2026,
      goals: { distinguishedClubs: 60, payments: 4500 },
    })
    const b = encodeTargets({
      programYear: 2026,
      goals: { payments: 4500, distinguishedClubs: 60 },
    })
    expect(a).toBe(b)
    expect(a).toBe('d-60_p-4500_py-2026')
  })

  it('encodes an empty plan as the empty string', () => {
    expect(encodeTargets({ programYear: 2026, goals: {} })).toBe('')
  })

  it('round-trips', () => {
    const t = {
      programYear: 2025,
      goals: { payments: 3200, paidClubs: 98, distinguishedClubs: 41 },
    }
    expect(decodeTargets(encodeTargets(t))).toEqual(t)
  })

  it('decodes a partial plan (only the goals that were set)', () => {
    expect(decodeTargets('p-4500_py-2026')).toEqual({
      programYear: 2026,
      goals: { payments: 4500 },
    })
  })

  describe('ignores garbled input safely', () => {
    it.each([
      [null],
      [''],
      ['garbage'],
      ['p-4500'], // no program year: cannot be bound to a year
      ['py-2026'], // a year but no goal
      ['py-26_p-4500'], // malformed year
      ['py-1999_p-4500'], // out-of-range year
      ['p-abc_py-2026'],
      ['p--4500_py-2026'],
      ['p-0_py-2026'], // zero is not a target
      ['p-04500_py-2026'], // leading zero: not canonical
      ['p-1234567_py-2026'], // too many digits
      ['p-12.5_py-2026'],
      ['p-1e4_py-2026'],
      ['p-<script>_py-2026'],
      ['x-10_py-2026'], // unknown key only
      ['p-10-20_py-2026'],
    ])('%j → null', raw => {
      expect(decodeTargets(raw)).toBeNull()
    })

    it('drops a bad group but keeps the good ones', () => {
      expect(decodeTargets('c-abc_d-60_x-9_py-2026')).toEqual({
        programYear: 2026,
        goals: { distinguishedClubs: 60 },
      })
    })

    it('rejects an absurdly long value outright', () => {
      expect(decodeTargets(`p-4500_py-2026_${'x'.repeat(500)}`)).toBeNull()
    })
  })

  describe('program-year binding', () => {
    const t = { programYear: 2026, goals: { payments: 4500 } }

    it('returns the goals for the year they were set for', () => {
      expect(goalsForProgramYear(t, 2026)).toEqual({ payments: 4500 })
    })

    it('returns null for any other year, so an old link never overlays', () => {
      expect(goalsForProgramYear(t, 2025)).toBeNull()
    })

    it('returns null without targets', () => {
      expect(goalsForProgramYear(null, 2026)).toBeNull()
    })
  })

  describe('parseTargetInput', () => {
    it.each([
      ['4500', 4500],
      [' 4500 ', 4500],
      ['4,500', 4500],
      ['1', 1],
      ['999999', 999999],
    ])('%j → %j', (input, expected) => {
      expect(parseTargetInput(input)).toBe(expected)
    })

    it.each([[''], ['0'], ['-5'], ['abc'], ['12.5'], ['1000000'], ['1e3']])(
      '%j → undefined',
      input => {
        expect(parseTargetInput(input)).toBeUndefined()
      }
    )
  })
})
