import type { ClubDistrictHistoryClub } from '@taverns-red/shared-contracts'

/** #1805 — what the club hero's lineage chip says. */
export interface ClubLineage {
  /** "District 1 until June 2026", newest first. */
  formerDistricts: string[]
  /** Earlier names, oldest first. */
  formerNames: string[]
}

export function buildClubLineage(
  _history: ClubDistrictHistoryClub | null,
  _districtId: string | undefined
): ClubLineage | null {
  return null
}
