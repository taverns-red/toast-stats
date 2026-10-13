/**
 * Map filters (#1788): which clubs still need this round's visit, which can
 * be attended online, and division / area. Pure: no React, no MapLibre.
 *
 * Loaded on demand (the map route's first load is at its 300 KB budget):
 * the page fetches this chunk only when the URL carries `?visit=` /
 * `?online=` or the Filters control is first opened.
 *
 * URL keys follow the spec (§9): a facet without an existing Clubs-table key
 * is named after what it filters — `?visit=r1,r2`, `?online=yes` — and
 * division / area reuse the Clubs-table `?divisions=` / `?areas=` keys that
 * the territory legend chips already write. AND across facets, OR within.
 *
 * Privacy: online-capable is `allowsVirtualAttendance === true`, a boolean
 * and nothing else — never a meeting link, ID or passcode.
 */
import { normalizeClubId } from '@taverns-red/shared-contracts'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import type { FilterSheetFacet } from '../filters/FilterSheet'
import { fetchCdnDistrictSnapshot } from '../../services/cdn'
import type { SnapshotDate } from '../../types/snapshotDate'
import {
  currentRoundVisitFields,
  hasCompletedRoundVisit,
  unwrapSnapshotPayload,
} from '../../utils/snapshotPayload'
import {
  MAP_FILTER_PARAMS,
  compareLabel,
  facetValues as values,
  type MapFilterParam,
} from './pinModes'

// The keys and the trigger's count live in pinModes, which the page loads
// up front; re-exported so this module is the filters' one import.
export {
  MAP_FILTER_PARAMS,
  activeMapFilterCount,
  type MapFilterParam,
} from './pinModes'

type Round = 'r1' | 'r2'
const ROUNDS: readonly Round[] = ['r1', 'r2']
const ONLINE = 'yes'

/** Visit reported per round, by normalised club id. */
export type VisitIndex = Map<string, { r1: boolean; r2: boolean }>

/** `?visit=` is URL-seedable: whitelist at the parse (Lessons 124/144). */
const visitRounds = (params: URLSearchParams): Round[] =>
  ROUNDS.filter(r => values(params, 'visit').includes(r))

/** True when the URL asks for a visit round, so the snapshot is needed. */
export function needsVisitData(params: URLSearchParams): boolean {
  return visitRounds(params).length > 0
}

/** Read both rounds' visit awards from a raw district snapshot. */
export function buildVisitIndex(snapshot: unknown): VisitIndex {
  const index: VisitIndex = new Map()
  const rows = unwrapSnapshotPayload(snapshot)?.['divisionPerformance']
  if (!Array.isArray(rows)) return index
  const r1 = currentRoundVisitFields(1)
  const r2 = currentRoundVisitFields(2)
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const rec = row as Record<string, unknown>
    const id = normalizeClubId(rec['Club'] ?? rec['Club Number'])
    if (!id) continue
    index.set(id, {
      r1: hasCompletedRoundVisit(rec, r1),
      r2: hasCompletedRoundVisit(rec, r2),
    })
  }
  return index
}

/** The visit index for the viewed date; null when that snapshot can't be
 *  read ("not available", never "needs a visit"). */
export async function loadVisitIndex(
  date: SnapshotDate,
  districtId: string
): Promise<VisitIndex | null> {
  try {
    return buildVisitIndex(await fetchCdnDistrictSnapshot(date, districtId))
  } catch {
    return null
  }
}

/**
 * Apply `?visit=` and `?online=` (division / area are applied with the
 * legend facets). A club whose visit is unknown — missing from the snapshot,
 * or no snapshot (`visits` null) — never matches "needs a visit".
 */
export function applyMapFilters(
  clubs: readonly ClubTrend[],
  params: URLSearchParams,
  visits: VisitIndex | null | undefined
): ClubTrend[] {
  let out = [...clubs]
  const rounds = visitRounds(params)
  if (rounds.length > 0) {
    out = out.filter(c => {
      const v = visits?.get(normalizeClubId(c.clubId))
      return v !== undefined && rounds.some(r => !v[r])
    })
  }
  if (params.get('online') === ONLINE)
    out = out.filter(c => c.allowsVirtualAttendance === true)
  return out
}

/** Write one facet: one URL write per handler (Lesson: two URL-state
 *  hooks in one handler lose a facet). */
export function setMapFilter(
  params: URLSearchParams,
  param: MapFilterParam,
  next: readonly string[]
): URLSearchParams {
  const out = new URLSearchParams(params)
  if (next.length) out.set(param, next.join(','))
  else out.delete(param)
  return out
}

/** "Clear all": the four filter keys, in one write; mode, legend facets
 *  and the view stay. */
export function clearMapFilters(params: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams(params)
  for (const k of MAP_FILTER_PARAMS) out.delete(k)
  return out
}

const distinct = (xs: Iterable<string>) =>
  [...new Set(xs)].filter(Boolean).sort(compareLabel)

/** The facets the filter sheet / panel renders, in the issue's order. */
export function mapFilterFacets(
  clubs: readonly ClubTrend[],
  params: URLSearchParams,
  write: (param: MapFilterParam, next: string[]) => void
): FilterSheetFacet[] {
  const divisions = values(params, 'divisions')
  const areas = values(params, 'areas')
  // Areas narrow to the chosen divisions; a chosen area stays offered so it
  // can always be cleared.
  const areaOptions = distinct([
    ...clubs
      .filter(c => !divisions.length || divisions.includes(c.divisionName))
      .map(c => c.areaName),
    ...areas,
  ])
  const facet = (
    id: MapFilterParam,
    label: string,
    options: { value: string; label: string }[]
  ): FilterSheetFacet => ({
    id,
    label,
    options,
    selected: values(params, id),
    onChange: next => write(id, next),
  })
  const named = (xs: string[]) => xs.map(v => ({ value: v, label: v }))
  return [
    facet('visit', 'Club visit not yet reported', [
      { value: 'r1', label: 'Round 1' },
      { value: 'r2', label: 'Round 2' },
    ]),
    facet('online', 'How members attend', [
      { value: ONLINE, label: 'Online attendance possible' },
    ]),
    facet(
      'divisions',
      'Division',
      named(distinct(clubs.map(c => c.divisionName)))
    ),
    facet('areas', 'Area', named(areaOptions)),
  ]
}
