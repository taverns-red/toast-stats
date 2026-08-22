/**
 * Canonical club-id comparison (#1437, groundwork for the #1440 sweep).
 *
 * Toastmasters emits club numbers in two lexical forms — zero-padded
 * (`00009905`) and bare (`9905`) — and `DataTransformer.test.ts:772-780` pins
 * the case where BOTH arrive inside a single snapshot. Nothing in the pipeline
 * enforces form stability across program years, so every strict `===` between
 * a URL param and a stored id is a silent miss waiting to happen.
 */

import { describe, it, expect } from 'vitest'
import { normalizeClubId, clubIdsMatch } from '../naming/clubId.js'

describe('normalizeClubId (#1437)', () => {
  it('strips leading zeros to the canonical bare form', () => {
    expect(normalizeClubId('00009905')).toBe('9905')
    expect(normalizeClubId('9905')).toBe('9905')
    expect(normalizeClubId('00002274')).toBe('2274')
  })

  it('preserves an all-zeros id rather than returning an empty string', () => {
    expect(normalizeClubId('0000')).toBe('0000')
    expect(normalizeClubId('0')).toBe('0')
  })

  it('tolerates surrounding whitespace from a CSV cell', () => {
    expect(normalizeClubId(' 00009905 ')).toBe('9905')
  })

  it('leaves a non-numeric id alone apart from padding', () => {
    expect(normalizeClubId('00A12')).toBe('A12')
    expect(normalizeClubId('')).toBe('')
  })
})

describe('clubIdsMatch (#1437)', () => {
  it('matches across padding in BOTH directions', () => {
    expect(clubIdsMatch('00009905', '9905')).toBe(true)
    expect(clubIdsMatch('9905', '00009905')).toBe(true)
    expect(clubIdsMatch('00009905', '00009905')).toBe(true)
    expect(clubIdsMatch('9905', '9905')).toBe(true)
  })

  it('does not conflate different clubs', () => {
    expect(clubIdsMatch('00009905', '9906')).toBe(false)
    expect(clubIdsMatch('9905', '99050')).toBe(false)
  })

  it('is false when either side is missing', () => {
    expect(clubIdsMatch(null, '9905')).toBe(false)
    expect(clubIdsMatch('9905', undefined)).toBe(false)
    expect(clubIdsMatch(undefined, null)).toBe(false)
    expect(clubIdsMatch('', '')).toBe(false)
  })
})
