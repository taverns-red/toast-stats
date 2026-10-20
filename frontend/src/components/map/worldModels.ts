/**
 * The world map's on-demand modes (#1809): Region and District
 * (`pinWorld`, centroid adjacency at world scale) and the extended modes
 * (`pinExtended`), with the extended legend keys' filter. Fetched on mount,
 * in parallel with world.json, so the route's first load stays inside its
 * budget (ADR-016 D2).
 */
import type { RegionClub } from '../../utils/regionClubs'
import { applyExtendedFacets, extendedModel } from './pinExtended'
import type { ExtendedMode, MapColorMode, ModeModel } from './pinModes'
import { worldDistrictModel, worldRegionModel } from './pinWorld'

export function worldModel(
  mode: MapColorMode,
  clubs: readonly RegionClub[]
): ModeModel {
  if (mode === 'region') return worldRegionModel(clubs)
  if (mode === 'district') return worldDistrictModel(clubs)
  return extendedModel(mode as ExtendedMode, '')
}

export function applyWorldExtendedFacets(
  clubs: readonly RegionClub[],
  params: URLSearchParams
): RegionClub[] {
  return applyExtendedFacets(clubs, params, '', null)
}
