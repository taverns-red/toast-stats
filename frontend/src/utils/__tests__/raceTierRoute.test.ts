import { describe, it, expect } from 'vitest'
import {
  RACE_TIER_ROUTES,
  raceTierFromSlug,
  raceTierSlug,
  raceTierTitle,
} from '../raceTierRoute'

/**
 * #1556 — `/clubs/race/:tier` is a REAL route per tier (ADR-005, no
 * client-side tabs). The slug set is closed: anything else resolves to null
 * and the page throws the branded 404 rather than rendering an empty race.
 */
describe('raceTierRoute (#1556)', () => {
  it('maps the four slugs to the four store tiers, lowest first', () => {
    expect(RACE_TIER_ROUTES.map(r => r.slug)).toEqual([
      'distinguished',
      'select',
      'presidents',
      'smedley',
    ])
    expect(raceTierFromSlug('distinguished')).toBe('Distinguished')
    expect(raceTierFromSlug('select')).toBe('Select')
    expect(raceTierFromSlug('presidents')).toBe('President')
    expect(raceTierFromSlug('smedley')).toBe('Smedley')
  })

  it('resolves nothing for an unknown, empty or differently-cased slug', () => {
    expect(raceTierFromSlug('foo')).toBeNull()
    expect(raceTierFromSlug('')).toBeNull()
    expect(raceTierFromSlug(undefined)).toBeNull()
    expect(raceTierFromSlug('Distinguished')).toBeNull()
  })

  it('round-trips tier → slug → tier', () => {
    for (const { tier } of RACE_TIER_ROUTES) {
      expect(raceTierFromSlug(raceTierSlug(tier))).toBe(tier)
    }
  })

  it('uses the real tier names plainly (ruling R-B)', () => {
    expect(raceTierTitle('Distinguished')).toBe('Distinguished')
    expect(raceTierTitle('Select')).toBe('Select Distinguished')
    expect(raceTierTitle('President')).toBe("President's Distinguished")
    expect(raceTierTitle('Smedley')).toBe('Smedley Distinguished')
  })
})
