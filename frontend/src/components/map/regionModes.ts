/**
 * The region map's colour modes (#1808): the district map's that apply at
 * region level — health (the default), Distinguished level, TI club status,
 * members, net growth and DCP goals — plus District. Division and area are
 * per-district territories, and the reports and meeting modes read files
 * the region shard does not carry, so they are not offered here.
 */
import type { RegionClub } from '../../utils/regionClubs'
import type { ModeList } from './MapModePicker'
import { districtModel } from './pinDistrict'
import { extendedModel } from './pinExtended'
import {
  MAP_COLOR_MODES,
  buildModeModel,
  type ExtendedMode,
  type MapColorMode,
  type ModeModel,
} from './pinModes'

/** The modes that apply at region level: the district map's, less the
 *  district-only ones (division, area, reports, meeting), plus District. */
const REGION_MODE_IDS: readonly MapColorMode[] = [
  'health',
  'tier',
  'status',
  'size',
  'growth',
  'dcp',
]
export const REGION_COLOR_MODES: ModeList = [
  ...MAP_COLOR_MODES.filter(m => REGION_MODE_IDS.includes(m.id)),
  { id: 'district', label: 'District', group: 'Territory' },
]

/** `?color=` is URL-seedable: whitelist at the parse (Lessons 124/144). */
export function parseRegionColorMode(raw: string | null): MapColorMode {
  return REGION_COLOR_MODES.find(m => m.id === raw)?.id ?? 'health'
}

export function regionModel(
  mode: MapColorMode,
  clubs: readonly RegionClub[]
): ModeModel {
  if (mode === 'district') return districtModel(clubs)
  if (mode === 'health' || mode === 'tier') return buildModeModel(mode)
  return extendedModel(mode as ExtendedMode, '')
}
