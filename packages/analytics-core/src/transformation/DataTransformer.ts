/**
 * DataTransformer - Transforms raw CSV data into snapshot format.
 *
 * This module extracts the transformation logic from the backend's
 * DataNormalizer and SnapshotBuilder services, making it usable by
 * both collector-cli and backend.
 *
 * Requirements: 2.2, 1.1
 * - Uses the same transformation logic as the Backend
 * - Transforms raw CSV data into snapshots
 */

import type {
  IDataTransformer,
  RawCSVData,
  DistrictStatistics,
  ClubStatistics,
  DivisionStatistics,
  AreaStatistics,
  DistrictTotals,
  Snapshot,
  SnapshotMetadata,
} from '../interfaces.js'
import type { ScrapedRecord } from '@toastmasters/shared-contracts'
import { computeDcpGoalsAchieved } from '../analytics/dcpGoalDefinitions.js'
import { ANALYTICS_SCHEMA_VERSION } from '../version.js'

/**
 * Logger interface for dependency injection.
 * Allows for flexible logging implementations in production and testing.
 */
export interface Logger {
  info(message: string, data?: unknown): void
  warn(message: string, data?: unknown): void
  error(message: string, error?: Error | unknown): void
  debug(message: string, data?: unknown): void
}

/**
 * Default no-op logger for when no logger is provided.
 */
const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

/**
 * Configuration options for DataTransformer.
 */
export interface DataTransformerConfig {
  /** Optional logger for diagnostic output */
  logger?: Logger
}

/**
 * Parsed CSV record with dynamic columns.
 * Uses ScrapedRecord from shared-contracts for type consistency.
 */
type ParsedRecord = ScrapedRecord

/**
 * DataTransformer transforms raw CSV data from the Toastmasters dashboard
 * into the structured snapshot format used for analytics computation.
 *
 * This class implements the same algorithms as the backend's DataNormalizer
 * and SnapshotBuilder services, ensuring consistent transformation results.
 */
export class DataTransformer implements IDataTransformer {
  private readonly logger: Logger

  constructor(config: DataTransformerConfig = {}) {
    this.logger = config.logger ?? noopLogger
  }

  /**
   * Transforms raw CSV data into district statistics.
   *
   * @param date - The snapshot date (YYYY-MM-DD)
   * @param districtId - The district identifier
   * @param csvData - Raw CSV data from Toastmasters dashboard
   * @returns Promise resolving to transformed district statistics
   */
  async transformRawCSV(
    date: string,
    districtId: string,
    csvData: RawCSVData
  ): Promise<DistrictStatistics> {
    this.logger.info('Transforming raw CSV data', { date, districtId })

    const clubPerformance = this.parseCSVRows(csvData.clubPerformance ?? [])
    const divisionPerformance = this.parseCSVRows(
      csvData.divisionPerformance ?? []
    )
    const districtPerformance = this.parseCSVRows(
      csvData.districtPerformance ?? []
    )

    // Extract clubs from club performance data, merging payment fields from district performance
    const clubs = this.extractClubs(clubPerformance, districtPerformance)

    // Extract divisions from division performance data
    const divisions = this.extractDivisions(divisionPerformance)

    // Extract areas from club performance data (clubs contain area info)
    const areas = this.extractAreas(clubPerformance)

    // Calculate district totals
    const totals = this.calculateTotals(clubs, districtPerformance)

    const districtStats: DistrictStatistics = {
      districtId,
      snapshotDate: date,
      clubs,
      divisions,
      areas,
      totals,
      // Include raw CSV arrays for frontend consumption
      // These are required for division/area status and recognition level calculations
      clubPerformance,
      divisionPerformance,
      districtPerformance,
    }

    this.logger.info('CSV transformation complete', {
      date,
      districtId,
      clubCount: clubs.length,
      divisionCount: divisions.length,
      areaCount: areas.length,
    })

    return districtStats
  }

  /**
   * Creates a complete snapshot from multiple district statistics.
   *
   * @param date - The snapshot date (YYYY-MM-DD)
   * @param districts - Array of district statistics
   * @returns Promise resolving to the complete snapshot
   */
  async createSnapshot(
    date: string,
    districts: DistrictStatistics[]
  ): Promise<Snapshot> {
    this.logger.info('Creating snapshot', {
      date,
      districtCount: districts.length,
    })

    const metadata: SnapshotMetadata = {
      snapshotDate: date,
      createdAt: new Date().toISOString(),
      districtCount: districts.length,
      version: ANALYTICS_SCHEMA_VERSION,
    }

    const snapshot: Snapshot = {
      metadata,
      districts,
    }

    this.logger.info('Snapshot created', {
      snapshotDate: date,
      districtCount: districts.length,
      version: ANALYTICS_SCHEMA_VERSION,
    })

    return snapshot
  }

  /**
   * Parses CSV rows into record objects.
   * First row is treated as headers.
   *
   * @param rows - Array of CSV rows (each row is an array of values)
   * @returns Array of parsed records
   */
  private parseCSVRows(rows: string[][]): ParsedRecord[] {
    if (rows.length < 2) {
      return []
    }

    const headers = rows[0]
    if (!headers) {
      return []
    }

    const records: ParsedRecord[] = []

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row) continue

      // Filter out footer rows containing "Month of"
      const hasMonthOf = row.some(
        value => typeof value === 'string' && value.includes('Month of')
      )
      if (hasMonthOf) continue

      const record: ParsedRecord = {}
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j]
        const value = row[j]
        if (header !== undefined) {
          record[header] = value ?? null
        }
      }
      records.push(record)
    }

    return records
  }

  /**
   * Extracts club statistics from club performance records.
   *
   * @param clubPerformance - Array of club performance records
   * @returns Array of club statistics
   */
  private extractClubs(
    clubPerformance: ParsedRecord[],
    districtPerformance: ParsedRecord[]
  ): ClubStatistics[] {
    const clubs: ClubStatistics[] = []

    // Build lookup map from districtPerformance records keyed by normalized club ID
    const dpLookup = this.buildDistrictPerformanceLookup(districtPerformance)

    for (const record of clubPerformance) {
      const clubId = this.extractString(record, 'Club Number', 'ClubId', 'Club')
      const clubName = this.extractString(
        record,
        'Club Name',
        'ClubName',
        'Name'
      )

      if (!clubId || !clubName) {
        continue
      }

      // Extract division ID and name
      const divisionRaw = this.extractString(record, 'Division', 'Div') ?? ''
      const { id: divisionId, name: divisionName } =
        this.parseDivision(divisionRaw)

      // Extract area ID and name
      const areaRaw = this.extractString(record, 'Area') ?? ''
      const { id: areaId, name: areaName } = this.parseArea(areaRaw)

      // Look up matching districtPerformance record by normalized club ID
      const normalizedId = this.normalizeClubId(clubId)
      const dpRecord = dpLookup.get(normalizedId)

      // Source payment/renewal fields from districtPerformance when available,
      // falling back to clubPerformance record
      const paymentSource = dpRecord ?? record

      const club: ClubStatistics = {
        clubId,
        clubName,
        divisionId,
        areaId,
        divisionName: divisionName || 'Unknown Division',
        areaName: areaName || 'Unknown Area',
        membershipCount: this.extractNumber(
          record,
          'Active Members',
          'Membership',
          'Members'
        ),
        paymentsCount: this.extractNumber(
          paymentSource,
          'Total to Date',
          'Payments',
          'Total'
        ),
        dcpGoals: this.extractNumber(record, 'Goals Met', 'DCP Goals', 'Goals'),
        dcpGoalsAchieved:
          record['Level 1s'] != null && record['Level 1s'] !== ''
            ? computeDcpGoalsAchieved(record)
            : undefined,
        status: this.extractClubStatus(record),
        // Payment breakdown fields - sourced from districtPerformance when available
        octoberRenewals: this.extractNumber(
          paymentSource,
          'Oct. Ren.',
          'Oct. Ren',
          'October Renewals',
          'Oct Ren'
        ),
        aprilRenewals: this.extractNumber(
          paymentSource,
          'Apr. Ren.',
          'Apr. Ren',
          'April Renewals',
          'Apr Ren'
        ),
        newMembers: this.extractNumber(paymentSource, 'New Members', 'New'),
        // Membership base for net growth calculation
        membershipBase: this.extractNumber(
          record,
          'Mem. Base',
          'Membership Base',
          'Base'
        ),
      }

      const charterDate = this.extractString(
        record,
        'Charter Date',
        'Chartered'
      )
      if (charterDate) {
        club.charterDate = charterDate
      }

      // Extract club operational status (Active, Suspended, Low, Ineligible)
      const clubStatus = this.extractString(record, 'Club Status', 'Status')
      if (clubStatus) {
        club.clubStatus = clubStatus
      }

      // Extract CSP (Club Success Plan) submission status
      // Present from 2025-2026 program year onward; undefined for earlier CSVs
      const cspValue = this.extractString(record, 'CSP', 'Club Success Plan')
      if (cspValue !== undefined) {
        const normalized = cspValue.toLowerCase().trim()
        club.cspSubmitted = normalized === 'yes' || normalized === 'y'
      }

      clubs.push(club)
    }

    return clubs
  }

  /**
   * Normalizes a club ID by stripping leading zeros.
   * If the result would be empty (all-zeros input like "0000"),
   * preserves the original value.
   *
   * @param clubId - The raw club ID string
   * @returns The normalized club ID
   */
  private normalizeClubId(clubId: string): string {
    const stripped = clubId.replace(/^0+/, '')
    return stripped === '' ? clubId : stripped
  }

  /**
   * Builds a lookup map from districtPerformance records keyed by normalized club ID.
   * Tries column names 'Club', 'Club Number', or 'Club ID' to extract the club identifier.
   * Records without a valid club ID are skipped.
   *
   * @param districtPerformance - Parsed records from district-performance.csv
   * @returns Map of normalized club ID to ParsedRecord
   */
  private buildDistrictPerformanceLookup(
    districtPerformance: ParsedRecord[]
  ): Map<string, ParsedRecord> {
    const lookup = new Map<string, ParsedRecord>()

    for (const record of districtPerformance) {
      const rawClubId = this.extractString(
        record,
        'Club',
        'Club Number',
        'Club ID'
      )
      if (rawClubId === undefined || rawClubId === '') {
        continue
      }

      const normalizedId = this.normalizeClubId(rawClubId)
      lookup.set(normalizedId, record)
    }

    return lookup
  }

  /**
   * Parses a division field value to extract ID and name.
   * Handles formats like "Division A" or just "A".
   *
   * @param value - The raw field value
   * @returns Object with id and name
   */
  private parseDivision(value: string): { id: string; name: string } {
    if (!value) {
      return { id: '', name: '' }
    }

    // Check if it's in format "Division X"
    const divisionMatch = value.match(/^Division\s+(\S.*)$/i)
    if (divisionMatch?.[1]) {
      return { id: divisionMatch[1], name: value }
    }

    // Otherwise, use the value as ID and construct the name
    return { id: value, name: `Division ${value}` }
  }

  /**
   * Parses an area field value to extract ID and name.
   * Handles formats like "Area 12" or just "12".
   *
   * @param value - The raw field value
   * @returns Object with id and name
   */
  private parseArea(value: string): { id: string; name: string } {
    if (!value) {
      return { id: '', name: '' }
    }

    // Check if it's in format "Area Y"
    const areaMatch = value.match(/^Area\s+(\S.*)$/i)
    if (areaMatch?.[1]) {
      return { id: areaMatch[1], name: value }
    }

    // Otherwise, use the value as ID and construct the name
    return { id: value, name: `Area ${value}` }
  }

  /**
   * Extracts division statistics from division performance records.
   *
   * @param divisionPerformance - Array of division performance records
   * @returns Array of division statistics
   */
  private extractDivisions(
    divisionPerformance: ParsedRecord[]
  ): DivisionStatistics[] {
    const divisionMap = new Map<string, DivisionStatistics>()

    for (const record of divisionPerformance) {
      const divisionId = this.extractString(record, 'Division', 'Div')
      if (!divisionId) continue

      const existing = divisionMap.get(divisionId)
      if (existing) {
        // Aggregate values
        existing.clubCount += this.extractNumber(record, 'Club Count', 'Clubs')
        existing.membershipTotal += this.extractNumber(
          record,
          'Membership',
          'Members',
          'Active Members'
        )
        existing.paymentsTotal += this.extractNumber(
          record,
          'Total to Date',
          'Payments'
        )
      } else {
        divisionMap.set(divisionId, {
          divisionId,
          divisionName:
            this.extractString(record, 'Division Name', 'Name') ?? divisionId,
          clubCount: this.extractNumber(record, 'Club Count', 'Clubs'),
          membershipTotal: this.extractNumber(
            record,
            'Membership',
            'Members',
            'Active Members'
          ),
          paymentsTotal: this.extractNumber(
            record,
            'Total to Date',
            'Payments'
          ),
        })
      }
    }

    return Array.from(divisionMap.values())
  }

  /**
   * Extracts area statistics from club performance records.
   * Areas are derived from club data since clubs contain area information.
   *
   * @param clubPerformance - Array of club performance records
   * @returns Array of area statistics
   */
  private extractAreas(clubPerformance: ParsedRecord[]): AreaStatistics[] {
    const areaMap = new Map<string, AreaStatistics>()

    for (const record of clubPerformance) {
      const areaId = this.extractString(record, 'Area')
      const divisionId = this.extractString(record, 'Division', 'Div')

      if (!areaId) continue

      const key = `${divisionId ?? ''}-${areaId}`
      const existing = areaMap.get(key)

      if (existing) {
        existing.clubCount += 1
        existing.membershipTotal += this.extractNumber(
          record,
          'Active Members',
          'Membership',
          'Members'
        )
        existing.paymentsTotal += this.extractNumber(
          record,
          'Total to Date',
          'Payments'
        )
      } else {
        areaMap.set(key, {
          areaId,
          areaName: `Area ${areaId}`,
          divisionId: divisionId ?? '',
          clubCount: 1,
          membershipTotal: this.extractNumber(
            record,
            'Active Members',
            'Membership',
            'Members'
          ),
          paymentsTotal: this.extractNumber(
            record,
            'Total to Date',
            'Payments'
          ),
        })
      }
    }

    return Array.from(areaMap.values())
  }

  /**
   * Calculates district totals from club data and district performance.
   *
   * @param clubs - Array of club statistics
   * @param districtPerformance - Array of district performance records
   * @returns District totals
   */
  private calculateTotals(
    clubs: ClubStatistics[],
    districtPerformance: ParsedRecord[]
  ): DistrictTotals {
    // Calculate from clubs
    const totalClubs = clubs.length
    const totalMembership = clubs.reduce(
      (sum, club) => sum + club.membershipCount,
      0
    )
    const totalPayments = clubs.reduce(
      (sum, club) => sum + club.paymentsCount,
      0
    )

    // Count distinguished clubs by status
    let distinguishedClubs = 0
    let selectDistinguishedClubs = 0
    let presidentDistinguishedClubs = 0

    for (const club of clubs) {
      const status = club.status.toLowerCase()
      if (status.includes('president')) {
        presidentDistinguishedClubs++
        distinguishedClubs++
      } else if (status.includes('select')) {
        selectDistinguishedClubs++
        distinguishedClubs++
      } else if (status.includes('distinguished')) {
        distinguishedClubs++
      }
    }

    // Try to get totals from district performance if available
    if (districtPerformance.length > 0) {
      const districtRecord = districtPerformance[0]
      if (districtRecord) {
        const dcpDistinguished = this.extractNumber(
          districtRecord,
          'Distinguished Clubs',
          'Distinguished'
        )
        const dcpSelect = this.extractNumber(
          districtRecord,
          'Select Distinguished',
          'Select'
        )
        const dcpPresident = this.extractNumber(
          districtRecord,
          "President's Distinguished",
          'President'
        )

        // Use district performance values if they're higher (more accurate)
        if (dcpDistinguished > distinguishedClubs) {
          distinguishedClubs = dcpDistinguished
        }
        if (dcpSelect > selectDistinguishedClubs) {
          selectDistinguishedClubs = dcpSelect
        }
        if (dcpPresident > presidentDistinguishedClubs) {
          presidentDistinguishedClubs = dcpPresident
        }
      }
    }

    return {
      totalClubs,
      totalMembership,
      totalPayments,
      distinguishedClubs,
      selectDistinguishedClubs,
      presidentDistinguishedClubs,
    }
  }

  /**
   * Extracts club status from a record.
   *
   * @param record - The parsed record
   * @returns Club status string
   */
  private extractClubStatus(record: ParsedRecord): string {
    // Check for distinguished status first
    const distinguished = this.extractString(
      record,
      'Club Distinguished Status',
      'Distinguished Status',
      'Distinguished'
    )
    if (
      distinguished &&
      distinguished.toLowerCase().includes('distinguished')
    ) {
      return distinguished
    }

    // Fall back to general status
    const status = this.extractString(record, 'Club Status', 'Status')
    return status ?? 'Active'
  }

  /**
   * Extracts a string value from a record, trying multiple possible keys.
   *
   * @param record - The parsed record
   * @param keys - Possible keys to try
   * @returns The string value or undefined
   */
  private extractString(
    record: ParsedRecord,
    ...keys: string[]
  ): string | undefined {
    for (const key of keys) {
      const value = record[key]
      if (value !== null && value !== undefined) {
        return String(value).trim()
      }
    }
    return undefined
  }

  /**
   * Extracts a number value from a record, trying multiple possible keys.
   *
   * @param record - The parsed record
   * @param keys - Possible keys to try
   * @returns The number value or 0
   */
  private extractNumber(record: ParsedRecord, ...keys: string[]): number {
    for (const key of keys) {
      const value = record[key]
      if (value !== null && value !== undefined) {
        if (typeof value === 'number') {
          return value
        }
        const parsed = parseInt(String(value), 10)
        if (!isNaN(parsed)) {
          return parsed
        }
      }
    }
    return 0
  }
}
