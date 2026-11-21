import type {
  ReinstatableClub,
  ReinstatableClubs,
} from '@taverns-red/shared-contracts'
import {
  reinstateCard,
  reinstateSplit,
} from '../components/ReinstatableClubsSection'
import { keptQuery } from './rollupGrowthFunnel'
import { retiredDistrictNote } from './retiredDistrictNote'

/* #3094 — the "Can reinstate" card one and two levels up from the district
   (#3088): region and world. Summed in the browser over the dated
   `reinstatable-clubs.json`, one file covering every district.

   Same rules as the district card, so the levels agree: "adds to net club
   growth" counts the clubs that don't raise the club base, from
   `reinstateSplit` (#3130). District U (undistricted clubs) is never
   in scope; District F is a district like any other. A district absent from
   the file was not measured and adds nothing; an empty list is a measured
   zero. Only districts with at least one club get a breakdown row, so the
   rows sum to the card. */

/** One district's row in the breakdown. */
export interface ReinstateDistrictRow {
  id: string
  label: string
  /** The district's own section: `/district/{id}/growth#growth-reinstate`.
   *  Absent for a retired district, whose growth page has no current data. */
  to?: string
  /** Set only for a retired district; shown instead of the link. */
  retiredNote?: string
  suspended: number
  closed: number
  /** Clubs that add to net club growth (#3130). */
  netGrowth: number
  total: number
}

export interface RollupReinstate {
  count: number
  /** Clubs that add to net club growth: the card's n (#3130). */
  netGrowth: number
  /** The card's third line, e.g. "12 add to net club growth" (#3130). */
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

/** The clubs that don't raise the club base: they add to net club growth. */
const netGrowth = (clubs: readonly ReinstatableClub[], date: string): number =>
  clubs.length - reinstateSplit(clubs, date).adds

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
    const retiredOn = clubs.find(c => c.districtRetiredOn)?.districtRetiredOn
    rows.push({
      id,
      label: `District ${id}`,
      ...(retiredOn
        ? { retiredNote: retiredDistrictNote(id, retiredOn) }
        : { to: `/district/${id}/growth${qs}#growth-reinstate` }),
      suspended: clubs.length - closed,
      closed,
      netGrowth: netGrowth(clubs, date),
      total: clubs.length,
    })
  }
  // Retired districts last: they have no page to act on.
  const retired = (r: ReinstateDistrictRow) => (r.retiredNote ? 1 : 0)
  rows.sort(
    (a, b) =>
      retired(a) - retired(b) ||
      b.netGrowth - a.netGrowth ||
      b.total - a.total ||
      byDistrictId(a.id, b.id)
  )
  return {
    count: inScope.length,
    netGrowth: netGrowth(inScope, date),
    card: reinstateCard(inScope, date),
    rows,
  }
}
