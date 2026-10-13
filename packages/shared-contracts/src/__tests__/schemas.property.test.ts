/**
 * Property-based tests for schema-type consistency and validation round-trip.
 *
 * @pbt-justification Warranted per .kiro/steering/testing.md criteria:
 *   - Mathematical invariant: schema round-trip (parse(serialize(x)) === x)
 *   - Complex input space: generated data across all schema types
 *
 * These tests verify that Zod schemas correctly accept valid objects
 * and reject invalid ones using fast-check for property-based testing.
 *
 * **Property 1: Schema-Type Consistency**
 * For any valid object conforming to a shared-contracts TypeScript interface,
 * the corresponding Zod schema SHALL parse the object without errors.
 * For any object missing required fields or with incorrect field types,
 * the schema SHALL reject it with a validation error.
 *
 * **Validates: Requirements 2.2, 2.3, 3.2, 3.3, 4.2, 4.3, 5.3, 6.3, 9.2**
 *
 * **Property 2: Validation Round-Trip**
 * For any valid file format object (PerDistrictData, AllDistrictsRankingsData,
 * SnapshotMetadataFile, SnapshotManifest), serializing to JSON string and then
 * parsing and validating SHALL return `success: true` with data structurally
 * equivalent to the original object.
 *
 * **Validates: Requirements 6.3, 6.4**
 *
 * @module schemas.property.test
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// Import schemas
import { PerDistrictDataSchema } from '../schemas/per-district-data.schema.js'
import { AllDistrictsRankingsDataSchema } from '../schemas/all-districts-rankings.schema.js'
import { SnapshotMetadataFileSchema } from '../schemas/snapshot-metadata.schema.js'
import { SnapshotManifestSchema } from '../schemas/snapshot-manifest.schema.js'
import {
  DistrictStatisticsFileSchema,
  ClubStatisticsFileSchema,
  DivisionStatisticsFileSchema,
  AreaStatisticsFileSchema,
  DistrictTotalsFileSchema,
} from '../schemas/district-statistics-file.schema.js'

// Import validation helpers for round-trip tests
import {
  validatePerDistrictData,
  validateAllDistrictsRankings,
  validateSnapshotMetadata,
  validateSnapshotManifest,
} from '../validation/validators.js'

// ============================================================================
// Fast-check Arbitraries for File Format Types
// ============================================================================

/**
 * Arbitrary for DistrictTotalsFile
 */
const districtTotalsArb = fc.record({
  totalClubs: fc.nat(),
  totalMembership: fc.nat(),
  totalPayments: fc.nat(),
  distinguishedClubs: fc.nat(),
  selectDistinguishedClubs: fc.nat(),
  presidentDistinguishedClubs: fc.nat(),
})

/**
 * Arbitrary for ClubStatisticsFile
 */
const clubStatisticsArb = fc.record({
  clubId: fc.string({ minLength: 1 }),
  clubName: fc.string({ minLength: 1 }),
  divisionId: fc.string({ minLength: 1 }),
  areaId: fc.string({ minLength: 1 }),
  membershipCount: fc.nat(),
  paymentsCount: fc.nat(),
  dcpGoals: fc.nat(),
  status: fc.string({ minLength: 1 }),
  charterDate: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  divisionName: fc.string({ minLength: 1 }),
  areaName: fc.string({ minLength: 1 }),
  octoberRenewals: fc.nat(),
  aprilRenewals: fc.nat(),
  newMembers: fc.nat(),
  membershipBase: fc.nat(),
  clubStatus: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
})

/**
 * Arbitrary for DivisionStatisticsFile
 */
const divisionStatisticsArb = fc.record({
  divisionId: fc.string({ minLength: 1 }),
  divisionName: fc.string({ minLength: 1 }),
  clubCount: fc.nat(),
  membershipTotal: fc.nat(),
  paymentsTotal: fc.nat(),
})

/**
 * Arbitrary for AreaStatisticsFile
 */
const areaStatisticsArb = fc.record({
  areaId: fc.string({ minLength: 1 }),
  areaName: fc.string({ minLength: 1 }),
  divisionId: fc.string({ minLength: 1 }),
  clubCount: fc.nat(),
  membershipTotal: fc.nat(),
  paymentsTotal: fc.nat(),
})

/**
 * Arbitrary for ScrapedRecord (raw CSV data record)
 * Values can be strings, numbers, or null
 */
const scrapedRecordArb = fc.dictionary(
  fc
    .string({ minLength: 1, maxLength: 20 })
    .filter(k => k !== '__proto__' && k !== 'constructor' && k !== 'prototype'),
  fc.oneof(
    fc.string({ minLength: 0, maxLength: 50 }),
    fc.integer(),
    fc.constant(null)
  )
)

/**
 * Arbitrary for DistrictStatisticsFile
 */
const districtStatisticsFileArb = fc.record({
  districtId: fc.string({ minLength: 1 }),
  snapshotDate: fc.string({ minLength: 1 }),
  clubs: fc.array(clubStatisticsArb, { maxLength: 5 }),
  divisions: fc.array(divisionStatisticsArb, { maxLength: 3 }),
  areas: fc.array(areaStatisticsArb, { maxLength: 5 }),
  totals: districtTotalsArb,
  divisionPerformance: fc.array(scrapedRecordArb, { maxLength: 3 }),
  clubPerformance: fc.array(scrapedRecordArb, { maxLength: 3 }),
  districtPerformance: fc.array(scrapedRecordArb, { maxLength: 3 }),
})

/**
 * Arbitrary for PerDistrictData
 */
const perDistrictDataArb = fc.record({
  districtId: fc.string({ minLength: 1 }),
  districtName: fc.string({ minLength: 1 }),
  collectedAt: fc.string({ minLength: 1 }),
  status: fc.constantFrom('success', 'failed') as fc.Arbitrary<
    'success' | 'failed'
  >,
  errorMessage: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  data: districtStatisticsFileArb,
})

/**
 * Arbitrary for DistrictRanking
 */
const districtRankingArb = fc.record({
  districtId: fc.string({ minLength: 1 }),
  districtName: fc.string({ minLength: 1 }),
  region: fc.string({ minLength: 1 }),
  paidClubs: fc.nat(),
  paidClubBase: fc.nat(),
  clubGrowthPercent: fc.float({ noNaN: true, noDefaultInfinity: true }),
  totalPayments: fc.nat(),
  paymentBase: fc.nat(),
  paymentGrowthPercent: fc.float({ noNaN: true, noDefaultInfinity: true }),
  activeClubs: fc.nat(),
  distinguishedClubs: fc.nat(),
  selectDistinguished: fc.nat(),
  presidentsDistinguished: fc.nat(),
  distinguishedPercent: fc.float({ noNaN: true, noDefaultInfinity: true }),
  clubsRank: fc.nat(),
  paymentsRank: fc.nat(),
  distinguishedRank: fc.nat(),
  aggregateScore: fc.nat(),
  overallRank: fc.nat(),
})

/**
 * Arbitrary for AllDistrictsRankingsMetadata
 */
const allDistrictsRankingsMetadataArb = fc.record({
  snapshotId: fc.string({ minLength: 1 }),
  calculatedAt: fc.string({ minLength: 1 }),
  schemaVersion: fc.string({ minLength: 1 }),
  calculationVersion: fc.string({ minLength: 1 }),
  rankingVersion: fc.string({ minLength: 1 }),
  sourceCsvDate: fc.string({ minLength: 1 }),
  csvFetchedAt: fc.string({ minLength: 1 }),
  totalDistricts: fc.nat(),
  fromCache: fc.boolean(),
})

/**
 * Arbitrary for AllDistrictsRankingsData
 */
const allDistrictsRankingsDataArb = fc.record({
  metadata: allDistrictsRankingsMetadataArb,
  rankings: fc.array(districtRankingArb, { maxLength: 5 }),
})

/**
 * Arbitrary for SnapshotMetadataFile
 */
const snapshotMetadataFileArb = fc.record({
  snapshotId: fc.string({ minLength: 1 }),
  createdAt: fc.string({ minLength: 1 }),
  schemaVersion: fc.string({ minLength: 1 }),
  calculationVersion: fc.string({ minLength: 1 }),
  status: fc.constantFrom('success', 'partial', 'failed') as fc.Arbitrary<
    'success' | 'partial' | 'failed'
  >,
  configuredDistricts: fc.array(fc.string({ minLength: 1 }), { maxLength: 5 }),
  successfulDistricts: fc.array(fc.string({ minLength: 1 }), { maxLength: 5 }),
  failedDistricts: fc.array(fc.string({ minLength: 1 }), { maxLength: 5 }),
  errors: fc.array(fc.string(), { maxLength: 3 }),
  processingDuration: fc.nat(),
  source: fc.string({ minLength: 1 }),
  dataAsOfDate: fc.string({ minLength: 1 }),
  isClosingPeriodData: fc.option(fc.boolean(), { nil: undefined }),
  collectionDate: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  logicalDate: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
})

/**
 * Arbitrary for DistrictManifestEntry
 */
const districtManifestEntryArb = fc.record({
  districtId: fc.string({ minLength: 1 }),
  fileName: fc.string({ minLength: 1 }),
  status: fc.constantFrom('success', 'failed') as fc.Arbitrary<
    'success' | 'failed'
  >,
  lastModified: fc.string({ minLength: 1 }),
  errorMessage: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
})

/**
 * Arbitrary for SnapshotManifest
 */
const snapshotManifestArb = fc.record({
  snapshotId: fc.string({ minLength: 1 }),
  createdAt: fc.string({ minLength: 1 }),
  districts: fc.array(districtManifestEntryArb, { maxLength: 5 }),
  totalDistricts: fc.nat(),
  successfulDistricts: fc.nat(),
  failedDistricts: fc.nat(),
  writeComplete: fc.option(fc.boolean(), { nil: undefined }),
  allDistrictsRankings: fc.option(
    fc.record({
      filename: fc.string({ minLength: 1 }),
      size: fc.nat(),
      status: fc.constantFrom('present', 'missing') as fc.Arbitrary<
        'present' | 'missing'
      >,
    }),
    { nil: undefined }
  ),
})

// ============================================================================
// Property Tests: Schema-Type Consistency
// ============================================================================

describe('Property 1: Schema-Type Consistency', () => {
  /**
   * Test configuration: minimum 100 iterations per steering requirements
   */
  const fcOptions = { numRuns: 100 }

  describe('PerDistrictData schema', () => {
    it('should accept all valid PerDistrictData objects', () => {
      fc.assert(
        fc.property(perDistrictDataArb, data => {
          const result = PerDistrictDataSchema.safeParse(data)
          expect(result.success).toBe(true)
        }),
        fcOptions
      )
    })

    it('should reject objects with missing required fields', () => {
      // Generate valid objects then remove a required field
      const requiredFields = [
        'districtId',
        'districtName',
        'collectedAt',
        'status',
        'data',
      ]

      for (const fieldToRemove of requiredFields) {
        fc.assert(
          fc.property(perDistrictDataArb, data => {
            const invalidData = { ...data }
            delete (invalidData as Record<string, unknown>)[fieldToRemove]
            const result = PerDistrictDataSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
          }),
          fcOptions
        )
      }
    })

    it('should reject objects with wrong field types', () => {
      fc.assert(
        fc.property(perDistrictDataArb, data => {
          // Replace districtId with a number (wrong type)
          const invalidData = { ...data, districtId: 12345 }
          const result = PerDistrictDataSchema.safeParse(invalidData)
          expect(result.success).toBe(false)
        }),
        fcOptions
      )
    })

    it('should reject objects with invalid enum values', () => {
      fc.assert(
        fc.property(perDistrictDataArb, data => {
          // Replace status with an invalid enum value
          const invalidData = { ...data, status: 'invalid_status' }
          const result = PerDistrictDataSchema.safeParse(invalidData)
          expect(result.success).toBe(false)
        }),
        fcOptions
      )
    })
  })

  describe('AllDistrictsRankingsData schema', () => {
    it('should accept all valid AllDistrictsRankingsData objects', () => {
      fc.assert(
        fc.property(allDistrictsRankingsDataArb, data => {
          const result = AllDistrictsRankingsDataSchema.safeParse(data)
          expect(result.success).toBe(true)
        }),
        fcOptions
      )
    })

    it('should reject objects with missing required fields', () => {
      const requiredFields = ['metadata', 'rankings']

      for (const fieldToRemove of requiredFields) {
        fc.assert(
          fc.property(allDistrictsRankingsDataArb, data => {
            const invalidData = { ...data }
            delete (invalidData as Record<string, unknown>)[fieldToRemove]
            const result = AllDistrictsRankingsDataSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
          }),
          fcOptions
        )
      }
    })

    it('should reject objects with wrong field types', () => {
      fc.assert(
        fc.property(allDistrictsRankingsDataArb, data => {
          // Replace rankings with a string (wrong type)
          const invalidData = { ...data, rankings: 'not an array' }
          const result = AllDistrictsRankingsDataSchema.safeParse(invalidData)
          expect(result.success).toBe(false)
        }),
        fcOptions
      )
    })

    it('should reject objects with invalid nested metadata', () => {
      fc.assert(
        fc.property(allDistrictsRankingsDataArb, data => {
          // Replace metadata.totalDistricts with a string (wrong type)
          const invalidData = {
            ...data,
            metadata: { ...data.metadata, totalDistricts: 'not a number' },
          }
          const result = AllDistrictsRankingsDataSchema.safeParse(invalidData)
          expect(result.success).toBe(false)
        }),
        fcOptions
      )
    })
  })

  describe('SnapshotMetadataFile schema', () => {
    it('should accept all valid SnapshotMetadataFile objects', () => {
      fc.assert(
        fc.property(snapshotMetadataFileArb, data => {
          const result = SnapshotMetadataFileSchema.safeParse(data)
          expect(result.success).toBe(true)
        }),
        fcOptions
      )
    })

    it('should reject objects with missing required fields', () => {
      const requiredFields = [
        'snapshotId',
        'createdAt',
        'schemaVersion',
        'calculationVersion',
        'status',
        'configuredDistricts',
        'successfulDistricts',
        'failedDistricts',
        'errors',
        'processingDuration',
        'source',
        'dataAsOfDate',
      ]

      for (const fieldToRemove of requiredFields) {
        fc.assert(
          fc.property(snapshotMetadataFileArb, data => {
            const invalidData = { ...data }
            delete (invalidData as Record<string, unknown>)[fieldToRemove]
            const result = SnapshotMetadataFileSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
          }),
          fcOptions
        )
      }
    })

    it('should reject objects with wrong field types', () => {
      fc.assert(
        fc.property(snapshotMetadataFileArb, data => {
          // Replace processingDuration with a string (wrong type)
          const invalidData = { ...data, processingDuration: 'not a number' }
          const result = SnapshotMetadataFileSchema.safeParse(invalidData)
          expect(result.success).toBe(false)
        }),
        fcOptions
      )
    })

    it('should reject objects with invalid enum values', () => {
      fc.assert(
        fc.property(snapshotMetadataFileArb, data => {
          // Replace status with an invalid enum value
          const invalidData = { ...data, status: 'invalid_status' }
          const result = SnapshotMetadataFileSchema.safeParse(invalidData)
          expect(result.success).toBe(false)
        }),
        fcOptions
      )
    })

    it('should accept objects with optional fields present', () => {
      fc.assert(
        fc.property(snapshotMetadataFileArb, data => {
          // Ensure optional fields are present
          const dataWithOptionals = {
            ...data,
            isClosingPeriodData: true,
            collectionDate: '2024-01-15',
            logicalDate: '2024-01-15',
          }
          const result = SnapshotMetadataFileSchema.safeParse(dataWithOptionals)
          expect(result.success).toBe(true)
        }),
        fcOptions
      )
    })
  })

  describe('SnapshotManifest schema', () => {
    it('should accept all valid SnapshotManifest objects', () => {
      fc.assert(
        fc.property(snapshotManifestArb, data => {
          const result = SnapshotManifestSchema.safeParse(data)
          expect(result.success).toBe(true)
        }),
        fcOptions
      )
    })

    it('should reject objects with missing required fields', () => {
      const requiredFields = [
        'snapshotId',
        'createdAt',
        'districts',
        'totalDistricts',
        'successfulDistricts',
        'failedDistricts',
      ]

      for (const fieldToRemove of requiredFields) {
        fc.assert(
          fc.property(snapshotManifestArb, data => {
            const invalidData = { ...data }
            delete (invalidData as Record<string, unknown>)[fieldToRemove]
            const result = SnapshotManifestSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
          }),
          fcOptions
        )
      }
    })

    it('should reject objects with wrong field types', () => {
      fc.assert(
        fc.property(snapshotManifestArb, data => {
          // Replace districts with a string (wrong type)
          const invalidData = { ...data, districts: 'not an array' }
          const result = SnapshotManifestSchema.safeParse(invalidData)
          expect(result.success).toBe(false)
        }),
        fcOptions
      )
    })

    it('should reject objects with invalid nested district entries', () => {
      fc.assert(
        fc.property(snapshotManifestArb, data => {
          // Add an invalid district entry
          const invalidData = {
            ...data,
            districts: [{ districtId: 12345 }], // Missing required fields and wrong type
          }
          const result = SnapshotManifestSchema.safeParse(invalidData)
          expect(result.success).toBe(false)
        }),
        fcOptions
      )
    })

    it('should accept objects with optional allDistrictsRankings present', () => {
      fc.assert(
        fc.property(snapshotManifestArb, data => {
          // Ensure optional field is present
          const dataWithOptional = {
            ...data,
            allDistrictsRankings: {
              filename: 'all-districts-rankings.json',
              size: 1024,
              status: 'present' as const,
            },
          }
          const result = SnapshotManifestSchema.safeParse(dataWithOptional)
          expect(result.success).toBe(true)
        }),
        fcOptions
      )
    })

    it('should accept manifest with writeComplete: true', () => {
      fc.assert(
        fc.property(snapshotManifestArb, data => {
          const withWriteComplete = { ...data, writeComplete: true }
          const result = SnapshotManifestSchema.safeParse(withWriteComplete)
          expect(result.success).toBe(true)
          if (result.success) {
            expect(result.data.writeComplete).toBe(true)
          }
        }),
        fcOptions
      )
    })

    it('should accept manifest with writeComplete: false', () => {
      fc.assert(
        fc.property(snapshotManifestArb, data => {
          const withWriteComplete = { ...data, writeComplete: false }
          const result = SnapshotManifestSchema.safeParse(withWriteComplete)
          expect(result.success).toBe(true)
          if (result.success) {
            expect(result.data.writeComplete).toBe(false)
          }
        }),
        fcOptions
      )
    })

    it('should accept manifest with writeComplete omitted', () => {
      fc.assert(
        fc.property(snapshotManifestArb, data => {
          const { writeComplete: _, ...withoutWriteComplete } = data
          const result = SnapshotManifestSchema.safeParse(withoutWriteComplete)
          expect(result.success).toBe(true)
          if (result.success) {
            expect(result.data.writeComplete).toBeUndefined()
          }
        }),
        fcOptions
      )
    })
  })

  describe('DistrictStatisticsFile schema', () => {
    it('should accept all valid DistrictStatisticsFile objects', () => {
      fc.assert(
        fc.property(districtStatisticsFileArb, data => {
          const result = DistrictStatisticsFileSchema.safeParse(data)
          expect(result.success).toBe(true)
        }),
        fcOptions
      )
    })

    it('should reject objects with missing required fields', () => {
      const requiredFields = [
        'districtId',
        'snapshotDate',
        'clubs',
        'divisions',
        'areas',
        'totals',
      ]

      for (const fieldToRemove of requiredFields) {
        fc.assert(
          fc.property(districtStatisticsFileArb, data => {
            const invalidData = { ...data }
            delete (invalidData as Record<string, unknown>)[fieldToRemove]
            const result = DistrictStatisticsFileSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
          }),
          fcOptions
        )
      }
    })

    it('should reject objects with wrong field types', () => {
      fc.assert(
        fc.property(districtStatisticsFileArb, data => {
          // Replace clubs with a string (wrong type)
          const invalidData = { ...data, clubs: 'not an array' }
          const result = DistrictStatisticsFileSchema.safeParse(invalidData)
          expect(result.success).toBe(false)
        }),
        fcOptions
      )
    })
  })

  describe('ClubStatisticsFile schema', () => {
    it('should accept all valid ClubStatisticsFile objects', () => {
      fc.assert(
        fc.property(clubStatisticsArb, data => {
          const result = ClubStatisticsFileSchema.safeParse(data)
          expect(result.success).toBe(true)
        }),
        fcOptions
      )
    })

    it('should reject objects with missing required fields', () => {
      const requiredFields = [
        'clubId',
        'clubName',
        'divisionId',
        'areaId',
        'membershipCount',
        'paymentsCount',
        'dcpGoals',
        'status',
        'divisionName',
        'areaName',
        'octoberRenewals',
        'aprilRenewals',
        'newMembers',
        'membershipBase',
      ]

      for (const fieldToRemove of requiredFields) {
        fc.assert(
          fc.property(clubStatisticsArb, data => {
            const invalidData = { ...data }
            delete (invalidData as Record<string, unknown>)[fieldToRemove]
            const result = ClubStatisticsFileSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
          }),
          fcOptions
        )
      }
    })
  })

  describe('DivisionStatisticsFile schema', () => {
    it('should accept all valid DivisionStatisticsFile objects', () => {
      fc.assert(
        fc.property(divisionStatisticsArb, data => {
          const result = DivisionStatisticsFileSchema.safeParse(data)
          expect(result.success).toBe(true)
        }),
        fcOptions
      )
    })

    it('should reject objects with missing required fields', () => {
      const requiredFields = [
        'divisionId',
        'divisionName',
        'clubCount',
        'membershipTotal',
        'paymentsTotal',
      ]

      for (const fieldToRemove of requiredFields) {
        fc.assert(
          fc.property(divisionStatisticsArb, data => {
            const invalidData = { ...data }
            delete (invalidData as Record<string, unknown>)[fieldToRemove]
            const result = DivisionStatisticsFileSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
          }),
          fcOptions
        )
      }
    })
  })

  describe('AreaStatisticsFile schema', () => {
    it('should accept all valid AreaStatisticsFile objects', () => {
      fc.assert(
        fc.property(areaStatisticsArb, data => {
          const result = AreaStatisticsFileSchema.safeParse(data)
          expect(result.success).toBe(true)
        }),
        fcOptions
      )
    })

    it('should reject objects with missing required fields', () => {
      const requiredFields = [
        'areaId',
        'areaName',
        'divisionId',
        'clubCount',
        'membershipTotal',
        'paymentsTotal',
      ]

      for (const fieldToRemove of requiredFields) {
        fc.assert(
          fc.property(areaStatisticsArb, data => {
            const invalidData = { ...data }
            delete (invalidData as Record<string, unknown>)[fieldToRemove]
            const result = AreaStatisticsFileSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
          }),
          fcOptions
        )
      }
    })
  })

  describe('DistrictTotalsFile schema', () => {
    it('should accept all valid DistrictTotalsFile objects', () => {
      fc.assert(
        fc.property(districtTotalsArb, data => {
          const result = DistrictTotalsFileSchema.safeParse(data)
          expect(result.success).toBe(true)
        }),
        fcOptions
      )
    })

    it('should reject objects with missing required fields', () => {
      const requiredFields = [
        'totalClubs',
        'totalMembership',
        'totalPayments',
        'distinguishedClubs',
        'selectDistinguishedClubs',
        'presidentDistinguishedClubs',
      ]

      for (const fieldToRemove of requiredFields) {
        fc.assert(
          fc.property(districtTotalsArb, data => {
            const invalidData = { ...data }
            delete (invalidData as Record<string, unknown>)[fieldToRemove]
            const result = DistrictTotalsFileSchema.safeParse(invalidData)
            expect(result.success).toBe(false)
          }),
          fcOptions
        )
      }
    })
  })
})

// ============================================================================
// Property Tests: Validation Round-Trip
// ============================================================================

describe('Property 2: Validation Round-Trip', () => {
  /**
   * Test configuration: minimum 100 iterations per steering requirements
   */
  const fcOptions = { numRuns: 100 }

  /**
   * Helper function to perform deep structural equality check.
   * This compares objects by their JSON representation to ensure
   * all data is preserved through the round-trip.
   */
  function isStructurallyEquivalent(
    original: unknown,
    roundTripped: unknown
  ): boolean {
    return JSON.stringify(original) === JSON.stringify(roundTripped)
  }

  describe('PerDistrictData round-trip', () => {
    /**
     * **Validates: Requirements 6.3, 6.4**
     *
     * For any valid PerDistrictData object, serializing to JSON string
     * and then parsing and validating SHALL return success: true with
     * data structurally equivalent to the original object.
     */
    it('should preserve data through JSON serialization and validation', () => {
      fc.assert(
        fc.property(perDistrictDataArb, original => {
          // Step 1: Serialize to JSON string
          const jsonString = JSON.stringify(original)

          // Step 2: Parse JSON string back to object
          const parsed: unknown = JSON.parse(jsonString)

          // Step 3: Validate using validation helper
          const result = validatePerDistrictData(parsed)

          // Step 4: Verify validation succeeds
          expect(result.success).toBe(true)

          // Step 5: Verify structural equivalence
          if (result.success && result.data) {
            expect(isStructurallyEquivalent(original, result.data)).toBe(true)
          }
        }),
        fcOptions
      )
    })

    it('should handle objects with optional fields through round-trip', () => {
      fc.assert(
        fc.property(perDistrictDataArb, original => {
          // Ensure we test with optional errorMessage present
          const withOptional = {
            ...original,
            errorMessage:
              original.status === 'failed' ? 'Test error message' : undefined,
          }

          const jsonString = JSON.stringify(withOptional)
          const parsed: unknown = JSON.parse(jsonString)
          const result = validatePerDistrictData(parsed)

          expect(result.success).toBe(true)
          if (result.success && result.data) {
            // Verify optional field is preserved when present
            if (withOptional.errorMessage !== undefined) {
              expect(result.data.errorMessage).toBe(withOptional.errorMessage)
            }
          }
        }),
        fcOptions
      )
    })
  })

  describe('AllDistrictsRankingsData round-trip', () => {
    /**
     * **Validates: Requirements 6.3, 6.4**
     *
     * For any valid AllDistrictsRankingsData object, serializing to JSON string
     * and then parsing and validating SHALL return success: true with
     * data structurally equivalent to the original object.
     */
    it('should preserve data through JSON serialization and validation', () => {
      fc.assert(
        fc.property(allDistrictsRankingsDataArb, original => {
          // Step 1: Serialize to JSON string
          const jsonString = JSON.stringify(original)

          // Step 2: Parse JSON string back to object
          const parsed: unknown = JSON.parse(jsonString)

          // Step 3: Validate using validation helper
          const result = validateAllDistrictsRankings(parsed)

          // Step 4: Verify validation succeeds
          expect(result.success).toBe(true)

          // Step 5: Verify structural equivalence
          if (result.success && result.data) {
            expect(isStructurallyEquivalent(original, result.data)).toBe(true)
          }
        }),
        fcOptions
      )
    })

    it('should preserve nested rankings array through round-trip', () => {
      fc.assert(
        fc.property(allDistrictsRankingsDataArb, original => {
          const jsonString = JSON.stringify(original)
          const parsed: unknown = JSON.parse(jsonString)
          const result = validateAllDistrictsRankings(parsed)

          expect(result.success).toBe(true)
          if (result.success && result.data) {
            // Verify rankings array length is preserved
            expect(result.data.rankings.length).toBe(original.rankings.length)

            // Verify each ranking entry is preserved
            for (let i = 0; i < original.rankings.length; i++) {
              expect(result.data.rankings[i]?.districtId).toBe(
                original.rankings[i]?.districtId
              )
              expect(result.data.rankings[i]?.aggregateScore).toBe(
                original.rankings[i]?.aggregateScore
              )
            }
          }
        }),
        fcOptions
      )
    })

    it('should preserve metadata through round-trip', () => {
      fc.assert(
        fc.property(allDistrictsRankingsDataArb, original => {
          const jsonString = JSON.stringify(original)
          const parsed: unknown = JSON.parse(jsonString)
          const result = validateAllDistrictsRankings(parsed)

          expect(result.success).toBe(true)
          if (result.success && result.data) {
            expect(result.data.metadata.snapshotId).toBe(
              original.metadata.snapshotId
            )
            expect(result.data.metadata.totalDistricts).toBe(
              original.metadata.totalDistricts
            )
            expect(result.data.metadata.fromCache).toBe(
              original.metadata.fromCache
            )
          }
        }),
        fcOptions
      )
    })
  })

  describe('SnapshotMetadataFile round-trip', () => {
    /**
     * **Validates: Requirements 6.3, 6.4**
     *
     * For any valid SnapshotMetadataFile object, serializing to JSON string
     * and then parsing and validating SHALL return success: true with
     * data structurally equivalent to the original object.
     */
    it('should preserve data through JSON serialization and validation', () => {
      fc.assert(
        fc.property(snapshotMetadataFileArb, original => {
          // Step 1: Serialize to JSON string
          const jsonString = JSON.stringify(original)

          // Step 2: Parse JSON string back to object
          const parsed: unknown = JSON.parse(jsonString)

          // Step 3: Validate using validation helper
          const result = validateSnapshotMetadata(parsed)

          // Step 4: Verify validation succeeds
          expect(result.success).toBe(true)

          // Step 5: Verify structural equivalence
          if (result.success && result.data) {
            expect(isStructurallyEquivalent(original, result.data)).toBe(true)
          }
        }),
        fcOptions
      )
    })

    it('should preserve optional closing period fields through round-trip', () => {
      fc.assert(
        fc.property(snapshotMetadataFileArb, original => {
          // Test with all optional fields present
          const withOptionals = {
            ...original,
            isClosingPeriodData: true,
            collectionDate: '2024-01-15',
            logicalDate: '2024-01-15',
          }

          const jsonString = JSON.stringify(withOptionals)
          const parsed: unknown = JSON.parse(jsonString)
          const result = validateSnapshotMetadata(parsed)

          expect(result.success).toBe(true)
          if (result.success && result.data) {
            expect(result.data.isClosingPeriodData).toBe(true)
            expect(result.data.collectionDate).toBe('2024-01-15')
            expect(result.data.logicalDate).toBe('2024-01-15')
          }
        }),
        fcOptions
      )
    })

    it('should preserve district arrays through round-trip', () => {
      fc.assert(
        fc.property(snapshotMetadataFileArb, original => {
          const jsonString = JSON.stringify(original)
          const parsed: unknown = JSON.parse(jsonString)
          const result = validateSnapshotMetadata(parsed)

          expect(result.success).toBe(true)
          if (result.success && result.data) {
            expect(result.data.configuredDistricts).toEqual(
              original.configuredDistricts
            )
            expect(result.data.successfulDistricts).toEqual(
              original.successfulDistricts
            )
            expect(result.data.failedDistricts).toEqual(
              original.failedDistricts
            )
            expect(result.data.errors).toEqual(original.errors)
          }
        }),
        fcOptions
      )
    })
  })

  describe('SnapshotManifest round-trip', () => {
    /**
     * **Validates: Requirements 6.3, 6.4**
     *
     * For any valid SnapshotManifest object, serializing to JSON string
     * and then parsing and validating SHALL return success: true with
     * data structurally equivalent to the original object.
     */
    it('should preserve data through JSON serialization and validation', () => {
      fc.assert(
        fc.property(snapshotManifestArb, original => {
          // Step 1: Serialize to JSON string
          const jsonString = JSON.stringify(original)

          // Step 2: Parse JSON string back to object
          const parsed: unknown = JSON.parse(jsonString)

          // Step 3: Validate using validation helper
          const result = validateSnapshotManifest(parsed)

          // Step 4: Verify validation succeeds
          expect(result.success).toBe(true)

          // Step 5: Verify structural equivalence
          if (result.success && result.data) {
            expect(isStructurallyEquivalent(original, result.data)).toBe(true)
          }
        }),
        fcOptions
      )
    })

    it('should preserve optional allDistrictsRankings through round-trip', () => {
      fc.assert(
        fc.property(snapshotManifestArb, original => {
          // Test with optional field present
          const withOptional = {
            ...original,
            allDistrictsRankings: {
              filename: 'all-districts-rankings.json',
              size: 1024,
              status: 'present' as const,
            },
          }

          const jsonString = JSON.stringify(withOptional)
          const parsed: unknown = JSON.parse(jsonString)
          const result = validateSnapshotManifest(parsed)

          expect(result.success).toBe(true)
          if (result.success && result.data) {
            expect(result.data.allDistrictsRankings).toBeDefined()
            expect(result.data.allDistrictsRankings?.filename).toBe(
              'all-districts-rankings.json'
            )
            expect(result.data.allDistrictsRankings?.size).toBe(1024)
            expect(result.data.allDistrictsRankings?.status).toBe('present')
          }
        }),
        fcOptions
      )
    })

    it('should preserve nested district entries through round-trip', () => {
      fc.assert(
        fc.property(snapshotManifestArb, original => {
          const jsonString = JSON.stringify(original)
          const parsed: unknown = JSON.parse(jsonString)
          const result = validateSnapshotManifest(parsed)

          expect(result.success).toBe(true)
          if (result.success && result.data) {
            // Verify districts array length is preserved
            expect(result.data.districts.length).toBe(original.districts.length)

            // Verify each district entry is preserved
            for (let i = 0; i < original.districts.length; i++) {
              expect(result.data.districts[i]?.districtId).toBe(
                original.districts[i]?.districtId
              )
              expect(result.data.districts[i]?.fileName).toBe(
                original.districts[i]?.fileName
              )
              expect(result.data.districts[i]?.status).toBe(
                original.districts[i]?.status
              )
            }
          }
        }),
        fcOptions
      )
    })
  })
})
