/**
 * Shared Cache Path Utilities (#126)
 *
 * Single-source-of-truth for path construction, date formatting,
 * program year calculation, and metadata path building.
 *
 * Used by:
 *   - OrchestratorCacheAdapter (daily pipeline)
 *   - BackfillOrchestrator (historical backfill)
 */

import { CSVType } from '../types/collector.js'

// ── Date Formatting ──────────────────────────────────────────────────

/**
 * Format a Date as YYYY-MM-DD for storage paths.
 */
export function toYYYYMMDD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ── Program Year ─────────────────────────────────────────────────────

/**
 * Calculate the Toastmasters program year label from a date string.
 * Program year runs July–June: July 2024 → "2024-2025".
 *
 * Accepts YYYY-MM-DD string or Date object.
 */
export function calculateProgramYear(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date + 'T00:00:00') : date
  const year = dateObj.getFullYear()
  const month = dateObj.getMonth() + 1
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

/**
 * Get the program year preceding the given one (#333).
 * E.g., "2025-2026" → "2024-2025"
 */
export function getPriorProgramYear(programYear: string): string {
  const startYear = parseInt(programYear.split('-')[0]!, 10)
  return `${startYear - 1}-${startYear}`
}

// ── Path Building ────────────────────────────────────────────────────

/**
 * Build the storage path for a CSV file.
 *
 * Produces paths matching the backend's RawCSVCacheService convention:
 *   - All-districts:    `{prefix}/raw-csv/{YYYY-MM-DD}/all-districts.csv`
 *   - District-specific: `{prefix}/raw-csv/{YYYY-MM-DD}/district-{id}/{type}.csv`
 *
 * @param prefix     Root cache directory or GCS prefix
 * @param date       Date as YYYY-MM-DD string or Date object
 * @param csvType    CSV type (from CSVType enum)
 * @param districtId District ID (required for per-district reports)
 */
export function buildCsvPath(
  prefix: string,
  date: string | Date,
  csvType: CSVType,
  districtId?: string
): string {
  const dateStr = typeof date === 'string' ? date : toYYYYMMDD(date)

  if (csvType === CSVType.ALL_DISTRICTS) {
    return `${prefix}/raw-csv/${dateStr}/${csvType}.csv`
  }

  if (!districtId) {
    throw new Error(`districtId is required for CSV type: ${csvType}`)
  }
  return `${prefix}/raw-csv/${dateStr}/district-${districtId}/${csvType}.csv`
}

/**
 * Build the storage path for a date's metadata.json.
 *
 * @param prefix  Root cache directory or GCS prefix
 * @param date    Date as YYYY-MM-DD string or Date object
 */
export function buildMetadataPath(prefix: string, date: string | Date): string {
  const dateStr = typeof date === 'string' ? date : toYYYYMMDD(date)
  return `${prefix}/raw-csv/${dateStr}/metadata.json`
}

/**
 * Build the checksum filename key for a CSV file (matches backend convention).
 *
 * @param csvType    CSV type
 * @param districtId District ID (required for per-district types)
 */
export function buildChecksumKey(
  csvType: CSVType,
  districtId?: string
): string {
  if (csvType === CSVType.ALL_DISTRICTS) {
    return `${csvType}.csv`
  }
  return `district-${districtId}/${csvType}.csv`
}

// ── Report Type Mapping ──────────────────────────────────────────────

/**
 * Dashboard report type names used in export.aspx URLs.
 */
export type ReportType =
  | 'clubperformance'
  | 'divisionperformance'
  | 'districtperformance'
  | 'districtsummary'

/**
 * Map dashboard report type names to CSVType enum values.
 * Used when converting between HTTP download URLs and cache paths.
 */
export const REPORT_TYPE_TO_CSV: Record<ReportType, CSVType> = {
  clubperformance: CSVType.CLUB_PERFORMANCE,
  divisionperformance: CSVType.DIVISION_PERFORMANCE,
  districtperformance: CSVType.DISTRICT_PERFORMANCE,
  districtsummary: CSVType.ALL_DISTRICTS,
}

/**
 * Build a CSV storage path from a dashboard report type.
 * Convenience wrapper that maps ReportType → CSVType → path.
 */
export function buildCsvPathFromReport(
  prefix: string,
  date: string | Date,
  reportType: ReportType,
  districtId?: string
): string {
  return buildCsvPath(prefix, date, REPORT_TYPE_TO_CSV[reportType], districtId)
}
