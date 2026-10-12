/**
 * The club pin layer (#1784, spec §3.1 and §8): one clustered GeoJSON
 * source and three symbol layers (clusters, pins, the selected pin).
 *
 * The basemap has no glyphs or sprite (ADR-016: no third-party requests), so
 * every icon, cluster counts included, is an image drawn on demand from its
 * id (`pinImages.ts`, on `styleimagemissing`). The layer expressions build
 * that id from feature properties; `parseIconId` reads it back. Pure: no
 * MapLibre runtime import, so it costs the route only its own bytes.
 */
import type {
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  LayerSpecification,
} from 'maplibre-gl'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import {
  PIN_SHAPES,
  SUSPENDED_FILL,
  type ModeModel,
  type PinShape,
} from './pinModes'

export const PIN_SOURCE_ID = 'club-pins'
export const CLUSTER_LAYER_ID = 'club-clusters'
export const PIN_LAYER_ID = 'club-pins'
export const SELECTED_LAYER_ID = 'club-pins-selected'
export const PIN_LAYER_IDS = [
  CLUSTER_LAYER_ID,
  PIN_LAYER_ID,
  SELECTED_LAYER_ID,
] as const

/** Territory modes show the on-pin code from this zoom (spec §7.3). */
export const CODE_LABEL_MIN_ZOOM = 11

/** Territory clusters are neutral: a dominant hue over 34 areas misleads. */
export const NEUTRAL_CLUSTER_FILL = '#57534C'

export type MapTheme = 'light' | 'dark'

export interface PinProps {
  id: string
  /** Category index in `model.categories`. */
  k: number
  s: PinShape
  f: string
  /** On-pin code ('' outside territory modes). */
  c: string
  /** 1 = dashed (provisional) outline. */
  d: 0 | 1
}

export interface PinFeatureCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: PinProps
  }>
}

export function buildPinFeatures(
  clubs: readonly ClubTrend[],
  model: ModeModel
): PinFeatureCollection {
  const features: PinFeatureCollection['features'] = []
  for (const club of clubs) {
    const at = club.coordinates
    if (!at || !Number.isFinite(at.lat) || !Number.isFinite(at.lng)) continue
    const cat = model.categoryOf(club)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [at.lng, at.lat] },
      properties: {
        id: club.clubId,
        k: model.categories.indexOf(cat),
        s: cat.shape,
        f: cat.fill,
        c: cat.code ?? '',
        d: model.isDashed(club) ? 1 : 0,
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

const countOf = (i: number): ExpressionSpecification => ['get', `k${i}`]

/** One counter per category, summed across a cluster's members. */
export function clusterProperties(
  model: ModeModel
): Record<string, ExpressionSpecification> {
  const props: Record<string, ExpressionSpecification> = {}
  model.categories.forEach((_, i) => {
    props[`k${i}`] = [
      '+',
      ['case', ['==', ['get', 'k'], i], 1, 0],
    ] as unknown as ExpressionSpecification
  })
  return props
}

/**
 * Cluster fill (spec §8): the dominant category for status modes, the
 * median rung for ordinal modes, neutral for many-category territory modes.
 */
function clusterFill(model: ModeModel): ExpressionSpecification | string {
  const cats = model.categories
  if (model.kind === 'categorical') return NEUTRAL_CLUSTER_FILL
  if (model.kind === 'ordinal') {
    // Rungs from the bottom of the ladder; the suspended override is no rung.
    const rungs = cats
      .map((c, i) => ({ c, i }))
      .filter(r => r.c.shape !== 'suspended')
      .reverse()
    const total: ExpressionSpecification = [
      '+',
      0,
      ...rungs.map(r => countOf(r.i)),
    ]
    const branches: unknown[] = []
    rungs.forEach((r, n) => {
      const cum = ['+', 0, ...rungs.slice(0, n + 1).map(x => countOf(x.i))]
      branches.push(
        ['all', ['>', total, 0], ['>=', ['*', 2, cum], total]],
        r.c.fill
      )
    })
    return ['case', ...branches, SUSPENDED_FILL] as ExpressionSpecification
  }
  const branches: unknown[] = []
  cats.forEach((c, i) => {
    const beatsAll = cats
      .map((_, j) => j)
      .filter(j => j !== i)
      .map(j => ['>=', countOf(i), countOf(j)])
    branches.push(['all', ...beatsAll], c.fill)
  })
  return ['case', ...branches, SUSPENDED_FILL] as ExpressionSpecification
}

function clusterPip(
  model: ModeModel,
  fill: ExpressionSpecification | string
): ExpressionSpecification | string {
  const i = model.categories.findIndex(c => c.key === model.exceptionKey)
  if (i < 0) return ''
  const pip = model.categories[i]!.fill
  return [
    'case',
    ['all', ['>', countOf(i), 0], ['!=', fill, pip]],
    pip,
    '',
  ] as ExpressionSpecification
}

function clusterIcon(
  model: ModeModel,
  theme: MapTheme
): ExpressionSpecification {
  const fill = clusterFill(model)
  return [
    'concat',
    'c|',
    theme,
    '|',
    fill,
    '|',
    ['to-string', ['get', 'point_count']],
    '|',
    clusterPip(model, fill),
  ] as ExpressionSpecification
}

function pinId(
  theme: MapTheme,
  selected: boolean,
  withCode: boolean
): ExpressionSpecification {
  return [
    'concat',
    'p|',
    theme,
    '|',
    ['get', 's'],
    '|',
    ['get', 'f'],
    '|',
    withCode ? ['get', 'c'] : '',
    '|',
    ['to-string', ['get', 'd']],
    '|',
    selected ? '1' : '0',
  ] as ExpressionSpecification
}

function pinIcon(theme: MapTheme, selected: boolean): ExpressionSpecification {
  return [
    'step',
    ['zoom'],
    pinId(theme, selected, false),
    CODE_LABEL_MIN_ZOOM,
    pinId(theme, selected, true),
  ] as ExpressionSpecification
}

export function pinSourceSpec(
  data: PinFeatureCollection,
  model: ModeModel
): GeoJSONSourceSpecification {
  return {
    type: 'geojson',
    data: data as GeoJSONSourceSpecification['data'],
    cluster: true,
    // Pins cluster only when their 44 px targets would overlap (spec §8).
    clusterRadius: 44,
    clusterMaxZoom: 13,
    clusterMinPoints: 2,
    clusterProperties: clusterProperties(model),
  }
}

const overlap = {
  'icon-allow-overlap': true,
  'icon-ignore-placement': true,
} as const

export function clubPinLayers(
  model: ModeModel,
  theme: MapTheme,
  selectedIds: readonly string[] = []
): LayerSpecification[] {
  return [
    {
      id: CLUSTER_LAYER_ID,
      type: 'symbol',
      source: PIN_SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: { 'icon-image': clusterIcon(model, theme), ...overlap },
    },
    {
      id: PIN_LAYER_ID,
      type: 'symbol',
      source: PIN_SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      layout: { 'icon-image': pinIcon(theme, false), ...overlap },
    },
    {
      id: SELECTED_LAYER_ID,
      type: 'symbol',
      source: PIN_SOURCE_ID,
      filter: selectedFilter(selectedIds),
      layout: { 'icon-image': pinIcon(theme, true), ...overlap },
    },
  ]
}

export function selectedFilter(
  ids: readonly string[]
): ExpressionSpecification {
  return [
    'all',
    ['!', ['has', 'point_count']],
    ['in', ['get', 'id'], ['literal', [...ids]]],
  ] as ExpressionSpecification
}

export type IconSpec =
  | {
      kind: 'pin'
      theme: MapTheme
      shape: PinShape
      fill: string
      code: string
      dashed: boolean
      selected: boolean
    }
  | {
      kind: 'cluster'
      theme: MapTheme
      fill: string
      count: number
      pip: string
    }

const HEX = /^#[0-9A-F]{6}$/i
const isTheme = (t: string | undefined): t is MapTheme =>
  t === 'light' || t === 'dark'

/** Read back an icon id built by the layer expressions; null if not ours. */
export function parseIconId(id: string): IconSpec | null {
  const p = id.split('|')
  if (p[0] === 'p' && p.length === 7) {
    const [, theme, shape, fill, code, dashed, selected] = p
    if (!isTheme(theme) || !HEX.test(fill!)) return null
    if (!PIN_SHAPES.includes(shape as PinShape)) return null
    return {
      kind: 'pin',
      theme,
      shape: shape as PinShape,
      fill: fill!,
      code: code!.slice(0, 6),
      dashed: dashed === '1',
      selected: selected === '1',
    }
  }
  if (p[0] === 'c' && p.length === 5) {
    const [, theme, fill, count, pip] = p
    const n = Number(count)
    if (!isTheme(theme) || !HEX.test(fill!) || !Number.isInteger(n)) return null
    if (pip !== '' && !HEX.test(pip!)) return null
    return { kind: 'cluster', theme, fill: fill!, count: n, pip: pip! }
  }
  return null
}
