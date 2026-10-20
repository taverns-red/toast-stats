/**
 * The world club explorer's pure layer (#1809) over the clubs-by-region
 * files (#1800). Load strategy:
 *
 * 1. `world.json` (~8 KB gz): the summary and the top-50 seed rows per
 *    metric, so the default list renders with no shard (the #1809 "≤ 150 KB
 *    before the first 50 rows" budget).
 * 2. The region shards, fetched in parallel and only when the page needs
 *    every club: the map, a search, a filter or a territory colour mode.
 *    `?region=` fetches only the named shards.
 *
 * Filter pipeline (R11): original → filtered (URL keys) → searched →
 * sorted, as the region explorer's (`regionClubs`), with `?region=` added
 * in front.
 */
import type {
  ClubsByRegionShard,
  ClubsByRegionWorld,
} from '@taverns-red/shared-contracts'
import { facetValues } from '../components/map/pinModes'
import {
  REGION_FILTER_PARAMS,
  applyRegionFilters,
  toRegionClub,
  wantsExtendedFilters,
  type ExtendedRegionFilter,
  type RegionClub,
  type RegionMetric,
} from './regionClubs'

export const UNASSIGNED = 'unassigned'

/** The explorer's Filters keys: region, then the region explorer's. */
export const WORLD_FILTER_PARAMS = ['region', ...REGION_FILTER_PARAMS] as const

/** Regions in number order, the unassigned shard last. */
const compareShardKey = (a: string, b: string) =>
  a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b, 'en')

/** Every shard of the date, or only the `?region=` ones it has. */
export function worldShardKeys(
  world: ClubsByRegionWorld | null,
  params: URLSearchParams
): string[] {
  if (!world?.shards) return []
  const keys = Object.keys(world.shards).sort(compareShardKey)
  const wanted = new Set(facetValues(params, 'region'))
  return wanted.size ? keys.filter(k => wanted.has(k)) : keys
}

export interface WorldSummary {
  clubs: number
  districts: number
  interventionRequired: number
}

/** The summary strip, from world.json alone (narrowed by `?region=`). */
export function worldSummary(
  world: ClubsByRegionWorld,
  params: URLSearchParams
): WorldSummary {
  const entries = world.shards
    ? worldShardKeys(world, params).map(k => world.shards![k]!)
    : []
  const interventionRequired = entries.reduce(
    (n, e) => n + e.health.interventionRequired,
    0
  )
  if (facetValues(params, 'region').length === 0)
    return {
      clubs: world.totals.clubs,
      districts: world.totals.districts,
      interventionRequired,
    }
  return {
    clubs: entries.reduce((n, e) => n + e.clubs, 0),
    districts: new Set(entries.flatMap(e => e.districtIds)).size,
    interventionRequired,
  }
}

/** The pipeline's top-50 seed for a metric, as list rows. */
export function worldTopClubs(
  world: ClubsByRegionWorld | null,
  metric: RegionMetric
): RegionClub[] {
  if (!world) return []
  return world.top[metric].map(c => toRegionClub(c, world.snapshotDate))
}

/** Every loaded shard's clubs, each club once. */
export function mergeWorldShards(
  shards: readonly (ClubsByRegionShard | null | undefined)[]
): RegionClub[] {
  const seen = new Set<string>()
  const out: RegionClub[] = []
  for (const s of shards) {
    if (!s) continue
    for (const c of s.clubs) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
      out.push(toRegionClub(c, s.snapshotDate))
    }
  }
  return out
}

/** Online-only clubs (#2174): no pin, so the online chip lists them. */
export const onlineOnlyClubs = (clubs: readonly RegionClub[]) =>
  clubs.filter(c => c.meetsOnline === true)

export const activeWorldFilterCount = (params: URLSearchParams) =>
  WORLD_FILTER_PARAMS.filter(k => facetValues(params, k).length).length

/** `?region=` and then the region explorer's keys (AND across keys). */
export function applyWorldFilters(
  clubs: readonly RegionClub[],
  params: URLSearchParams,
  extended?: ExtendedRegionFilter | null
): RegionClub[] {
  const regions = new Set(facetValues(params, 'region'))
  const inScope = regions.size
    ? clubs.filter(c => regions.has(c.regionId ?? UNASSIGNED))
    : clubs
  return applyRegionFilters(inScope, params, extended)
}

/** Does the page need every club (the shards), or does world.json do? */
export function needsWorldShards(opts: {
  params: URLSearchParams
  query: string
  mapOpen: boolean
  isPhone: boolean
  /** A territory mode colours by every club's place (Region, District). */
  lazyMode: boolean
}): boolean {
  const { params, query, mapOpen, isPhone, lazyMode } = opts
  return (
    !isPhone ||
    mapOpen ||
    lazyMode ||
    query.trim() !== '' ||
    activeWorldFilterCount(params) > 0 ||
    wantsExtendedFilters(params)
  )
}

export const worldRegionLabel = (key: string) =>
  key === UNASSIGNED ? 'Unassigned' : `Region ${key}`
