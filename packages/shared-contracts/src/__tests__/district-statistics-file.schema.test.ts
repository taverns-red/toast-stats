/**
 * Unit tests for DistrictStatisticsFile Zod schema validation.
 *
 * These tests verify that the Zod schemas correctly validate:
 * - ScrapedRecord objects with valid value types (string, number, null)
 * - ScrapedRecord objects with invalid value types (object, array, boolean)
 * - DistrictStatisticsFile objects with required raw data fields
 *
 * **Validates: Requirements 2.5, 5.1, 5.2, 5.3**
 *
 * @module district-statistics-file.schema.test
 */

import { describe, it, expect } from 'vitest'
import {
  ScrapedRecordSchema,
  DistrictStatisticsFileSchema,
  ClubStatisticsFileSchema,
  DivisionStatisticsFileSchema,
  AreaStatisticsFileSchema,
  DistrictTotalsFileSchema,
  ProspectiveClubSchema,
} from '../schemas/district-statistics-file.schema.js'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a valid DistrictTotalsFile object for testing.
 */
function createValidDistrictTotals() {
  return {
    totalClubs: 50,
    totalMembership: 1000,
    totalPayments: 500,
    distinguishedClubs: 10,
    selectDistinguishedClubs: 5,
    presidentDistinguishedClubs: 3,
  }
}

/**
 * Creates a valid ClubStatisticsFile object (required fields only).
 */
function createValidClub() {
  return {
    clubId: '00012345',
    clubName: 'Test Club',
    divisionId: 'A',
    areaId: '1',
    membershipCount: 25,
    paymentsCount: 30,
    dcpGoals: 7,
    status: 'Active',
    divisionName: 'Division A',
    areaName: 'Area 1',
    octoberRenewals: 20,
    aprilRenewals: 5,
    newMembers: 3,
    membershipBase: 20,
  }
}

/**
 * Creates a valid DistrictStatisticsFile object for testing.
 */
function createValidDistrictStatisticsFile() {
  return {
    districtId: '42',
    snapshotDate: '2024-01-15',
    clubs: [],
    divisions: [],
    areas: [],
    totals: createValidDistrictTotals(),
    divisionPerformance: [],
    clubPerformance: [],
    districtPerformance: [],
  }
}

// ============================================================================
// ScrapedRecord Validation Tests (validates Property 3)
// ============================================================================

describe('ScrapedRecordSchema validation', () => {
  describe('valid ScrapedRecord values', () => {
    /**
     * **Validates: Requirements 5.3**
     *
     * THE validation SHALL ensure each ScrapedRecord contains only
     * string, number, or null values.
     */
    it('should accept ScrapedRecord with string values', () => {
      const record = {
        'Club Name': 'Test Club',
        Division: 'A',
        Area: '1',
        'Club Status': 'Active',
        'Club Distinguished Status': 'Distinguished',
      }

      const result = ScrapedRecordSchema.safeParse(record)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(record)
      }
    })

    it('should accept ScrapedRecord with number values', () => {
      const record = {
        'Club Number': 12345,
        'Goals Met': 7,
        'Active Members': 25,
        'Mem. Base': 20,
        'Division Club Base': 5,
        'Area Club Base': 3,
      }

      const result = ScrapedRecordSchema.safeParse(record)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(record)
      }
    })

    it('should accept ScrapedRecord with null values', () => {
      const record = {
        'Club Name': 'Test Club',
        'Charter Date': null,
        'Error Message': null,
        'Optional Field': null,
      }

      const result = ScrapedRecordSchema.safeParse(record)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(record)
      }
    })

    it('should accept ScrapedRecord with mixed string, number, and null values', () => {
      const record = {
        'Club Name': 'Test Club',
        'Club Number': 12345,
        Division: 'A',
        'Goals Met': 7,
        'Charter Date': null,
        'Nov Visit award': '1',
        'May visit award': null,
        'Division Club Base': 5,
      }

      const result = ScrapedRecordSchema.safeParse(record)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(record)
      }
    })

    it('should accept ScrapedRecord with FAC enrichment values (booleans, coordinates, address) (#1123)', () => {
      const record = {
        'Club Number': '00003045',
        'Club Name': 'Limestone City Club',
        allowsVirtualAttendance: true,
        isProspective: false,
        coordinates: { lat: 44.23, lng: -76.48 },
        address: {
          street: '120 Clergy St E',
          city: 'Kingston',
          region: 'ON',
          postalCode: 'K7K 3S3',
          country: 'Canada',
        },
      }

      const result = ScrapedRecordSchema.safeParse(record)

      expect(result.success).toBe(true)
      if (result.success) {
        // The union must preserve the object values verbatim (no stripping).
        expect(result.data['coordinates']).toEqual(record.coordinates)
        expect(result.data['address']).toEqual(record.address)
      }
    })

    it('should accept empty ScrapedRecord', () => {
      const record = {}

      const result = ScrapedRecordSchema.safeParse(record)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(record)
      }
    })
  })

  describe('invalid ScrapedRecord values', () => {
    /**
     * **Validates: Requirements 5.2, 5.3**
     *
     * WHEN a raw data field contains invalid data, THE validation SHALL
     * fail with a descriptive error message.
     */
    it('should reject ScrapedRecord with an arbitrary (non-FAC-shaped) object value', () => {
      // Booleans and the two FAC enrichment shapes are valid since #1123
      // (ADR-010); any OTHER object shape must still fail. The FAC schemas
      // are strict precisely so this stays false — an all-optional
      // non-strict address schema would swallow any object.
      const record = {
        'Club Name': 'Test Club',
        'Nested Object': { key: 'value' },
      }

      const result = ScrapedRecordSchema.safeParse(record)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBeDefined()
        // Error should indicate the invalid value type
        expect(result.error.issues.length).toBeGreaterThan(0)
      }
    })

    it('should reject ScrapedRecord with array value', () => {
      const record = {
        'Club Name': 'Test Club',
        'Array Field': ['item1', 'item2'],
      }

      const result = ScrapedRecordSchema.safeParse(record)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBeDefined()
        expect(result.error.issues.length).toBeGreaterThan(0)
      }
    })

    it('should reject ScrapedRecord with undefined value', () => {
      const record = {
        'Club Name': 'Test Club',
        'Undefined Field': undefined,
      }

      const result = ScrapedRecordSchema.safeParse(record)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBeDefined()
        expect(result.error.issues.length).toBeGreaterThan(0)
      }
    })

    it('should reject ScrapedRecord with nested array of objects', () => {
      const record = {
        'Club Name': 'Test Club',
        'Complex Field': [{ nested: 'object' }],
      }

      const result = ScrapedRecordSchema.safeParse(record)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBeDefined()
        expect(result.error.issues.length).toBeGreaterThan(0)
      }
    })

    it('should reject ScrapedRecord with function value', () => {
      const record = {
        'Club Name': 'Test Club',
        'Function Field': () => 'test',
      }

      const result = ScrapedRecordSchema.safeParse(record)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBeDefined()
        expect(result.error.issues.length).toBeGreaterThan(0)
      }
    })
  })
})

// ============================================================================
// DistrictStatisticsFile Validation Tests
// ============================================================================

describe('DistrictStatisticsFileSchema validation', () => {
  describe('valid DistrictStatisticsFile', () => {
    /**
     * **Validates: Requirements 5.1**
     *
     * WHEN validating district statistics files, THE Zod schema SHALL
     * require the raw data fields to be present.
     */
    it('should accept DistrictStatisticsFile with all required fields including raw arrays', () => {
      const data = createValidDistrictStatisticsFile()

      const result = DistrictStatisticsFileSchema.safeParse(data)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.divisionPerformance).toEqual([])
        expect(result.data.clubPerformance).toEqual([])
        expect(result.data.districtPerformance).toEqual([])
      }
    })

    it('should accept DistrictStatisticsFile with populated raw arrays', () => {
      const data = {
        ...createValidDistrictStatisticsFile(),
        divisionPerformance: [
          {
            Division: 'A',
            Area: '1',
            'Club Name': 'Test Club',
            'Division Club Base': 5,
            'Area Club Base': 3,
            'Nov Visit award': '1',
            'May visit award': null,
          },
        ],
        clubPerformance: [
          {
            'Club Number': 12345,
            'Club Name': 'Test Club',
            'Club Status': 'Active',
            'Club Distinguished Status': 'Distinguished',
            'Goals Met': 7,
          },
        ],
        districtPerformance: [
          {
            'District Number': '42',
            'Total Clubs': 50,
            'Total Members': 1000,
          },
        ],
      }

      const result = DistrictStatisticsFileSchema.safeParse(data)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.divisionPerformance).toHaveLength(1)
        expect(result.data.clubPerformance).toHaveLength(1)
        expect(result.data.districtPerformance).toHaveLength(1)
      }
    })
  })

  describe('missing raw data fields', () => {
    /**
     * **Validates: Requirements 5.1, 5.2**
     *
     * WHEN validating district statistics files, THE Zod schema SHALL
     * require the raw data fields to be present.
     * WHEN a raw data field contains invalid data, THE validation SHALL
     * fail with a descriptive error message.
     */
    it('should reject DistrictStatisticsFile with missing divisionPerformance field', () => {
      const data = createValidDistrictStatisticsFile()
      const { divisionPerformance, ...dataWithoutDivisionPerformance } = data

      const result = DistrictStatisticsFileSchema.safeParse(
        dataWithoutDivisionPerformance
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBeDefined()
        // Error should mention the missing field
        const errorMessage = result.error.message.toLowerCase()
        expect(errorMessage).toContain('divisionperformance')
      }
    })

    it('should reject DistrictStatisticsFile with missing clubPerformance field', () => {
      const data = createValidDistrictStatisticsFile()
      const { clubPerformance, ...dataWithoutClubPerformance } = data

      const result = DistrictStatisticsFileSchema.safeParse(
        dataWithoutClubPerformance
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBeDefined()
        // Error should mention the missing field
        const errorMessage = result.error.message.toLowerCase()
        expect(errorMessage).toContain('clubperformance')
      }
    })

    it('should reject DistrictStatisticsFile with missing districtPerformance field', () => {
      const data = createValidDistrictStatisticsFile()
      const { districtPerformance, ...dataWithoutDistrictPerformance } = data

      const result = DistrictStatisticsFileSchema.safeParse(
        dataWithoutDistrictPerformance
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBeDefined()
        // Error should mention the missing field
        const errorMessage = result.error.message.toLowerCase()
        expect(errorMessage).toContain('districtperformance')
      }
    })

    it('should reject DistrictStatisticsFile with all raw data fields missing', () => {
      const data = createValidDistrictStatisticsFile()
      const {
        divisionPerformance,
        clubPerformance,
        districtPerformance,
        ...dataWithoutRawFields
      } = data

      const result =
        DistrictStatisticsFileSchema.safeParse(dataWithoutRawFields)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThanOrEqual(3)
      }
    })
  })

  describe('invalid raw data field types', () => {
    /**
     * **Validates: Requirements 5.2**
     *
     * WHEN a raw data field contains invalid data, THE validation SHALL
     * fail with a descriptive error message.
     */
    it('should reject DistrictStatisticsFile with divisionPerformance as string', () => {
      const data = {
        ...createValidDistrictStatisticsFile(),
        divisionPerformance: 'not an array',
      }

      const result = DistrictStatisticsFileSchema.safeParse(data)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBeDefined()
      }
    })

    it('should reject DistrictStatisticsFile with clubPerformance as object', () => {
      const data = {
        ...createValidDistrictStatisticsFile(),
        clubPerformance: { key: 'value' },
      }

      const result = DistrictStatisticsFileSchema.safeParse(data)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBeDefined()
      }
    })

    it('should reject DistrictStatisticsFile with districtPerformance as null', () => {
      const data = {
        ...createValidDistrictStatisticsFile(),
        districtPerformance: null,
      }

      const result = DistrictStatisticsFileSchema.safeParse(data)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBeDefined()
      }
    })

    it('should reject DistrictStatisticsFile with raw array containing invalid records', () => {
      const data = {
        ...createValidDistrictStatisticsFile(),
        divisionPerformance: [
          {
            'Club Name': 'Valid Club',
            'Invalid Field': { nested: 'object' }, // Invalid: object value
          },
        ],
      }

      const result = DistrictStatisticsFileSchema.safeParse(data)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBeDefined()
      }
    })
  })

  // ============================================================================
  // ProspectiveClubs field tests (#489)
  // ============================================================================

  describe('prospectiveClubs (#489)', () => {
    it('should accept DistrictStatisticsFile without prospectiveClubs (back-compat)', () => {
      const data = createValidDistrictStatisticsFile()
      const result = DistrictStatisticsFileSchema.safeParse(data)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.prospectiveClubs).toBeUndefined()
      }
    })

    it('should accept DistrictStatisticsFile with a populated prospectiveClubs array', () => {
      const data = {
        ...createValidDistrictStatisticsFile(),
        prospectiveClubs: [
          {
            clubId: '00088888',
            clubName: 'New ATO Toastmasters',
            charterDate: '2026-02-01',
            city: 'Ottawa',
            region: 'ON',
            country: 'Canada',
            isProspective: true,
          },
        ],
      }
      const result = DistrictStatisticsFileSchema.safeParse(data)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.prospectiveClubs).toHaveLength(1)
        expect(result.data.prospectiveClubs?.[0]?.clubId).toBe('00088888')
      }
    })

    it('should reject DistrictStatisticsFile with prospectiveClubs missing required clubId', () => {
      const data = {
        ...createValidDistrictStatisticsFile(),
        prospectiveClubs: [{ clubName: 'No-id Club' }],
      }
      const result = DistrictStatisticsFileSchema.safeParse(data)
      expect(result.success).toBe(false)
    })
  })

  // ============================================================================
  // ClubStatisticsFile dcpGoalsAchieved field tests (#1143)
  // ============================================================================

  describe('ClubStatisticsFileSchema — dcpGoalsAchieved (#1143)', () => {
    // Silent-strip class (ADR-010, audit §9a): dcpGoalsAchieved is declared on
    // the ClubStatisticsFile interface and written by DataTransformer
    // (computeDcpGoalsAchieved, #1118) but was absent from the schema, so a
    // validating parse silently STRIPPED it from every .clubs[] row.
    it('preserves dcpGoalsAchieved on a parsed club (no silent strip)', () => {
      const club = {
        ...createValidClub(),
        dcpGoalsAchieved: [
          true,
          false,
          true,
          false,
          true,
          false,
          true,
          false,
          false,
          false,
        ],
      }
      const res = ClubStatisticsFileSchema.safeParse(club)
      expect(res.success).toBe(true)
      if (res.success) {
        // Keyed access (not dotted) so this test type-checks at the Red step,
        // before the schema's inferred type carries the new field.
        const parsed = res.data as Record<string, unknown>
        expect(parsed['dcpGoalsAchieved']).toEqual(club.dcpGoalsAchieved)
      }
    })

    it('accepts a club that omits dcpGoalsAchieved (dormant snapshots)', () => {
      const res = ClubStatisticsFileSchema.safeParse(createValidClub())
      expect(res.success).toBe(true)
      if (res.success) {
        const parsed = res.data as Record<string, unknown>
        expect(parsed['dcpGoalsAchieved']).toBeUndefined()
      }
    })

    it('rejects a non-boolean-array dcpGoalsAchieved (keeps the contract falsifiable)', () => {
      const club = {
        ...createValidClub(),
        dcpGoalsAchieved: [1, 0, 1],
      }
      const res = ClubStatisticsFileSchema.safeParse(club)
      expect(res.success).toBe(false)
    })
  })

  describe('ProspectiveClubSchema validation', () => {
    it('should accept a club with only the required fields', () => {
      const result = ProspectiveClubSchema.safeParse({
        clubId: '00012345',
        clubName: 'Minimal Club',
      })
      expect(result.success).toBe(true)
    })

    it('should accept a club with all optional fields populated', () => {
      const result = ProspectiveClubSchema.safeParse({
        clubId: '00012345',
        clubName: 'Full Club',
        charterDate: '2026-01-15',
        city: 'Toronto',
        region: 'ON',
        country: 'Canada',
        meetingDay: 'Tuesday',
        meetingTime: '18:30',
        website: 'https://example.org',
        email: 'club@example.org',
        isProspective: true,
      })
      expect(result.success).toBe(true)
    })

    it('should reject a club without clubId', () => {
      const result = ProspectiveClubSchema.safeParse({ clubName: 'No-id' })
      expect(result.success).toBe(false)
    })

    it('should reject a club without clubName', () => {
      const result = ProspectiveClubSchema.safeParse({ clubId: '00012345' })
      expect(result.success).toBe(false)
    })
  })
})
