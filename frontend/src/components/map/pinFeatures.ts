/**
 * The club pins' data and ids (#1784): the GeoJSON the pin layer draws,
 * built from the clubs and the colour mode, and the source and layer ids.
 * Split from `pinLayer` (#1808) so a map page's first load carries only
 * this; the layer specs and their MapLibre sync arrive with `pinRuntime`,
 * fetched on mount like the icon painter (the map route's 300 KB budget,
 * ADR-016 D2). Pure: no MapLibre runtime import.
 */
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import type { ModeModel, PinShape } from './pinModes'
import { hasMapPoint } from '../../utils/mapPoint'

export const PIN_SOURCE_ID = 'club-pins'
export const CLUSTER_LAYER_ID = 'club-clusters'
export const PIN_LAYER_ID = 'club-pins'
export const SELECTED_LAYER_ID = 'club-pins-selected'
export const PIN_LAYER_IDS = [
  CLUSTER_LAYER_ID,
  PIN_LAYER_ID,
  SELECTED_LAYER_ID,
] as const

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
    // No point, (0, 0) (#2153) or online only (#2174): no pin.
    if (!hasMapPoint(club)) continue
    const at = club.coordinates
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
