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

// ── Prefix Normalisation (#1388) ─────────────────────────────────────

/**
 * Normalise a storage prefix so composing `{prefix}/raw-csv/…` can never
 * produce an empty path segment (#1388).
 *
 * A blank prefix means *no prefix* — not a leading `/`. Interpolating an empty
 * string yielded the key `/raw-csv/{date}/…`, which reads as
 * `gs://bucket//raw-csv/…`: legal in GCS, and a silent parallel key space that
 * nothing downstream reads from. The whole 07-26 → 07-29 ingest landed there
 * and still exited 0, because every *fetch* was correct.
 *
 * Whitespace is trimmed, duplicate slashes collapse, trailing slashes are
 * dropped. A single leading slash is preserved: the same builder serves the
 * daily pipeline's absolute local `cacheDir`.
 */
export function normalisePathPrefix(prefix: string): string {
  const collapsed = prefix.trim().replace(/\/{2,}/g, '/')
  // Slash-only (or blank) input carries no prefix information at all.
  if (collapsed === '' || collapsed === '/') return ''
  return collapsed.replace(/\/+$/, '')
}

/**
 * Normalise a GCS object-key prefix (#1388).
 *
 * As {@link normalisePathPrefix}, but also strips leading slashes — a GCS key
 * must never begin with `/`, since the bucket URI already supplies the
 * separator.
 */
export function normaliseGcsKeyPrefix(prefix: string): string {
  return normalisePathPrefix(prefix).replace(/^\/+/, '')
}

/**
 * Describe where a run will actually write, fully qualified (#1388).
 *
 * The backfill run printed its destination nowhere, which is exactly why an
 * entire ingest into `gs://bucket//raw-csv/` looked clean. Log this once at
 * startup so the destination is in the transcript before any object is
 * written.
 */
export function describeStorageDestination(
  prefix: string,
  bucketName?: string
): string {
  if (bucketName) {
    return `gs://${bucketName}/${buildRawCsvPrefix(normaliseGcsKeyPrefix(prefix))}`
  }
  return buildRawCsvPrefix(prefix)
}

/**
 * The key prefix of everything a run writes: `{prefix/}raw-csv/` (#1388).
 *
 * Narrows the resume LIST to the tree actually being written — with no prefix
 * at all, listing from the bucket root would enumerate every snapshot and
 * analytics object too — and keeps the warmed key set aligned with the keys
 * `buildCsvPath` composes.
 */
export function buildRawCsvPrefix(prefix: string): string {
  const base = normalisePathPrefix(prefix)
  return base === '' ? 'raw-csv/' : `${base}/raw-csv/`
}

/** Join a normalised prefix to a relative key without an empty segment. */
function joinPrefix(prefix: string, rest: string): string {
  const base = normalisePathPrefix(prefix)
  return base === '' ? rest : `${base}/${rest}`
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
    return joinPrefix(prefix, `raw-csv/${dateStr}/${csvType}.csv`)
  }

  if (!districtId) {
    throw new Error(`districtId is required for CSV type: ${csvType}`)
  }
  return joinPrefix(
    prefix,
    `raw-csv/${dateStr}/district-${districtId}/${csvType}.csv`
  )
}

/**
 * Build the storage path for a date's metadata.json.
 *
 * @param prefix  Root cache directory or GCS prefix
 * @param date    Date as YYYY-MM-DD string or Date object
 */
export function buildMetadataPath(prefix: string, date: string | Date): string {
  const dateStr = typeof date === 'string' ? date : toYYYYMMDD(date)
  return joinPrefix(prefix, `raw-csv/${dateStr}/metadata.json`)
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
