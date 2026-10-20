/* PY-scoped region membership (#1821) — stub for the red commit. */
import type { DistrictRegionHistory } from '@taverns-red/shared-contracts'

export interface RegionRun {
  region: string
  firstProgramYear: string
  lastProgramYear: string
  ongoing: boolean
}

export function regionOfDistrict(
  _history: DistrictRegionHistory | null | undefined,
  _districtId: string,
  _programYear: string
): string | null {
  return null
}

export function regionMembershipFor(
  _history: DistrictRegionHistory | null | undefined,
  _programYear: string
): (row: { districtId: string; region: string }) => string {
  return row => row.region
}

export function formerRegionRuns(
  _history: DistrictRegionHistory | null | undefined,
  _districtId: string,
  _programYear: string
): RegionRun[] {
  return []
}

export function shortProgramYear(label: string): string {
  return label
}
