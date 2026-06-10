/**
 * Scraped record type for raw CSV data.
 *
 * This type represents a single row from a CSV file with column names as keys
 * and cell values as strings, numbers, or null — plus, on `clubPerformance`
 * rows matched in the public Find-A-Club registry, the merger's enrichment
 * values (#429/#431). It is used to preserve raw CSV data from the
 * Toastmasters dashboard collector for frontend consumption.
 *
 * The raw CSV arrays are required by the frontend's `extractDivisionPerformance`
 * function to calculate division/area status and recognition levels.
 *
 * @module scraped-record
 * @see Requirements 2.4
 */

/**
 * Find-A-Club coordinates enrichment written onto matched clubPerformance
 * rows by the collector's FindAClubMerger (#429/#431, contract: #1123).
 */
export interface ScrapedRecordCoordinates {
  lat: number
  lng: number
}

/**
 * Find-A-Club address enrichment written onto matched clubPerformance
 * rows by the collector's FindAClubMerger (#429/#431, contract: #1123).
 */
export interface ScrapedRecordAddress {
  street?: string
  city?: string
  /** State / province (e.g. 'ON', 'CA'). */
  region?: string
  postalCode?: string
  country?: string
}

/**
 * A cell value in a scraped record. CSV cells are strings, numbers, or
 * null; rows matched in the Find-A-Club registry additionally carry the
 * merger's enrichment values — booleans (`allowsVirtualAttendance`,
 * `isProspective`) and the two object shapes above (#1123, ADR-010).
 */
export type ScrapedRecordValue =
  | string
  | number
  | boolean
  | null
  | ScrapedRecordCoordinates
  | ScrapedRecordAddress

/**
 * A single record from scraped CSV data.
 *
 * Represents one row from a CSV file with column names as keys. Rows in
 * `clubPerformance` may be FAC-enriched (see {@link ScrapedRecordValue}).
 *
 * @example
 * ```typescript
 * const record: ScrapedRecord = {
 *   'Club Number': '12345',
 *   'Club Name': 'Example Club',
 *   'Active Members': 25,
 *   'Goals Met': 7,
 *   'Club Status': 'Active',
 *   'Club Distinguished Status': null,
 *   coordinates: { lat: 44.2, lng: -76.5 },
 *   allowsVirtualAttendance: true
 * }
 * ```
 */
export type ScrapedRecord = Record<string, ScrapedRecordValue>
