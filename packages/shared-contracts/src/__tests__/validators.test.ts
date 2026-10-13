import { describe, it, expect } from 'vitest'
import {
  validatePerDistrictData,
  validateAllDistrictsRankings,
  validateSnapshotMetadata,
  validateSnapshotManifest,
} from '../validation/validators.js'

/**
 * Error message quality tests for validation helper functions.
 *
 * These tests verify that validation errors are descriptive and helpful,
 * including field names, expected types, and paths to invalid fields.
 *
 * Validates: Requirements 6.5
 */
describe('validators error message quality', () => {
  describe('validatePerDistrictData', () => {
    describe('missing required field produces descriptive error', () => {
      it('should mention missing districtId field', () => {
        const data = {
          // districtId is missing
          districtName: 'District 42',
          collectedAt: '2024-01-15T10:00:00Z',
          status: 'success',
          data: createValidDistrictStatistics(),
        }

        const result = validatePerDistrictData(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('districtId')
      })

      it('should mention missing status field', () => {
        const data = {
          districtId: '42',
          districtName: 'District 42',
          collectedAt: '2024-01-15T10:00:00Z',
          // status is missing
          data: createValidDistrictStatistics(),
        }

        const result = validatePerDistrictData(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('status')
      })

      it('should mention missing data field', () => {
        const data = {
          districtId: '42',
          districtName: 'District 42',
          collectedAt: '2024-01-15T10:00:00Z',
          status: 'success',
          // data is missing
        }

        const result = validatePerDistrictData(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('data')
      })
    })

    describe('wrong type produces descriptive error', () => {
      it('should mention expected type when districtId is not a string', () => {
        const data = {
          districtId: 42, // should be string
          districtName: 'District 42',
          collectedAt: '2024-01-15T10:00:00Z',
          status: 'success',
          data: createValidDistrictStatistics(),
        }

        const result = validatePerDistrictData(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('string')
      })

      it('should mention expected type when status is invalid enum value', () => {
        const data = {
          districtId: '42',
          districtName: 'District 42',
          collectedAt: '2024-01-15T10:00:00Z',
          status: 'invalid', // should be 'success' or 'failed'
          data: createValidDistrictStatistics(),
        }

        const result = validatePerDistrictData(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        // Zod enum errors mention the invalid value received
        expect(result.error).toMatch(/status|invalid|success|failed/i)
      })
    })

    describe('nested validation error includes path', () => {
      it('should include path to nested data.districtId field', () => {
        const data = {
          districtId: '42',
          districtName: 'District 42',
          collectedAt: '2024-01-15T10:00:00Z',
          status: 'success',
          data: {
            districtId: 123, // should be string
            snapshotDate: '2024-01-15',
            clubs: [],
            divisions: [],
            areas: [],
            totals: createValidDistrictTotals(),
          },
        }

        const result = validatePerDistrictData(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        // Error should indicate the path to the nested field
        expect(result.error).toContain('data')
      })

      it('should include path to nested totals field', () => {
        const data = {
          districtId: '42',
          districtName: 'District 42',
          collectedAt: '2024-01-15T10:00:00Z',
          status: 'success',
          data: {
            districtId: '42',
            snapshotDate: '2024-01-15',
            clubs: [],
            divisions: [],
            areas: [],
            totals: {
              totalClubs: 'not a number', // should be number
              totalMembership: 100,
              totalPayments: 50,
              distinguishedClubs: 5,
              selectDistinguishedClubs: 3,
              presidentDistinguishedClubs: 2,
            },
          },
        }

        const result = validatePerDistrictData(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        // Error should indicate the path to the nested field
        expect(result.error).toContain('totals')
      })

      it('should include path to nested array element field', () => {
        const data = {
          districtId: '42',
          districtName: 'District 42',
          collectedAt: '2024-01-15T10:00:00Z',
          status: 'success',
          data: {
            districtId: '42',
            snapshotDate: '2024-01-15',
            clubs: [
              {
                clubId: 123, // should be string
                clubName: 'Test Club',
                divisionId: 'A',
                areaId: '1',
                membershipCount: 20,
                paymentsCount: 10,
                dcpGoals: 5,
                status: 'Active',
                divisionName: 'Division A',
                areaName: 'Area 1',
                octoberRenewals: 5,
                aprilRenewals: 5,
                newMembers: 3,
                membershipBase: 15,
              },
            ],
            divisions: [],
            areas: [],
            totals: createValidDistrictTotals(),
          },
        }

        const result = validatePerDistrictData(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        // Error should indicate the path to the nested array element
        expect(result.error).toContain('clubs')
      })
    })
  })

  describe('validateAllDistrictsRankings', () => {
    describe('missing required field produces descriptive error', () => {
      it('should mention missing metadata field', () => {
        const data = {
          // metadata is missing
          rankings: [],
        }

        const result = validateAllDistrictsRankings(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('metadata')
      })

      it('should mention missing rankings field', () => {
        const data = {
          metadata: createValidRankingsMetadata(),
          // rankings is missing
        }

        const result = validateAllDistrictsRankings(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('rankings')
      })
    })

    describe('wrong type produces descriptive error', () => {
      it('should mention expected type when rankings is not an array', () => {
        const data = {
          metadata: createValidRankingsMetadata(),
          rankings: 'not an array', // should be array
        }

        const result = validateAllDistrictsRankings(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('array')
      })

      it('should mention expected type when metadata.totalDistricts is not a number', () => {
        const data = {
          metadata: {
            ...createValidRankingsMetadata(),
            totalDistricts: 'not a number', // should be number
          },
          rankings: [],
        }

        const result = validateAllDistrictsRankings(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('number')
      })
    })

    describe('nested validation error includes path', () => {
      it('should include path to nested metadata.snapshotId field', () => {
        const data = {
          metadata: {
            snapshotId: 123, // should be string
            calculatedAt: '2024-01-15T10:00:00Z',
            schemaVersion: '1.0.0',
            calculationVersion: '1.0.0',
            rankingVersion: '2.0',
            sourceCsvDate: '2024-01-15',
            csvFetchedAt: '2024-01-15T10:00:00Z',
            totalDistricts: 10,
            fromCache: false,
          },
          rankings: [],
        }

        const result = validateAllDistrictsRankings(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('metadata')
      })

      it('should include path to nested rankings array element', () => {
        const data = {
          metadata: createValidRankingsMetadata(),
          rankings: [
            {
              districtId: 42, // should be string
              districtName: 'District 42',
              region: 'Region 1',
              paidClubs: 50,
              paidClubBase: 45,
              clubGrowthPercent: 11.1,
              totalPayments: 1000,
              paymentBase: 900,
              paymentGrowthPercent: 11.1,
              activeClubs: 48,
              distinguishedClubs: 10,
              selectDistinguished: 5,
              presidentsDistinguished: 3,
              distinguishedPercent: 20.8,
              clubsRank: 1,
              paymentsRank: 2,
              distinguishedRank: 3,
              aggregateScore: 6,
            },
          ],
        }

        const result = validateAllDistrictsRankings(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('rankings')
      })
    })
  })

  describe('validateSnapshotMetadata', () => {
    describe('missing required field produces descriptive error', () => {
      it('should mention missing snapshotId field', () => {
        const data = {
          // snapshotId is missing
          createdAt: '2024-01-15T10:00:00Z',
          schemaVersion: '1.0.0',
          calculationVersion: '1.0.0',
          status: 'success',
          configuredDistricts: ['42'],
          successfulDistricts: ['42'],
          failedDistricts: [],
          errors: [],
          processingDuration: 1000,
          source: 'collector-cli',
          dataAsOfDate: '2024-01-15',
        }

        const result = validateSnapshotMetadata(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('snapshotId')
      })

      it('should mention missing status field', () => {
        const data = {
          snapshotId: '2024-01-15',
          createdAt: '2024-01-15T10:00:00Z',
          schemaVersion: '1.0.0',
          calculationVersion: '1.0.0',
          // status is missing
          configuredDistricts: ['42'],
          successfulDistricts: ['42'],
          failedDistricts: [],
          errors: [],
          processingDuration: 1000,
          source: 'collector-cli',
          dataAsOfDate: '2024-01-15',
        }

        const result = validateSnapshotMetadata(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('status')
      })
    })

    describe('wrong type produces descriptive error', () => {
      it('should mention expected type when processingDuration is not a number', () => {
        const data = {
          snapshotId: '2024-01-15',
          createdAt: '2024-01-15T10:00:00Z',
          schemaVersion: '1.0.0',
          calculationVersion: '1.0.0',
          status: 'success',
          configuredDistricts: ['42'],
          successfulDistricts: ['42'],
          failedDistricts: [],
          errors: [],
          processingDuration: 'not a number', // should be number
          source: 'collector-cli',
          dataAsOfDate: '2024-01-15',
        }

        const result = validateSnapshotMetadata(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('number')
      })

      it('should mention expected type when status is invalid enum value', () => {
        const data = {
          snapshotId: '2024-01-15',
          createdAt: '2024-01-15T10:00:00Z',
          schemaVersion: '1.0.0',
          calculationVersion: '1.0.0',
          status: 'invalid', // should be 'success', 'partial', or 'failed'
          configuredDistricts: ['42'],
          successfulDistricts: ['42'],
          failedDistricts: [],
          errors: [],
          processingDuration: 1000,
          source: 'collector-cli',
          dataAsOfDate: '2024-01-15',
        }

        const result = validateSnapshotMetadata(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        // Zod enum errors mention the invalid value received
        expect(result.error).toMatch(/status|invalid|success|partial|failed/i)
      })

      it('should mention expected type when configuredDistricts is not an array', () => {
        const data = {
          snapshotId: '2024-01-15',
          createdAt: '2024-01-15T10:00:00Z',
          schemaVersion: '1.0.0',
          calculationVersion: '1.0.0',
          status: 'success',
          configuredDistricts: 'not an array', // should be array
          successfulDistricts: ['42'],
          failedDistricts: [],
          errors: [],
          processingDuration: 1000,
          source: 'collector-cli',
          dataAsOfDate: '2024-01-15',
        }

        const result = validateSnapshotMetadata(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('array')
      })
    })

    describe('nested validation error includes path', () => {
      it('should include path to nested array element with wrong type', () => {
        const data = {
          snapshotId: '2024-01-15',
          createdAt: '2024-01-15T10:00:00Z',
          schemaVersion: '1.0.0',
          calculationVersion: '1.0.0',
          status: 'success',
          configuredDistricts: [42], // array elements should be strings
          successfulDistricts: ['42'],
          failedDistricts: [],
          errors: [],
          processingDuration: 1000,
          source: 'collector-cli',
          dataAsOfDate: '2024-01-15',
        }

        const result = validateSnapshotMetadata(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('configuredDistricts')
      })
    })
  })

  describe('validateSnapshotManifest', () => {
    it('still accepts published manifests that carry the retired fileSize (#1888)', () => {
      // Real shape of a prod manifest written before #1888 dropped fileSize.
      const published = {
        snapshotId: '2026-10-10',
        createdAt: '2026-10-11T09:02:18.667Z',
        districts: [
          {
            districtId: '02',
            fileName: 'district_02.json',
            status: 'success',
            fileSize: 697933,
            lastModified: '2026-10-11T09:02:17.219Z',
          },
        ],
        totalDistricts: 1,
        successfulDistricts: 1,
        failedDistricts: 0,
      }

      const result = validateSnapshotManifest(published)

      expect(result.success).toBe(true)
    })

    describe('missing required field produces descriptive error', () => {
      it('should mention missing snapshotId field', () => {
        const data = {
          // snapshotId is missing
          createdAt: '2024-01-15T10:00:00Z',
          districts: [],
          totalDistricts: 0,
          successfulDistricts: 0,
          failedDistricts: 0,
        }

        const result = validateSnapshotManifest(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('snapshotId')
      })

      it('should mention missing districts field', () => {
        const data = {
          snapshotId: '2024-01-15',
          createdAt: '2024-01-15T10:00:00Z',
          // districts is missing
          totalDistricts: 0,
          successfulDistricts: 0,
          failedDistricts: 0,
        }

        const result = validateSnapshotManifest(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('districts')
      })

      it('should mention missing totalDistricts field', () => {
        const data = {
          snapshotId: '2024-01-15',
          createdAt: '2024-01-15T10:00:00Z',
          districts: [],
          // totalDistricts is missing
          successfulDistricts: 0,
          failedDistricts: 0,
        }

        const result = validateSnapshotManifest(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('totalDistricts')
      })
    })

    describe('wrong type produces descriptive error', () => {
      it('should mention expected type when totalDistricts is not a number', () => {
        const data = {
          snapshotId: '2024-01-15',
          createdAt: '2024-01-15T10:00:00Z',
          districts: [],
          totalDistricts: 'not a number', // should be number
          successfulDistricts: 0,
          failedDistricts: 0,
        }

        const result = validateSnapshotManifest(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('number')
      })

      it('should mention expected type when districts is not an array', () => {
        const data = {
          snapshotId: '2024-01-15',
          createdAt: '2024-01-15T10:00:00Z',
          districts: 'not an array', // should be array
          totalDistricts: 0,
          successfulDistricts: 0,
          failedDistricts: 0,
        }

        const result = validateSnapshotManifest(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('array')
      })
    })

    describe('nested validation error includes path', () => {
      it('should include path to nested district entry field', () => {
        const data = {
          snapshotId: '2024-01-15',
          createdAt: '2024-01-15T10:00:00Z',
          districts: [
            {
              districtId: 42, // should be string
              fileName: 'district_42.json',
              status: 'success',
              lastModified: '2024-01-15T10:00:00Z',
            },
          ],
          totalDistricts: 1,
          successfulDistricts: 1,
          failedDistricts: 0,
        }

        const result = validateSnapshotManifest(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('districts')
      })

      it('should include path to nested allDistrictsRankings field', () => {
        const data = {
          snapshotId: '2024-01-15',
          createdAt: '2024-01-15T10:00:00Z',
          districts: [],
          totalDistricts: 0,
          successfulDistricts: 0,
          failedDistricts: 0,
          allDistrictsRankings: {
            filename: 'all-districts-rankings.json',
            size: 'not a number', // should be number
            status: 'present',
          },
        }

        const result = validateSnapshotManifest(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('allDistrictsRankings')
      })

      it('should include path to nested district entry status field', () => {
        const data = {
          snapshotId: '2024-01-15',
          createdAt: '2024-01-15T10:00:00Z',
          districts: [
            {
              districtId: '42',
              fileName: 'district_42.json',
              status: 'invalid', // should be 'success' or 'failed'
              lastModified: '2024-01-15T10:00:00Z',
            },
          ],
          totalDistricts: 1,
          successfulDistricts: 1,
          failedDistricts: 0,
        }

        const result = validateSnapshotManifest(data)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error).toContain('districts')
      })
    })
  })

  describe('validation success cases', () => {
    it('should return success for valid PerDistrictData', () => {
      const data = {
        districtId: '42',
        districtName: 'District 42',
        collectedAt: '2024-01-15T10:00:00Z',
        status: 'success',
        data: createValidDistrictStatistics(),
      }

      const result = validatePerDistrictData(data)

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should return success for valid AllDistrictsRankingsData', () => {
      const data = {
        metadata: createValidRankingsMetadata(),
        rankings: [],
      }

      const result = validateAllDistrictsRankings(data)

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should return success for valid SnapshotMetadataFile', () => {
      const data = createValidSnapshotMetadata()

      const result = validateSnapshotMetadata(data)

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should return success for valid SnapshotManifest', () => {
      const data = {
        snapshotId: '2024-01-15',
        createdAt: '2024-01-15T10:00:00Z',
        districts: [],
        totalDistricts: 0,
        successfulDistricts: 0,
        failedDistricts: 0,
      }

      const result = validateSnapshotManifest(data)

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  })
})

// Helper functions to create valid test data

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

function createValidDistrictStatistics() {
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

function createValidRankingsMetadata() {
  return {
    snapshotId: '2024-01-15',
    calculatedAt: '2024-01-15T10:00:00Z',
    schemaVersion: '1.0.0',
    calculationVersion: '1.0.0',
    rankingVersion: '2.0',
    sourceCsvDate: '2024-01-15',
    csvFetchedAt: '2024-01-15T10:00:00Z',
    totalDistricts: 10,
    fromCache: false,
  }
}

function createValidSnapshotMetadata() {
  return {
    snapshotId: '2024-01-15',
    createdAt: '2024-01-15T10:00:00Z',
    schemaVersion: '1.0.0',
    calculationVersion: '1.0.0',
    status: 'success',
    configuredDistricts: ['42'],
    successfulDistricts: ['42'],
    failedDistricts: [],
    errors: [],
    processingDuration: 1000,
    source: 'collector-cli',
    dataAsOfDate: '2024-01-15',
  }
}
