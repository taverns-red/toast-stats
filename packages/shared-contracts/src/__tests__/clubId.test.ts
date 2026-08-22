/**
 * Canonical club identity (#1440).
 *
 * Club numbers reach us in more than one lexical form — zero-padded
 * `00009905` from one TI export, bare `9905` from another, and occasionally
 * with CSV import debris (a leading apostrophe, stray whitespace). Before
 * #1440 three conventions coexisted across eight call sites with no shared
 * definition, and every mismatch degraded to an empty state rather than an
 * error (the Lesson 47 silent-lookup signature).
 *
 * These tests pin the ONE canonical form the whole monorepo uses.
 */

import { describe, it, expect } from 'vitest'
import {
  normalizeClubId,
  clubIdsMatch,
  findClubEntry,
} from '../identity/clubId.js'

describe('normalizeClubId', () => {
  it('strips leading zeros', () => {
    expect(normalizeClubId('00009905')).toBe('9905')
    expect(normalizeClubId('01234')).toBe('1234')
  })

  it('leaves an already-bare id unchanged', () => {
    expect(normalizeClubId('9905')).toBe('9905')
  })

  it('strips only LEADING zeros', () => {
    expect(normalizeClubId('0100')).toBe('100')
  })

  it('is idempotent', () => {
    expect(normalizeClubId(normalizeClubId('00000180'))).toBe('180')
  })

  it('collapses an all-zeros id to a single canonical zero, never empty', () => {
    // Requirement 2.4 of the original transformer helper was "never produce
    // an empty string". A single canonical '0' honours that AND keeps the
    // padded/bare round-trip invariant, which preserving '0000' would break.
    expect(normalizeClubId('0000')).toBe('0')
    expect(normalizeClubId('0')).toBe('0')
  })

  it('accepts a number', () => {
    expect(normalizeClubId(180)).toBe('180')
  })

  it('tolerates CSV import debris around the digits', () => {
    expect(normalizeClubId("'180")).toBe('180')
    expect(normalizeClubId('  00000180  ')).toBe('180')
    expect(normalizeClubId('Club 180')).toBe('180')
  })

  it('returns empty string for nullish or blank input', () => {
    expect(normalizeClubId(null)).toBe('')
    expect(normalizeClubId(undefined)).toBe('')
    expect(normalizeClubId('')).toBe('')
    expect(normalizeClubId('   ')).toBe('')
  })

  it('preserves a digit-free id rather than collapsing it', () => {
    // Two distinct non-numeric ids must not normalize onto the same key.
    expect(normalizeClubId('abc')).toBe('abc')
    expect(normalizeClubId('  abc  ')).toBe('abc')
    expect(normalizeClubId('abc')).not.toBe(normalizeClubId('xyz'))
  })

  it('normalizes a padded and a bare form of the same club to one key', () => {
    expect(normalizeClubId('00009905')).toBe(normalizeClubId('9905'))
  })
})

describe('clubIdsMatch', () => {
  it('matches in BOTH directions across padding', () => {
    // stored bare, looked up padded
    expect(clubIdsMatch('9905', '00009905')).toBe(true)
    // stored padded, looked up bare — the direction ClubDetailPage:263 missed
    expect(clubIdsMatch('00009905', '9905')).toBe(true)
  })

  it('matches identical forms', () => {
    expect(clubIdsMatch('9905', '9905')).toBe(true)
    expect(clubIdsMatch('00009905', '00009905')).toBe(true)
  })

  it('does not match different clubs', () => {
    expect(clubIdsMatch('9905', '9906')).toBe(false)
    expect(clubIdsMatch('00009905', '0000990')).toBe(false)
  })

  it('never matches on an empty/absent id', () => {
    expect(clubIdsMatch('', '')).toBe(false)
    expect(clubIdsMatch(null, undefined)).toBe(false)
    expect(clubIdsMatch('9905', '')).toBe(false)
  })
})

describe('findClubEntry', () => {
  const bareKeyed = { '9905': { districtId: '7' } }
  const paddedKeyed = { '00009905': { districtId: '7' } }

  it('finds a bare-keyed entry from a padded id', () => {
    expect(findClubEntry(bareKeyed, '00009905')).toEqual({ districtId: '7' })
  })

  it('finds a padded-keyed entry from a bare id', () => {
    expect(findClubEntry(paddedKeyed, '9905')).toEqual({ districtId: '7' })
  })

  it('finds an exactly-keyed entry', () => {
    expect(findClubEntry(bareKeyed, '9905')).toEqual({ districtId: '7' })
    expect(findClubEntry(paddedKeyed, '00009905')).toEqual({ districtId: '7' })
  })

  it('returns undefined for an unknown club', () => {
    expect(findClubEntry(bareKeyed, '1234')).toBeUndefined()
  })

  it('returns undefined for a missing map or blank id', () => {
    expect(findClubEntry(undefined, '9905')).toBeUndefined()
    expect(findClubEntry(null, '9905')).toBeUndefined()
    expect(findClubEntry(bareKeyed, '')).toBeUndefined()
  })

  it('never resolves an Object.prototype member to a phantom hit (#1112)', () => {
    expect(findClubEntry(bareKeyed, 'constructor')).toBeUndefined()
    expect(findClubEntry(bareKeyed, '__proto__')).toBeUndefined()
    expect(findClubEntry(bareKeyed, 'toString')).toBeUndefined()
  })
})
