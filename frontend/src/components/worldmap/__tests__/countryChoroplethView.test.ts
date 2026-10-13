/**
 * View model for the country choropleth (#1797): ranks, shares, bins and map
 * placement for every published country, plus the Unknown residual stated
 * against the same whole.
 */
import { describe, expect, it } from 'vitest'
import fixture from './fixtures/clubsByCountry-2026-10-11.json'
import { buildChoroplethView, type Placement } from '../countryChoroplethView'

const placement = (id: string): Placement | undefined =>
  ({ '840': 'polygon', '356': 'polygon', '702': 'marker' })[id] as
    Placement | undefined

describe('buildChoroplethView', () => {
  const view = buildChoroplethView(
    [
      { country: 'India', clubs: 1096 },
      { country: 'United States', clubs: 5662 },
      { country: 'Singapore', clubs: 180 },
      { country: 'Atlantis', clubs: 3 },
    ],
    342,
    7283,
    placement
  )

  it('ranks countries by clubs, descending', () => {
    expect(view.rows.map(r => [r.rank, r.name])).toEqual([
      [1, 'United States'],
      [2, 'India'],
      [3, 'Singapore'],
      [4, 'Atlantis'],
    ])
  })

  it('states every share against clubs counted, Unknown included', () => {
    expect(view.rows[0]!.sharePct).toBe(77.7)
    expect(view.unknown).toEqual({ clubs: 342, sharePct: 4.7 })
    expect(view.clubsCounted).toBe(7283)
  })

  it('bins each country and records how the map draws it', () => {
    const us = view.byIsoId.get('840')!
    expect(us.bin).toBe(4)
    expect(us.placement).toBe('polygon')
    expect(view.byIsoId.get('702')!.placement).toBe('marker')
  })

  it('keeps a country the map cannot place in the list, flagged', () => {
    const atlantis = view.rows.find(r => r.name === 'Atlantis')!
    expect(atlantis.isoId).toBeNull()
    expect(atlantis.placement).toBe('none')
    expect(view.notOnMap.map(r => r.name)).toEqual(['Atlantis'])
  })

  it('shares a rank between tied countries (1, 2, 2, 4)', () => {
    const tied = buildChoroplethView(
      [
        { country: 'A', clubs: 9 },
        { country: 'C', clubs: 5 },
        { country: 'B', clubs: 5 },
        { country: 'D', clubs: 1 },
      ],
      0,
      20,
      () => undefined
    )
    expect(tied.rows.map(r => [r.rank, r.name])).toEqual([
      [1, 'A'],
      [2, 'B'],
      [2, 'C'],
      [4, 'D'],
    ])
  })

  it('places all 158 countries of the real rollup', () => {
    const real = buildChoroplethView(
      fixture.clubsByCountry.countries,
      fixture.clubsByCountry.unknown,
      fixture.clubsCounted,
      () => 'polygon'
    )
    expect(real.rows).toHaveLength(158)
    expect(real.notOnMap).toEqual([])
    expect(real.unknown.clubs).toBe(342)
    const total =
      real.rows.reduce((s, r) => s + r.clubs, 0) + real.unknown.clubs
    expect(total).toBe(real.clubsCounted)
  })
})
