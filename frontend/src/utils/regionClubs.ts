/**
 * The region club explorer's pure layer (#1808) over one clubs-by-region
 * shard (#1800): the adapter onto the club shape the district map stack
 * reads, the summary, the metric ranking, search and the URL filters.
 *
 * The adapter is what lets the region map reuse the district map's pins,
 * clusters, colour modes and legend (#1784, #1787) unchanged: a shard row
 * carries the same classifications (health #1120, Distinguished #1406),
 * so each mode's `categoryOf` reads it as it reads a district club. The
 * trends are one point, at the shard's own logical date.
 *
 * Filter pipeline (R11): original → filtered (URL keys) → searched →
 * sorted; each step is its own function.
 */
import {
  clubIdsMatch,
  parseCoordinates,
  type ClubsByRegionClub,
  type ClubsByRegionShard,
} from '@taverns-red/shared-contracts'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'
import {
  EXTENDED_FACET_PARAMS,
  applyFacets,
  compareLabel,
  facetValues,
} from '../components/map/pinModes'

/** A region club: the district map's club shape plus its district and,
 *  for the world explorer (#1809), its shard's region. */
export type RegionClub = ClubTrend & { districtId: string; regionId?: string }

const HEALTH = {
  t: 'thriving',
  v: 'vulnerable',
  i: 'intervention-required',
} as const

export function toRegionClub(c: ClubsByRegionClub, date: string): RegionClub {
  const club: RegionClub = {
    clubId: c.id,
    clubName: c.name,
    districtId: c.d,
    divisionId: c.division,
    divisionName: `Division ${c.division}`,
    areaId: c.area,
    areaName: `Area ${c.area}`,
    membershipTrend: [{ date, count: c.members }],
    dcpGoalsTrend: [{ date, goalsAchieved: c.dcpGoals }],
    membershipBase: c.base,
    currentStatus: HEALTH[c.h],
    riskFactors: [],
    distinguishedLevel: c.t ?? 'NotDistinguished',
    isProvisionallyDistinguished: c.tp,
  }
  if (c.status !== null) club.clubStatus = c.status
  if (c.csp !== null) club.cspSubmitted = c.csp
  // #2153 — shards written before the FAC fix carry (0, 0) for ungeocoded
  // clubs; the shared rule keeps them off the map and in the unmapped count.
  const at = parseCoordinates({ lat: c.lat, lng: c.lng })
  if (at) club.coordinates = at
  if (c.city !== null) club.address = { city: c.city }
  club.regionId = c.region ?? 'unassigned'
  // #2174 — online only: no pin (hasMapPoint), listed by the online chip.
  if (c.meetsOnline === true) club.meetsOnline = true
  return club
}

export function toRegionClubs(shard: ClubsByRegionShard): RegionClub[] {
  return shard.clubs.map(c => toRegionClub(c, shard.snapshotDate))
}

const membersOf = (c: ClubTrend) => c.membershipTrend[0]?.count ?? 0

export interface RegionSummary {
  clubs: number
  members: number
  interventionRequired: number
}

export function regionSummary(clubs: readonly RegionClub[]): RegionSummary {
  let members = 0
  let interventionRequired = 0
  for (const c of clubs) {
    members += membersOf(c)
    if (c.currentStatus === 'intervention-required') interventionRequired++
  }
  return { clubs: clubs.length, members, interventionRequired }
}

/* ── Metric ranking: `?sort=` (membership omitted) ─────────────────── */

export type RegionMetric = 'membership' | 'netGrowth' | 'dcpGoals'

export const REGION_METRICS: readonly { id: RegionMetric; label: string }[] = [
  { id: 'membership', label: 'Members' },
  { id: 'netGrowth', label: 'Net growth' },
  { id: 'dcpGoals', label: 'DCP goals' },
]

/** `?sort=` is URL-seedable: whitelist at the parse (Lessons 124/144). */
export function parseRegionMetric(raw: string | null): RegionMetric {
  return REGION_METRICS.some(m => m.id === raw)
    ? (raw as RegionMetric)
    : 'membership'
}

export function regionClubMetric(c: RegionClub, metric: RegionMetric): number {
  if (metric === 'netGrowth') return membersOf(c) - (c.membershipBase ?? 0)
  if (metric === 'dcpGoals') return c.dcpGoalsTrend[0]?.goalsAchieved ?? 0
  return membersOf(c)
}

/** Highest first, ties by club id — the order of the pipeline's own top-N
 *  seed lists (world.json `top`). */
export function sortRegionClubs(
  clubs: readonly RegionClub[],
  metric: RegionMetric
): RegionClub[] {
  return [...clubs].sort(
    (a, b) =>
      regionClubMetric(b, metric) - regionClubMetric(a, metric) ||
      compareLabel(a.clubId, b.clubId)
  )
}

/* ── Search: `?q=`, club name or number ────────────────────────────── */

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function searchRegionClubs(
  clubs: readonly RegionClub[],
  query: string
): RegionClub[] {
  const q = query.trim()
  if (!q) return [...clubs]
  if (/^\d+$/.test(q)) {
    const exact = clubs.filter(c => clubIdsMatch(c.clubId, q))
    if (exact.length) return exact
  }
  const needle = fold(q)
  return clubs.filter(
    c => fold(c.clubName).includes(needle) || c.clubId.startsWith(q)
  )
}

/* ── URL filters ───────────────────────────────────────────────────── */

/** The explorer's Filters keys: district, health status, size band. */
export const REGION_FILTER_PARAMS = ['district', 'status', 'size'] as const

export const activeRegionFilterCount = (params: URLSearchParams) =>
  REGION_FILTER_PARAMS.filter(k => facetValues(params, k).length).length

/** The extended modes' legend keys this page can hold (`?size=` is also
 *  a Filters key); they need the on-demand `regionModels` chunk. */
export const wantsExtendedFilters = (params: URLSearchParams) =>
  EXTENDED_FACET_PARAMS.some(p => facetValues(params, p).length > 0)

/** Applies the keys that need the on-demand chunk (`regionModels`). */
export type ExtendedRegionFilter = (
  clubs: readonly RegionClub[],
  params: URLSearchParams
) => RegionClub[]

/** Every URL key the explorer reads (AND across keys, OR within one): the
 *  district, the map's health and Distinguished keys (`?status=`,
 *  `?distinguished=`) and, through `extended`, the extended modes' legend
 *  keys (`?size=`, `?growth=`, `?dcp=`, `?clubStatus=`). Until the caller
 *  has `extended`, it must not draw a result for a URL that
 *  `wantsExtendedFilters` (a deep link would show the unfiltered set). */
export function applyRegionFilters(
  clubs: readonly RegionClub[],
  params: URLSearchParams,
  extended?: ExtendedRegionFilter | null
): RegionClub[] {
  const districts = new Set(facetValues(params, 'district'))
  let out = districts.size
    ? clubs.filter(c => districts.has(c.districtId))
    : [...clubs]
  out = applyFacets(out, params)
  return extended ? extended(out, params) : out
}
