import type { ClubDistrictHistoryClub } from '@taverns-red/shared-contracts'

export function sameDistrictId(_a: string, _b: string): boolean {
  return false
}
export function districtForProgramYear(
  _h: ClubDistrictHistoryClub | null,
  _py: string
): string | null {
  return null
}
export function currentDistrictOf(
  _h: ClubDistrictHistoryClub | null
): string | null {
  return null
}
export function movedAfterDate(
  _h: ClubDistrictHistoryClub | null,
  _from: string,
  _to: string
): string | null {
  return null
}
export interface ClubDistrictNotice {
  headline: string
  detail: string
  openLabel: string
}
export function clubDistrictNotice(
  _h: ClubDistrictHistoryClub | null,
  _o: {
    urlDistrictId: string
    shownDistrictId: string
    programYearLabel: string
  }
): ClubDistrictNotice | null {
  return null
}
