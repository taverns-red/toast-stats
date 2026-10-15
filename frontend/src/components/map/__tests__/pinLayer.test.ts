/**
 * Club pin layer (#1784): one clustered GeoJSON source, symbol layers whose
 * icons are drawn on demand from their id (no glyphs or sprite — ADR-016
 * forbids third-party requests, so even cluster counts are drawn as images).
 *
 * The expressions are checked with MapLibre's own style-spec validator and
 * evaluator, not a hand-written shape (Lesson from #1726: never mock an SDK
 * shape you haven't observed).
 */
import { describe, expect, it } from 'vitest'
import {
  expression,
  latest,
  validateStyleMin,
  type StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec'
import type { ClubTrend } from '../../../hooks/useDistrictAnalytics'
import {
  buildModeModel as baseModel,
  isTerritoryMode,
  type ExtendedMode,
  type MapColorMode,
} from '../pinModes'
import { territoryModel } from '../pinTerritory'
import {
  PIN_SOURCE_ID,
  buildPinFeatures,
  clubPinLayers,
  clusterProperties,
  parseIconId,
  pinSourceSpec,
} from '../pinLayer'

// Health/tier come from pinModes; division/area from the on-demand module.
const buildModeModel = (
  mode: Exclude<MapColorMode, ExtendedMode>,
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
    coordinates: { lat: 45.1, lng: -75.2 },
    ...o,
  }) as ClubTrend

const CLUBS = [
  club({ clubId: '1', currentStatus: 'thriving' }),
  club({ clubId: '2', currentStatus: 'intervention-required' }),
  club({ clubId: '3', currentStatus: 'vulnerable', coordinates: undefined }),
]

describe('buildPinFeatures', () => {
  it('emits one point per mapped club, [lng, lat], with its category', () => {
    const model = buildModeModel('health', CLUBS)
    const fc = buildPinFeatures(CLUBS, model)
    expect(fc.features).toHaveLength(2)
    const f = fc.features[1]!
    expect(f.geometry.coordinates).toEqual([-75.2, 45.1])
    expect(f.properties).toMatchObject({
      id: '2',
      s: 'square',
      f: '#C93D3D',
      k: model.categories.findIndex(c => c.key === 'intervention-required'),
    })
  })

  it('carries the code label in territory modes', () => {
    const model = buildModeModel('area', CLUBS)
    const fc = buildPinFeatures(CLUBS, model)
    expect(fc.features[0]!.properties.c).toBe('A01')
  })
})

function styleWith(mode: Exclude<MapColorMode, ExtendedMode>) {
  const model = buildModeModel(mode, CLUBS)
  return {
    model,
    style: {
      version: 8,
      sources: {
        [PIN_SOURCE_ID]: pinSourceSpec(buildPinFeatures(CLUBS, model), model),
      },
      layers: clubPinLayers(model, 'light'),
    } as StyleSpecification,
  }
}

describe('clubPinLayers', () => {
  for (const mode of ['health', 'tier', 'division', 'area'] as const) {
    it(`is a valid MapLibre style in ${mode} mode`, () => {
      const { style } = styleWith(mode)
      expect(validateStyleMin(style)).toEqual([])
    })
  }

  it('always draws pins but keeps basemap labels out from under them (#2081)', () => {
    const { style } = styleWith('health')
    for (const layer of style.layers) {
      const layout = (layer as { layout?: Record<string, unknown> }).layout
      // Pins never hide each other or vanish for a label...
      expect(layout?.['icon-allow-overlap']).toBe(true)
      // ...and their boxes enter the collision index, so a label placed
      // after them (every basemap label sits below) moves or hides.
      expect(layout?.['icon-ignore-placement']).toBe(false)
    }
  })

  it('clusters with a 44 px radius and shows single pins from z14', () => {
    const { model } = styleWith('health')
    const src = pinSourceSpec(buildPinFeatures(CLUBS, model), model)
    expect(src).toMatchObject({
      type: 'geojson',
      cluster: true,
      clusterRadius: 44,
      clusterMaxZoom: 13,
    })
  })
})

/** Evaluate a layer's icon-image for a feature, as MapLibre would. */
function iconFor(
  mode: Exclude<MapColorMode, ExtendedMode>,
  layerId: string,
  properties: Record<string, unknown>,
  zoom = 8
): string {
  const { style } = styleWith(mode)
  const layer = style.layers.find(l => l.id === layerId) as {
    layout: Record<string, unknown>
  }
  const parsed = expression.createExpression(
    layer.layout['icon-image'],
    'icon-image',
    latest.layout_symbol['icon-image'] as never
  )
  if (parsed.result !== 'success') throw new Error(JSON.stringify(parsed))
  const out = parsed.value.evaluate({ zoom }, {
    type: 'Point',
    properties,
  } as never)
  return String(out)
}

describe('cluster icons', () => {
  it('health: fill is the dominant category, with an intervention pip', () => {
    const { model } = styleWith('health')
    const iThr = model.categories.findIndex(c => c.key === 'thriving')
    const iInt = model.categories.findIndex(
      c => c.key === 'intervention-required'
    )
    const counts: Record<string, number> = {}
    model.categories.forEach((_, i) => (counts[`k${i}`] = 0))
    counts[`k${iThr}`] = 7
    counts[`k${iInt}`] = 3
    const id = iconFor('health', 'club-clusters', {
      ...counts,
      cluster: true,
      point_count: 10,
    })
    expect(parseIconId(id)).toEqual({
      kind: 'cluster',
      theme: 'light',
      fill: '#2A8F6E',
      count: 10,
      pip: '#C93D3D',
    })
  })

  it('health: no pip when intervention is already the fill', () => {
    const { model } = styleWith('health')
    const iInt = model.categories.findIndex(
      c => c.key === 'intervention-required'
    )
    const counts: Record<string, number> = {}
    model.categories.forEach((_, i) => (counts[`k${i}`] = 0))
    counts[`k${iInt}`] = 4
    const id = iconFor('health', 'club-clusters', {
      ...counts,
      cluster: true,
      point_count: 4,
    })
    expect(parseIconId(id)).toMatchObject({ fill: '#C93D3D', pip: '' })
  })

  it('tier: fill is the median bin, not the most common', () => {
    const { model } = styleWith('tier')
    // Ladder order in categories: Smedley, President, Select, Distinguished,
    // NotDistinguished. 2 Select + 1 Distinguished + 2 Not yet: median = the
    // 3rd club from the bottom = Distinguished.
    const counts: Record<string, number> = {}
    model.categories.forEach((c, i) => {
      counts[`k${i}`] =
        c.key === 'Select' ? 2 : c.key === 'Distinguished' ? 1 : 0
      if (c.key === 'NotDistinguished') counts[`k${i}`] = 2
    })
    const id = iconFor('tier', 'club-clusters', {
      ...counts,
      cluster: true,
      point_count: 5,
    })
    expect(parseIconId(id)).toMatchObject({ fill: '#7FB8D9' })
  })

  it('cluster props sum one counter per category', () => {
    const { model } = styleWith('health')
    const props = clusterProperties(model)
    expect(Object.keys(props)).toHaveLength(model.categories.length)
  })
})

describe('pin icons', () => {
  it('territory pins gain their code label from z11', () => {
    const props = { id: '1', k: 0, s: 'circle', f: '#332288', c: 'A01', d: 0 }
    const far = parseIconId(iconFor('area', 'club-pins', props, 8))
    const near = parseIconId(iconFor('area', 'club-pins', props, 12))
    expect(far).toMatchObject({ kind: 'pin', code: '' })
    expect(near).toMatchObject({ kind: 'pin', code: 'A01', shape: 'circle' })
  })

  it('round-trips a dashed (provisional) pin', () => {
    const props = { id: '1', k: 3, s: 'fill25', f: '#7FB8D9', c: '', d: 1 }
    expect(parseIconId(iconFor('tier', 'club-pins', props))).toEqual({
      kind: 'pin',
      theme: 'light',
      shape: 'fill25',
      fill: '#7FB8D9',
      code: '',
      dashed: true,
      selected: false,
    })
  })

  it('rejects ids that are not ours', () => {
    expect(parseIconId('poi-airport')).toBeNull()
    expect(parseIconId('p|light|hexagon|#000000||0|0')).toBeNull()
  })
})
