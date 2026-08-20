import { describe, it, expect } from 'vitest'
import { distinguishedTierName, normalizeTierCode } from '../distinguishedTier'
/* Imported from analytics-core's SOURCE, not its package root: the root
   barrel does not re-export `classifyDistinguishedTier`, and the package's
   `exports` map has no subpath entry. The shared-table test below is the
   guard that keeps the frontend mirror and the analytics-core original from
   diverging again (#1431). */
import { classifyDistinguishedTier } from '../../../../packages/analytics-core/src/analytics/ClubEligibilityUtils'

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

describe('normalizeTierCode word forms (#1431)', () => {
  it('maps the dashboard word form without an apostrophe to P', () => {
    // TOASTMASTERS_DASHBOARD_KNOWLEDGE.md:521 documents the dashboard's
    // distinguished status word forms — "Presidents Distinguished" has NO
    // apostrophe. The exact-match map only held the apostrophe spelling, so
    // every historical President's-Distinguished year rendered an em-dash.
    expect(normalizeTierCode('Presidents Distinguished')).toBe('P')
  })

  it('still maps the apostrophe spelling to P', () => {
    expect(normalizeTierCode("President's Distinguished")).toBe('P')
  })

  it('accepts a curly apostrophe in the word form', () => {
    expect(normalizeTierCode('President\u2019s Distinguished')).toBe('P')
  })

  it('accepts lowercase letter codes', () => {
    expect(normalizeTierCode('p')).toBe('P')
    expect(normalizeTierCode(' d ')).toBe('D')
  })

  it('degrades an unanticipated distinguished word form to D', () => {
    // Any spelling that says "distinguished" but names no higher tier is at
    // least base Distinguished — matching analytics-core's final `return 'D'`.
    expect(normalizeTierCode('Distinguished Club')).toBe('D')
  })

  it('treats "Not Distinguished" as no tier', () => {
    expect(normalizeTierCode('Not Distinguished')).toBeNull()
  })
})

/* The important one: `distinguishedTier.ts` mirrors analytics-core's
   `classifyDistinguishedTier` because the frontend cannot import it (see the
   import note at the top of this file). This table asserts the two agree on
   every input, so a change to either side that is not made to the other fails
   here instead of silently understating a club's history (#1431). */
const SHARED_TIER_INPUTS: readonly (string | undefined)[] = [
  undefined,
  '',
  '   ',
  'D',
  'S',
  'P',
  'M',
  'd',
  's',
  'p',
  'm',
  ' P ',
  'Distinguished',
  'Select Distinguished',
  "President's Distinguished",
  'President\u2019s Distinguished',
  'Presidents Distinguished',
  'Smedley Distinguished',
  'smedley distinguished',
  '  SELECT DISTINGUISHED  ',
  'Distinguished Club',
  'Not Distinguished',
  'not distinguished',
  'Mystery',
  'Z',
  'President',
]

describe('normalizeTierCode agrees with classifyDistinguishedTier (#1431)', () => {
  it.each(SHARED_TIER_INPUTS.map(input => [JSON.stringify(input), input]))(
    'agrees on %s',
    (_label, input) => {
      expect(normalizeTierCode(input as string | undefined)).toBe(
        classifyDistinguishedTier(input as string | undefined)
      )
    }
  )
})
