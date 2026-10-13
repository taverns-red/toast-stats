/**
 * Toastmasters country names → ISO 3166-1 numeric codes (#1797).
 *
 * `global-totals.json` publishes Find-A-Club's own country spellings
 * ("Korea (Republic of)", "Tanzania-United Republic", "St Vincent And
 * Grenadines"), not codes. The fixture is the real 2026-10-11 file (158
 * countries), so a spelling the map cannot place fails here, not on the map.
 */
import { describe, expect, it } from 'vitest'
import fixture from './fixtures/clubsByCountry-2026-10-11.json'
import world from '../../../assets/geo/world-countries.json'
import { isoIdForCountry } from '../countryCodes'

const names = fixture.clubsByCountry.countries.map(c => c.country)

describe('isoIdForCountry', () => {
  it('resolves every country in the real 2026-10-11 rollup', () => {
    expect(names).toHaveLength(158)
    const unresolved = names.filter(n => isoIdForCountry(n) === null)
    expect(unresolved).toEqual([])
  })

  it('never maps two published names to the same country', () => {
    const ids = names.map(n => isoIdForCountry(n))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('places every resolved country on the map, as a shape or a dot', () => {
    const placed = new Set([
      ...world.countries.map(c => c.id),
      ...world.markers.map(m => m.id),
    ])
    const unplaced = names.filter(n => !placed.has(isoIdForCountry(n)!))
    expect(unplaced).toEqual([])
  })

  it.each([
    ['United States', '840'],
    ['India', '356'],
    ["Cote d'Ivoire", '384'],
    ['Korea (Republic of)', '410'],
    ['Viet Nam', '704'],
    ['Russian Federation', '643'],
    ['Tanzania-United Republic', '834'],
    ['Slovakia (Slovak Republic)', '703'],
    ['Saint Lucia, West Indies', '662'],
    ['Lao People Demo Republic', '418'],
    ['French Guiana', '254'],
    ['Hong Kong', '344'],
  ])('%s → %s', (name, id) => {
    expect(isoIdForCountry(name)).toBe(id)
  })

  it('ignores case, accents and punctuation in the spelling', () => {
    expect(isoIdForCountry('trinidad and tobago')).toBe('780')
    expect(isoIdForCountry('Côte d’Ivoire')).toBe('384')
    expect(isoIdForCountry('  Bosnia & Herzegovina ')).toBe('070')
  })

  it('returns null for a name it does not know', () => {
    expect(isoIdForCountry('Atlantis')).toBeNull()
    expect(isoIdForCountry('')).toBeNull()
  })
})
