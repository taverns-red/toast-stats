/**
 * CDN helper: fetch time-series data for a district.
 *
 * Endpoints:
 *   time-series/district_{id}/index-metadata.json → available program years
 *   time-series/district_{id}/{programYear}.json  → data points for that year
 *
 * #170 — Serve time-series via CDN
 */

import type {
  ProgramYearIndexFile,
  TimeSeriesIndexMetadata,
} from '@toastmasters/shared-contracts'
import { fetchFromCdn } from './cdn'

const CDN_BASE_URL =
  import.meta.env['VITE_CDN_BASE_URL'] || 'https://cdn.taverns.red'

/**
 * Construct a CDN URL for time-series index metadata.
 */
export function cdnTimeSeriesMetadataUrl(districtId: string): string {
  return `${CDN_BASE_URL}/time-series/district_${districtId}/index-metadata.json`
}

/**
 * Construct a CDN URL for a program-year time-series file.
 */
export function cdnTimeSeriesProgramYearUrl(
  districtId: string,
  programYear: string
): string {
  return `${CDN_BASE_URL}/time-series/district_${districtId}/${programYear}.json`
}

/**
 * Fetch time-series metadata for a district from CDN.
 * Returns available program years and total data point count.
 */
export async function fetchTimeSeriesMetadata(
  districtId: string
): Promise<TimeSeriesIndexMetadata> {
  return fetchFromCdn<TimeSeriesIndexMetadata>(
    cdnTimeSeriesMetadataUrl(districtId)
  )
}

/**
 * Fetch a single program-year time-series file from CDN.
 * Returns the full index file with all data points and summary.
 */
export async function fetchTimeSeriesProgramYear(
  districtId: string,
  programYear: string
): Promise<ProgramYearIndexFile> {
  return fetchFromCdn<ProgramYearIndexFile>(
    cdnTimeSeriesProgramYearUrl(districtId, programYear)
  )
}

/**
 * Determine the current Toastmasters program year string.
 * Program years run July 1 → June 30.
 * E.g. if today is March 2026 → "2025-2026"
 */
export function getCurrentProgramYear(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-indexed
  // July (6) onwards = current year start; Jan-Jun = previous year start
  const startYear = month >= 6 ? year : year - 1
  return `${startYear}-${startYear + 1}`
}

/**
 * Get the previous N program years (not including the current one).
 */
export function getPreviousProgramYears(
  currentProgramYear: string,
  count: number
): string[] {
  const startYear = parseInt(currentProgramYear.split('-')[0] ?? '0', 10)
  const years: string[] = []
  for (let i = 1; i <= count; i++) {
    const prevStart = startYear - i
    years.push(`${prevStart}-${prevStart + 1}`)
  }
  return years
}
