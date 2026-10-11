import type { DistrictReportsDataset } from '@taverns-red/shared-contracts'

/** #1790 — stub; implemented next. */
export type ComplianceState = 'ok' | 'warn' | 'bad' | 'neutral' | 'unknown'

export interface ComplianceRow {
  key: string
  label: string
  state: ComplianceState
  value: string
  source: string
}

export interface ComplianceInput {
  reports: DistrictReportsDataset | null | undefined
  clubId: string
  divisionRecord: Record<string, string | number | null> | null
  charterDate: string | undefined
  programYear: string
  snapshotDate: string
}

export interface ClubCoachSummary {
  status: 'active' | 'awarded' | 'none'
  label: string
  source: string
}

export function summarizeClubCompliance(
  _input: ComplianceInput
): ComplianceRow[] {
  return []
}

export function summarizeClubCoach(
  _reports: DistrictReportsDataset | null | undefined,
  _clubId: string
): ClubCoachSummary | null {
  return null
}
