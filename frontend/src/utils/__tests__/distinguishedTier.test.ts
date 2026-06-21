import { describe, it, expect } from 'vitest'
import { distinguishedTierName, normalizeTierCode } from '../distinguishedTier'

/* #795 (epic #821 Sprint 3) — domain helper for rendering the "Club
   Distinguished Status" code (`'' | D | S | P | M`) as a display name.
   Mirrors the private TIER_NAMES map in analytics-core's diffSnapshots so the
   "What Changed" surfaces (table cell + CSV) cannot drift apart (lesson 117). */

describe('distinguishedTierName (#795)', () => {
  it('maps each canonical code to its display name', () => {
    expect(distinguishedTierName('D')).toBe('Distinguished')
    expect(distinguishedTierName('S')).toBe('Select Distinguished')
    expect(distinguishedTierName('P')).toBe("President's Distinguished")
    // M = Smedley Distinguished, the top DCP tier — NOT plain "Distinguished"
    // (#1226). The prior assertion here pinned the mislabeling bug.
    expect(distinguishedTierName('M')).toBe('Smedley Distinguished')
  })

  it('maps the empty code to "None"', () => {
    expect(distinguishedTierName('')).toBe('None')
  })

  it('falls back to "Distinguished" for an unknown non-empty code', () => {
    expect(distinguishedTierName('Z')).toBe('Distinguished')
  })
})

describe('normalizeTierCode (#1229)', () => {
  it('returns null for absent / empty status (no distinguished status)', () => {
    expect(normalizeTierCode(undefined)).toBeNull()
    expect(normalizeTierCode('')).toBeNull()
  })

  it('passes through canonical letter codes', () => {
    expect(normalizeTierCode('D')).toBe('D')
    expect(normalizeTierCode('S')).toBe('S')
    expect(normalizeTierCode('P')).toBe('P')
    expect(normalizeTierCode('M')).toBe('M')
  })

  it('maps historical word forms back to letter codes (incl. Smedley)', () => {
    expect(normalizeTierCode('Distinguished')).toBe('D')
    expect(normalizeTierCode('Select Distinguished')).toBe('S')
    expect(normalizeTierCode("President's Distinguished")).toBe('P')
    expect(normalizeTierCode('Smedley Distinguished')).toBe('M')
  })

  it('is case- and whitespace-insensitive for word forms', () => {
    expect(normalizeTierCode('  smedley distinguished  ')).toBe('M')
  })

  it('returns null for an unrecognised value rather than guessing', () => {
    expect(normalizeTierCode('Mystery')).toBeNull()
  })
})
