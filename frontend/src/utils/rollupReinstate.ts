import type {
  ReinstatableClub,
  ReinstatableClubs,
} from '@taverns-red/shared-contracts'
import {
  baseUnknownCount,
  reinstateCard,
  reinstateSplit,
} from '../components/ReinstatableClubsSection'
import { keptQuery } from './rollupGrowthFunnel'

/* #3094 — the "Can reinstate" card one and two levels up from the district
   (#3088): region and world. Summed in the browser over the dated
   `reinstatable-clubs.json`, one file covering every district.

   Same rules as the district card, so the levels agree: "adds to the club
   base" is `reinstateSplit`'s count. District U (undistricted clubs) is never
   in scope; District F is a district like any other. A district absent from
   the file was not measured and adds nothing; an empty list is a measured
   zero. Only districts with at least one club get a breakdown row, so the
   rows sum to the card. */

/** One district's row in the breakdown. */
export interface ReinstateDistrictRow {
  id: string
  label: string
  /** The district's own section: `/district/{id}/growth#growth-reinstate`. */
  to: string
  suspended: number
  closed: number
  adds: number
  /** Clubs closed in the oldest of the four renewal periods. */
  oldest: number
  /** Clubs whose effect on the club base isn't known (S6). */
  unknown: number
  total: number
}

export interface RollupReinstate {
  count: number
  adds: number
  /** Clubs whose effect on the club base isn't known. */
  unknown: number
  /** The card's third line, e.g. "12 add to the club base". */
  card: string
  rows: ReinstateDistrictRow[]
}

export interface BuildRollupReinstateInput {
  file: ReinstatableClubs | null
  /** The page's snapshot date (R3). */
  date: string | undefined
  /** Districts in scope (the region's, from its rollups); 'all' = world. */
  districtIds: readonly string[] | 'all'
  /** The page's `location.search`; `py` and `date` ride the links. */
  search?: string | undefined
}

const UNDISTRICTED = 'U'

const byDistrictId = (a: string, b: string): number => {
  const na = Number(a)
  const nb = Number(b)
  if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b)
  return na - nb
}

/** "2 effect on the club base not known", the tag's own wording. It lives
 *  beside the tag so the district card says it the same way (#3100). */
export { unknownPhrase } from '../components/ReinstatableClubsSection'

export function buildRollupReinstate({
  file,
  date,
  districtIds,
  search,
}: BuildRollupReinstateInput): RollupReinstate | null {
  if (!file || !date || file.snapshotDate !== date) return null
  const qs = keptQuery(search)
  const ids = (
    districtIds === 'all' ? Object.keys(file.districts) : districtIds
  ).filter(id => id !== UNDISTRICTED)
  const inScope: ReinstatableClub[] = []
  const rows: ReinstateDistrictRow[] = []
  for (const id of new Set(ids)) {
    const clubs = file.districts[id]
    if (!clubs || clubs.length === 0) continue
    inScope.push(...clubs)
    const closed = clubs.filter(c => c.status === 'closed').length
    rows.push({
      id,
      label: `District ${id}`,
      to: `/district/${id}/growth${qs}#growth-reinstate`,
      suspended: clubs.length - closed,
      closed,
      adds: reinstateSplit(clubs, date).adds,
      oldest: clubs.filter(c => c.oldestPeriod).length,
      unknown: baseUnknownCount(clubs),
      total: clubs.length,
    })
  }
  rows.sort(
    (a, b) => b.adds - a.adds || b.total - a.total || byDistrictId(a.id, b.id)
  )
  return {
    count: inScope.length,
    adds: reinstateSplit(inScope, date).adds,
    unknown: baseUnknownCount(inScope),
    card: reinstateCard(inScope, date),
    rows,
  }
}
