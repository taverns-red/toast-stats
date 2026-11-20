import type { ReinstatableClubs } from '@taverns-red/shared-contracts'

/* #3094 — the "Can reinstate" card one and two levels up from the district
   (#3088): region and world. Summed in the browser over the dated
   `reinstatable-clubs.json`, one file covering every district. */

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
  total: number
}

export interface RollupReinstate {
  count: number
  adds: number
  /** The card's third line, e.g. "12 add to the club base". */
  card: string
  /** Reinstating now counts toward next program year's base. */
  nextYear: boolean
  rows: ReinstateDistrictRow[]
}

export interface BuildRollupReinstateInput {
  file: ReinstatableClubs | null
  /** The page's snapshot date (R3). */
  date: string | undefined
  /** Districts in scope (the region's, from its rollups); 'all' = world. */
  districtIds: readonly string[] | 'all'
  /** Start year of the page's program year (R3). */
  programYearStart: number
  /** The page's `location.search`; `py` and `date` ride the links. */
  search?: string | undefined
}

export function buildRollupReinstate(
  _input: BuildRollupReinstateInput
): RollupReinstate | null {
  return null
}
