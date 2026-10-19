/**
 * Pin colour-mode registry (#1784; spec docs/design/map-pin-colour-modes.md).
 *
 * One registry per mode: id, source field, categories (fill + shape + label)
 * and the facet key its legend chips write. The legend counts every club in
 * scope, mapped or not (§4.3), and the `?color=` value is whitelisted at the
 * parse (§9, Lessons 124/144).
 */
import { describe, expect, it } from 'vitest'
import type { ClubTrend } from '../../../hooks/useDistrictAnalytics'
import {
  CATEGORICAL8,
  MAP_COLOR_MODES,
  applyFacets,
  buildModeModel as baseModel,
  isTerritoryMode,
  legendChips,
  parseMapColorMode,
  toggleFacetValue,
  type ExtendedMode,
  type MapColorMode,
} from '../pinModes'
import { assignTerritoryColours, territoryModel } from '../pinTerritory'

// Health/tier come from pinModes; division/area from the on-demand module.
const buildModeModel = (
  mode: Exclude<MapColorMode, ExtendedMode | 'district' | 'locator'>,
  clubs: readonly ClubTrend[]
) => (isTerritoryMode(mode) ? territoryModel(mode, clubs) : baseModel(mode))

const club = (o: Partial<ClubTrend>): ClubTrend =>
  ({
    clubId: '1',
    clubName: 'Club',
    divisionId: 'A',
    divisionName: 'Division A',
    areaId: '01',
    areaName: 'Area 01',
    membershipTrend: [],
    dcpGoalsTrend: [],
    currentStatus: 'thriving',
    riskFactors: [],
    distinguishedLevel: 'NotDistinguished',
    coordinates: { lat: 45, lng: -75 },
    ...o,
  }) as ClubTrend

describe('parseMapColorMode', () => {
  it('defaults to club health and whitelists every offered mode', () => {
    expect(parseMapColorMode(null)).toBe('health')
    expect(parseMapColorMode('tier')).toBe('tier')
    expect(parseMapColorMode('division')).toBe('division')
    expect(parseMapColorMode('area')).toBe('area')
    // #1787: the extended modes are offered now.
    for (const m of ['status', 'size', 'growth', 'dcp', 'age', 'day'])
      expect(parseMapColorMode(m)).toBe(m)
    // Unknown, and modes this level does not offer (region on a district
    // map), fall back.
    expect(parseMapColorMode('region')).toBe('health')
    expect(parseMapColorMode('<script>')).toBe('health')
  })

  it('lists health first and Distinguished level second (one tap away)', () => {
    expect(MAP_COLOR_MODES.map(m => m.id)).toEqual([
      'health',
      'tier',
      'status',
      'coach',
      'size',
      'growth',
      'dcp',
      'age',
      'awards',
      'renew-oct',
      'renew-apr',
      'csp',
      'officers',
      'day',
      'attendance',
      'division',
      'area',
    ])
  })
})

describe('health mode', () => {
  it('maps each status to the spec fill and a distinct status shape', () => {
    const model = buildModeModel('health', [])
    const by = (c: ClubTrend) => model.categoryOf(c)
    expect(by(club({ currentStatus: 'thriving' }))).toMatchObject({
      label: 'Thriving',
      fill: '#2A8F6E',
      shape: 'circle',
    })
    expect(by(club({ currentStatus: 'vulnerable' }))).toMatchObject({
      label: 'Vulnerable',
      fill: '#E0A030',
      shape: 'triangle',
    })
    expect(by(club({ currentStatus: 'intervention-required' }))).toMatchObject({
      label: 'Intervention required',
      fill: '#C93D3D',
      shape: 'square',
    })
  })

  it('draws a suspended club as the suspended override', () => {
    const model = buildModeModel('health', [])
    expect(model.categoryOf(club({ clubStatus: 'Suspended' })).shape).toBe(
      'suspended'
    )
  })

  it('treats a renewal-overlaid club as not suspended (reads the overlay)', () => {
    const model = buildModeModel('health', [])
    const overlaid = club({
      clubStatus: 'Suspended',
      currentStatus: 'vulnerable',
      statusOverlay: {
        status: 'Active',
        source: 'dues-renewal',
        activeSince: '2026-10-01',
        asOf: 'October 10, 2026',
      },
    })
    expect(model.categoryOf(overlaid).label).toBe('Vulnerable')
  })

  it('writes the Clubs-table status aliases', () => {
    const model = buildModeModel('health', [])
    expect(model.facet?.param).toBe('status')
    const int = model.categories.find(c => c.key === 'intervention-required')!
    expect(model.facet?.valueOf(int)).toBe('intervention')
  })
})

describe('tier mode', () => {
  it('is an ordinal fill-level ramp with light-blue Distinguished', () => {
    const model = buildModeModel('tier', [])
    const cats = Object.fromEntries(model.categories.map(c => [c.key, c]))
    expect(cats['Distinguished']).toMatchObject({
      fill: '#7FB8D9',
      shape: 'fill25',
    })
    expect(cats['NotDistinguished']).toMatchObject({ shape: 'fill0' })
    expect(cats['Select']).toMatchObject({ fill: '#2C6E90', shape: 'fill50' })
    expect(cats['President']).toMatchObject({
      fill: '#004165',
      shape: 'fill75',
    })
    expect(cats['Smedley']).toMatchObject({
      fill: '#7B1828',
      shape: 'fill100',
    })
  })

  it('marks a provisional Distinguished club dashed', () => {
    const model = buildModeModel('tier', [])
    const cat = model.categoryOf(
      club({
        distinguishedLevel: 'Distinguished',
        isProvisionallyDistinguished: true,
      })
    )
    expect(cat.key).toBe('Distinguished')
    expect(model.isDashed(club({ isProvisionallyDistinguished: true }))).toBe(
      true
    )
    expect(model.isDashed(club({}))).toBe(false)
  })
})

describe('territory modes', () => {
  const clubs = [
    club({ clubId: '1', divisionId: 'A', divisionName: 'Division A' }),
    club({
      clubId: '2',
      divisionId: 'B',
      divisionName: 'Division B',
      areaId: '12',
      areaName: 'Area 12',
    }),
  ]

  it('gives a division its code label and a categorical8 fill', () => {
    const model = buildModeModel('division', clubs)
    const a = model.categoryOf(clubs[0]!)
    expect(a.code).toBe('A')
    expect(a.label).toBe('Division A')
    expect(CATEGORICAL8).toContain(a.fill)
    expect(model.facet?.param).toBe('divisions')
    expect(model.facet?.valueOf(a)).toBe('Division A')
  })

  it('codes an area with its division letter', () => {
    const model = buildModeModel('area', clubs)
    const b = model.categoryOf(clubs[1]!)
    expect(b.code).toBe('B12')
    expect(model.facet?.param).toBe('areas')
    expect(model.facet?.valueOf(b)).toBe('Area 12')
  })
})

describe('assignTerritoryColours', () => {
  it('never gives neighbouring territories the same hue, deterministically', () => {
    // Nine territories in a 3x3 lattice of club pairs: each touches up to 8.
    const clubs: ClubTrend[] = []
    let id = 0
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        const t = `T${r}${c}`
        for (let k = 0; k < 2; k++)
          clubs.push(
            club({
              clubId: String(id++),
              areaId: t,
              areaName: t,
              coordinates: { lat: 45 + r * 0.1 + k * 0.01, lng: -75 + c * 0.1 },
            })
          )
      }
    const key = (c: ClubTrend) => c.areaId
    const colours = assignTerritoryColours(clubs, key)
    const again = assignTerritoryColours([...clubs].reverse(), key)
    expect(colours).toEqual(again)
    // Orthogonal lattice neighbours must differ.
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        const here = colours.get(`T${r}${c}`)
        if (c < 2) expect(here).not.toBe(colours.get(`T${r}${c + 1}`))
        if (r < 2) expect(here).not.toBe(colours.get(`T${r + 1}${c}`))
      }
  })

  it('still colours a territory none of whose clubs has coordinates', () => {
    const colours = assignTerritoryColours(
      [club({ areaId: 'X', coordinates: undefined })],
      c => c.areaId
    )
    expect(CATEGORICAL8).toContain(colours.get('X'))
  })
})

describe('legendChips', () => {
  const clubs = [
    club({ clubId: '1', currentStatus: 'thriving' }),
    club({ clubId: '2', currentStatus: 'intervention-required' }),
    club({
      clubId: '3',
      currentStatus: 'intervention-required',
      coordinates: undefined,
    }),
  ]

  it('counts every club in scope, mapped or not, and hides zero status chips', () => {
    const chips = legendChips(buildModeModel('health', clubs), clubs)
    expect(chips.map(c => [c.label, c.count])).toEqual([
      ['Thriving', 1],
      ['Intervention required', 2],
    ])
  })

  it('shows every ordinal step, including zero counts', () => {
    const chips = legendChips(buildModeModel('tier', clubs), clubs)
    expect(chips.map(c => c.key)).toEqual([
      'Smedley',
      'President',
      'Select',
      'Distinguished',
      'NotDistinguished',
    ])
    expect(chips.find(c => c.key === 'NotDistinguished')?.count).toBe(3)
  })

  it('orders categorical chips by club count', () => {
    const terr = [
      club({ clubId: '1', divisionId: 'A', divisionName: 'Division A' }),
      club({ clubId: '2', divisionId: 'B', divisionName: 'Division B' }),
      club({ clubId: '3', divisionId: 'B', divisionName: 'Division B' }),
    ]
    const chips = legendChips(buildModeModel('division', terr), terr)
    expect(chips.map(c => c.label)).toEqual(['Division B', 'Division A'])
  })
})

describe('facets (URL filters that compose with the colour mode)', () => {
  const clubs = [
    club({
      clubId: '1',
      currentStatus: 'thriving',
      divisionName: 'Division A',
    }),
    club({
      clubId: '2',
      currentStatus: 'vulnerable',
      divisionName: 'Division B',
    }),
    club({
      clubId: '3',
      currentStatus: 'intervention-required',
      divisionName: 'Division B',
    }),
  ]

  it('applies ?status= with the table aliases and ?divisions= together', () => {
    const p = new URLSearchParams(
      'status=vulnerable,intervention&divisions=Division B'
    )
    expect(applyFacets(clubs, p).map(c => c.clubId)).toEqual(['2', '3'])
    const q = new URLSearchParams('status=thriving&divisions=Division B')
    expect(applyFacets(clubs, q)).toEqual([])
  })

  it('ignores an unknown status alias rather than hiding everything', () => {
    const p = new URLSearchParams('status=bogus')
    expect(applyFacets(clubs, p)).toHaveLength(3)
  })

  it('toggles one value in one write and keeps every other param', () => {
    const p = new URLSearchParams('color=tier&status=thriving&date=2026-10-11')
    const on = toggleFacetValue(p, 'status', 'intervention')
    expect(on.get('status')).toBe('thriving,intervention')
    expect(on.get('color')).toBe('tier')
    expect(on.get('date')).toBe('2026-10-11')
    const off = toggleFacetValue(on, 'status', 'thriving')
    expect(off.get('status')).toBe('intervention')
    const empty = toggleFacetValue(off, 'status', 'intervention')
    expect(empty.has('status')).toBe(false)
  })
})
