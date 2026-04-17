/**
 * Collector Types
 *
 * Type definitions shared between the collector and other components.
 * These types are extracted from the backend to enable standalone operation.
 *
 * Requirements:
 * - 8.3: THE ToastmastersCollector class SHALL be moved to the Collector_CLI package
 * - 5.1: THE Collector_CLI SHALL operate without requiring the backend to be running
 */

/**
 * Raw scraped data types (CSV records with dynamic columns)
 * This is the primary type for data returned from scraping operations.
 */
export type ScrapedRecord = Record<string, string | number | null>

/**
 * District information from dropdown
 */
export interface DistrictInfo {
  id: string
  name: string
}

/**
 * CSV file type enumeration for strongly-typed cache operations
 */
export enum CSVType {
  ALL_DISTRICTS = 'all-districts',
  DISTRICT_PERFORMANCE = 'district-performance',
  DIVISION_PERFORMANCE = 'division-performance',
  CLUB_PERFORMANCE = 'club-performance',
}

/**
 * Raw CSV performance data interfaces (from dashboard exports)
 */
export interface ClubPerformanceRecord {
  'Club Number': string
  'Club Name': string
  Division: string
  Area: string
  'Active Members': string
  'Goals Met': string
  'Club Status'?: string
  'Club Distinguished Status'?: string
  'Mem. Base'?: string
  Status?: string
  Membership?: string
  [key: string]: string | undefined
}

export interface DivisionPerformanceRecord {
  Division: string
  'Total Clubs': string
  'Total Members': string
  'Goals Met': string
  [key: string]: string | undefined
}

export interface DistrictPerformanceRecord {
  District: string
  'Total Clubs': string
  'Total Members': string
  'Goals Met': string
  'Distinguished Clubs': string
  [key: string]: string | undefined
}

/**
 * Raw CSV data from getAllDistricts API call
 */
export interface AllDistrictsCSVRecord {
  DISTRICT: string
  REGION: string
  'Paid Clubs': string
  'Paid Club Base': string
  '% Club Growth': string
  'Total YTD Payments': string
  'Payment Base': string
  '% Payment Growth': string
  'Active Clubs': string
  'Total Distinguished Clubs': string
  'Select Distinguished Clubs': string
  'Presidents Distinguished Clubs'?: string
  /** District Recognition Program prerequisites (Y/N) — added 2025-2026 (#329) */
  DSP?: string
  Training?: string
  'Market Analysis'?: string
  'Communication Plan'?: string
  'Region Advisor Visit'?: string
  /** Smedley Distinguished Clubs count — new tier for 2025-2026 (#329) */
  'Smedley Distinguished Clubs'?: string
  /** Payment breakdown columns (#327) */
  'New Payments'?: string
  'April Payments'?: string
  'October Payments'?: string
  'Late Payments'?: string
  'Charter Payments'?: string
  [key: string]: string | undefined
}

/**
 * Cache metadata interface for the collector
 */
export interface CacheMetadata {
  date: string
  isClosingPeriod?: boolean
  dataMonth?: string
}

/**
 * Interface for cache operations
 * This allows the collector to work with different cache implementations
 */
export interface ICollectorCache {
  getCachedCSV(
    date: string,
    type: CSVType,
    districtId?: string
  ): Promise<string | null>
  setCachedCSVWithMetadata(
    date: string,
    type: CSVType,
    csvContent: string,
    districtId?: string,
    additionalMetadata?: {
      requestedDate?: string
      isClosingPeriod?: boolean
      dataMonth?: string
    }
  ): Promise<void>
  getCacheMetadata(date: string): Promise<CacheMetadata | null>
}
