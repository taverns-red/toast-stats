/**
 * The region map's colour modes (#1808): the district map's that apply at
 * region level — health (the default), Distinguished level, TI club status,
 * members, net growth and DCP goals — plus District. Division and area are
 * per-district territories, and the reports and meeting modes read files
 * the region shard does not carry, so they are not offered here.
 *
 * Only the list and the parse live here, on the route's first load; every
 * mode but health and tier is built in `regionModels`, an on-demand chunk
 * (the map route's 300 KB budget, ADR-016 D2).
 */
import type { ModeList } from './MapModePicker'
import { MAP_COLOR_MODES, type MapColorMode } from './pinModes'

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

/** Built in the on-demand `regionModels` chunk. */
export const isRegionLazyMode = (m: MapColorMode) =>
  m !== 'health' && m !== 'tier'
