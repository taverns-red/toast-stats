/**
 * No link or email in a reports file's place text (#2097, #2069).
 * Stub for the red test; implemented in the next commit.
 */
import type { DistrictReportsDataset } from '../schemas/district-reports.schema.js'

export const REPORTS_PLACE_TEXT_FIELDS = ['location'] as const

export interface ReportsPlaceTextRepair {
  value: unknown
  scrubbed: number
  restored: number
}

export function repairReportsPlaceText(value: unknown): ReportsPlaceTextRepair {
  return { value, scrubbed: 0, restored: 0 }
}

export function scrubReportsPlaceText(
  dataset: DistrictReportsDataset
): DistrictReportsDataset {
  return dataset
}
