/**
 * The region map's on-demand modes (#1808): District (`pinDistrict`) and
 * the extended modes (`pinExtended`: TI club status, members, net growth,
 * DCP goals), with the extended legend keys' filter. Split like the district
 * map's `pinTerritory` / `pinExtended`: the page fetches this chunk on
 * mount, in parallel with the shard, so the route's first load stays inside
 * its budget.
 */
import type { RegionClub } from '../../utils/regionClubs'
import { districtModel } from './pinDistrict'
import { applyExtendedFacets, extendedModel } from './pinExtended'
import type { ExtendedMode, MapColorMode, ModeModel } from './pinModes'

/** A lazy region mode's model (not health or tier: those are `pinModes`). */
export function regionModel(
  mode: MapColorMode,
  clubs: readonly RegionClub[]
): ModeModel {
  if (mode === 'district') return districtModel(clubs)
  // These modes read no date or reports sidecar (the reports and meeting
  // modes are not offered at region level).
  return extendedModel(mode as ExtendedMode, '')
}

/** The extended legend keys (`?size=`, `?growth=`, `?dcp=`,
 *  `?clubStatus=`): AND across keys, OR within one. */
export function applyRegionExtendedFacets(
  clubs: readonly RegionClub[],
  params: URLSearchParams
): RegionClub[] {
  return applyExtendedFacets(clubs, params, '', null)
}
