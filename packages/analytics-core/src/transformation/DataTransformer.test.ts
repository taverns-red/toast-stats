/**
 * Unit tests for DataTransformer.
 *
 * Tests the CSV-to-snapshot transformation logic extracted from the backend.
 * These tests verify that the DataTransformer correctly parses and transforms
 * raw CSV data into the structured DistrictStatistics format.
 *
 * Requirements: 2.2, 1.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DataTransformer } from './DataTransformer.js'
import type { RawCSVData, DistrictStatistics } from '../interfaces.js'

describe('DataTransformer', () => {
  let transformer: DataTransformer

  beforeEach(() => {
    transformer = new DataTransformer()
  })

  describe('transformRawCSV', () => {
    it('should transform empty CSV data into empty district statistics', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [],
        divisionPerformance: [],
        districtPerformance: [],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      expect(result.districtId).toBe('D101')
      expect(result.snapshotDate).toBe('2024-01-15')
      expect(result.clubs).toHaveLength(0)
      expect(result.divisions).toHaveLength(0)
      expect(result.areas).toHaveLength(0)
      expect(result.totals.totalClubs).toBe(0)
      expect(result.totals.totalMembership).toBe(0)
    })

    it('should transform club performance CSV into club statistics', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [
          [
            'Club Number',
            'Club Name',
            'Division',
            'Area',
            'Active Members',
            'Goals Met',
            'Club Status',
            'Mem. Base',
          ],
          ['1234', 'Test Club A', 'A', '1', '25', '5', 'Active', '20'],
          ['5678', 'Test Club B', 'A', '2', '18', '3', 'Active', '15'],
        ],
        divisionPerformance: [],
        districtPerformance: [
          ['Club', 'Oct. Ren.', 'Apr. Ren.', 'New Members', 'Total to Date'],
          ['1234', '10', '8', '7', '30'],
          ['5678', '6', '5', '7', '22'],
        ],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      expect(result.clubs).toHaveLength(2)
      expect(result.clubs[0]).toEqual({
        clubId: '1234',
        clubName: 'Test Club A',
        divisionId: 'A',
        areaId: '1',
        divisionName: 'Division A',
        areaName: 'Area 1',
        membershipCount: 25,
        paymentsCount: 30,
        dcpGoals: 5,
        status: 'Active',
        clubStatus: 'Active',
        octoberRenewals: 10,
        aprilRenewals: 8,
        newMembers: 7,
        membershipBase: 20,
      })
      expect(result.clubs[1]).toEqual({
        clubId: '5678',
        clubName: 'Test Club B',
        divisionId: 'A',
        areaId: '2',
        divisionName: 'Division A',
        areaName: 'Area 2',
        membershipCount: 18,
        paymentsCount: 22,
        dcpGoals: 3,
        status: 'Active',
        clubStatus: 'Active',
        octoberRenewals: 6,
        aprilRenewals: 5,
        newMembers: 7,
        membershipBase: 15,
      })
    })

    it('should calculate correct totals from club data', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [
          [
            'Club Number',
            'Club Name',
            'Division',
            'Area',
            'Active Members',
            'Total to Date',
            'Goals Met',
          ],
          ['1234', 'Club A', 'A', '1', '25', '30', '5'],
          ['5678', 'Club B', 'B', '1', '18', '22', '3'],
          ['9012', 'Club C', 'A', '2', '32', '40', '7'],
        ],
        divisionPerformance: [],
        districtPerformance: [],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      expect(result.totals.totalClubs).toBe(3)
      expect(result.totals.totalMembership).toBe(75) // 25 + 18 + 32
      expect(result.totals.totalPayments).toBe(92) // 30 + 22 + 40
    })

    it('should derive division statistics from merged club data', async () => {
      // #1124: real divisionperformance CSVs are per-club rows with no
      // aggregate columns, so divisions are derived from the merged
      // clubs (membership from clubPerformance, payments from
      // districtPerformance). Real-header coverage lives in
      // DataTransformer.realHeaders.test.ts.
      const csvData: RawCSVData = {
        clubPerformance: [
          ['Club Number', 'Club Name', 'Division', 'Area', 'Active Members'],
          ['1234', 'Club A', 'A', '1', '25'],
          ['5678', 'Club B', 'A', '2', '18'],
          ['9012', 'Club C', 'B', '1', '32'],
        ],
        divisionPerformance: [],
        districtPerformance: [
          ['Club', 'Total to Date'],
          ['1234', '30'],
          ['5678', '22'],
          ['9012', '40'],
        ],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      expect(result.divisions).toHaveLength(2)
      expect(result.divisions[0]).toEqual({
        divisionId: 'A',
        divisionName: 'Division A',
        clubCount: 2,
        membershipTotal: 43,
        paymentsTotal: 52,
      })
      expect(result.divisions[1]).toEqual({
        divisionId: 'B',
        divisionName: 'Division B',
        clubCount: 1,
        membershipTotal: 32,
        paymentsTotal: 40,
      })
    })

    it('should extract area statistics from club performance data', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [
          [
            'Club Number',
            'Club Name',
            'Division',
            'Area',
            'Active Members',
            'Total to Date',
          ],
          ['1234', 'Club A', 'A', '1', '25', '30'],
          ['5678', 'Club B', 'A', '1', '18', '22'],
          ['9012', 'Club C', 'A', '2', '32', '40'],
        ],
        divisionPerformance: [],
        districtPerformance: [],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      expect(result.areas).toHaveLength(2)

      const area1 = result.areas.find(a => a.areaId === '1')
      expect(area1).toBeDefined()
      expect(area1?.clubCount).toBe(2)
      expect(area1?.membershipTotal).toBe(43) // 25 + 18
      expect(area1?.paymentsTotal).toBe(52) // 30 + 22

      const area2 = result.areas.find(a => a.areaId === '2')
      expect(area2).toBeDefined()
      expect(area2?.clubCount).toBe(1)
      expect(area2?.membershipTotal).toBe(32)
      expect(area2?.paymentsTotal).toBe(40)
    })

    it('should filter out footer rows containing "Month of"', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [
          ['Club Number', 'Club Name', 'Division', 'Area', 'Active Members'],
          ['1234', 'Test Club', 'A', '1', '25'],
          ['Month of Mar, As of 03/24/2024', '', '', '', ''],
        ],
        divisionPerformance: [],
        districtPerformance: [],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      expect(result.clubs).toHaveLength(1)
      expect(result.clubs[0]?.clubId).toBe('1234')
    })

    it('should skip records without required club ID or name', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [
          ['Club Number', 'Club Name', 'Division', 'Area', 'Active Members'],
          ['1234', 'Valid Club', 'A', '1', '25'],
          ['', 'No ID Club', 'A', '2', '18'],
          ['5678', '', 'B', '1', '20'],
        ],
        divisionPerformance: [],
        districtPerformance: [],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      expect(result.clubs).toHaveLength(1)
      expect(result.clubs[0]?.clubId).toBe('1234')
    })

    it('should handle alternative column names', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [
          ['ClubId', 'ClubName', 'Div', 'Area', 'Members', 'Payments'],
          ['1234', 'Test Club', 'A', '1', '25', '30'],
        ],
        divisionPerformance: [],
        districtPerformance: [],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      expect(result.clubs).toHaveLength(1)
      expect(result.clubs[0]?.clubId).toBe('1234')
      expect(result.clubs[0]?.clubName).toBe('Test Club')
      expect(result.clubs[0]?.divisionId).toBe('A')
      expect(result.clubs[0]?.membershipCount).toBe(25)
    })

    it('should count distinguished clubs correctly', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [
          [
            'Club Number',
            'Club Name',
            'Division',
            'Area',
            'Active Members',
            'Club Distinguished Status',
          ],
          ['1234', 'Club A', 'A', '1', '25', 'Distinguished'],
          ['5678', 'Club B', 'A', '2', '18', 'Select Distinguished'],
          ['9012', 'Club C', 'B', '1', '32', "President's Distinguished"],
          ['3456', 'Club D', 'B', '2', '20', ''],
        ],
        divisionPerformance: [],
        districtPerformance: [],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      // #1124: per-tier counts are disjoint — distinguishedClubs is the
      // D tier only, no longer a cumulative distinguished-or-better total.
      expect(result.totals.distinguishedClubs).toBe(1)
      expect(result.totals.selectDistinguishedClubs).toBe(1)
      expect(result.totals.presidentDistinguishedClubs).toBe(1)
      expect(result.totals.smedleyDistinguishedClubs).toBe(0)
    })

    it('should handle numeric values as strings', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [
          ['Club Number', 'Club Name', 'Division', 'Area', 'Active Members'],
          ['1234', 'Test Club', 'A', '1', '25'],
        ],
        divisionPerformance: [],
        districtPerformance: [
          ['Club', 'Total to Date'],
          ['1234', '30'],
        ],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      expect(result.clubs[0]?.membershipCount).toBe(25)
      expect(result.clubs[0]?.paymentsCount).toBe(30)
    })

    it('should handle missing optional fields gracefully', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [
          ['Club Number', 'Club Name'],
          ['1234', 'Test Club'],
        ],
        divisionPerformance: [],
        districtPerformance: [],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      expect(result.clubs).toHaveLength(1)
      expect(result.clubs[0]?.divisionId).toBe('')
      expect(result.clubs[0]?.areaId).toBe('')
      expect(result.clubs[0]?.divisionName).toBe('Unknown Division')
      expect(result.clubs[0]?.areaName).toBe('Unknown Area')
      expect(result.clubs[0]?.membershipCount).toBe(0)
      expect(result.clubs[0]?.paymentsCount).toBe(0)
    })

    /**
     * Division/Area parsing tests
     * Requirements: 4.1, 4.2
     * - Parse 'Division' field to extract divisionId and divisionName
     * - Parse 'Area' field to extract areaId and areaName
     */
    describe('division and area parsing', () => {
      it('should parse "Division X" format correctly', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            ['Club Number', 'Club Name', 'Division', 'Area'],
            ['1234', 'Test Club', 'Division A', 'Area 12'],
          ],
          divisionPerformance: [],
          districtPerformance: [],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs[0]?.divisionId).toBe('A')
        expect(result.clubs[0]?.divisionName).toBe('Division A')
        expect(result.clubs[0]?.areaId).toBe('12')
        expect(result.clubs[0]?.areaName).toBe('Area 12')
      })

      it('should construct name when only ID is provided', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            ['Club Number', 'Club Name', 'Division', 'Area'],
            ['1234', 'Test Club', 'B', '5'],
          ],
          divisionPerformance: [],
          districtPerformance: [],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs[0]?.divisionId).toBe('B')
        expect(result.clubs[0]?.divisionName).toBe('Division B')
        expect(result.clubs[0]?.areaId).toBe('5')
        expect(result.clubs[0]?.areaName).toBe('Area 5')
      })

      it('should handle case-insensitive "division" and "area" prefixes', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            ['Club Number', 'Club Name', 'Division', 'Area'],
            ['1234', 'Test Club', 'DIVISION C', 'AREA 99'],
          ],
          divisionPerformance: [],
          districtPerformance: [],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs[0]?.divisionId).toBe('C')
        expect(result.clubs[0]?.divisionName).toBe('DIVISION C')
        expect(result.clubs[0]?.areaId).toBe('99')
        expect(result.clubs[0]?.areaName).toBe('AREA 99')
      })

      it('should use defaults when division/area fields are empty', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            ['Club Number', 'Club Name', 'Division', 'Area'],
            ['1234', 'Test Club', '', ''],
          ],
          divisionPerformance: [],
          districtPerformance: [],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs[0]?.divisionId).toBe('')
        expect(result.clubs[0]?.divisionName).toBe('Unknown Division')
        expect(result.clubs[0]?.areaId).toBe('')
        expect(result.clubs[0]?.areaName).toBe('Unknown Area')
      })
    })

    /**
     * Payment field extraction tests
     * Requirements: 1.2, 1.3, 1.4, 1.5
     * - Payment fields (octoberRenewals, aprilRenewals, newMembers, paymentsCount)
     *   are sourced from districtPerformance records, matched by club ID
     */
    describe('payment field extraction', () => {
      it('should extract all payment fields from districtPerformance when present', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            ['Club Number', 'Club Name'],
            ['1234', 'Test Club'],
          ],
          divisionPerformance: [],
          districtPerformance: [
            ['Club', 'Oct. Ren.', 'Apr. Ren.', 'New Members', 'Total to Date'],
            ['1234', '15', '12', '8', '35'],
          ],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs[0]?.octoberRenewals).toBe(15)
        expect(result.clubs[0]?.aprilRenewals).toBe(12)
        expect(result.clubs[0]?.newMembers).toBe(8)
        expect(result.clubs[0]?.paymentsCount).toBe(35)
      })

      it('should default payment fields to 0 when missing from both sources', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            ['Club Number', 'Club Name'],
            ['1234', 'Test Club'],
          ],
          divisionPerformance: [],
          districtPerformance: [],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs[0]?.octoberRenewals).toBe(0)
        expect(result.clubs[0]?.aprilRenewals).toBe(0)
        expect(result.clubs[0]?.newMembers).toBe(0)
        expect(result.clubs[0]?.paymentsCount).toBe(0)
      })

      it('should handle alternative payment column names in districtPerformance', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            ['Club Number', 'Club Name'],
            ['1234', 'Test Club'],
          ],
          divisionPerformance: [],
          districtPerformance: [
            ['Club', 'Oct. Ren', 'Apr. Ren', 'New', 'Total to Date'],
            ['1234', '10', '5', '3', '18'],
          ],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs[0]?.octoberRenewals).toBe(10)
        expect(result.clubs[0]?.aprilRenewals).toBe(5)
        expect(result.clubs[0]?.newMembers).toBe(3)
        expect(result.clubs[0]?.paymentsCount).toBe(18)
      })

      it('should handle non-numeric payment values in districtPerformance gracefully', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            ['Club Number', 'Club Name'],
            ['1234', 'Test Club'],
          ],
          divisionPerformance: [],
          districtPerformance: [
            ['Club', 'Oct. Ren.', 'Apr. Ren.', 'New Members', 'Total to Date'],
            ['1234', 'N/A', '', 'invalid', 'bad'],
          ],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs[0]?.octoberRenewals).toBe(0)
        expect(result.clubs[0]?.aprilRenewals).toBe(0)
        expect(result.clubs[0]?.newMembers).toBe(0)
        expect(result.clubs[0]?.paymentsCount).toBe(0)
      })
    })

    /**
     * District performance merge behavior tests
     * Requirements: 1.6, 1.7, 3.1, 3.2
     * - Fallback to clubPerformance when no districtPerformance match exists
     * - Backward compatibility with empty districtPerformance
     * - Non-payment fields always sourced from clubPerformance
     */
    describe('district performance merge behavior', () => {
      it('should fall back to clubPerformance values when no districtPerformance match exists', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            [
              'Club Number',
              'Club Name',
              'Division',
              'Area',
              'Active Members',
              'Oct. Ren.',
              'Apr. Ren.',
              'New Members',
              'Total to Date',
            ],
            ['1234', 'Fallback Club', 'A', '1', '20', '3', '2', '1', '6'],
          ],
          divisionPerformance: [],
          districtPerformance: [
            ['Club', 'Oct. Ren.', 'Apr. Ren.', 'New Members', 'Total to Date'],
            ['9999', '50', '40', '30', '120'],
          ],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs).toHaveLength(1)
        expect(result.clubs[0]?.clubId).toBe('1234')
        expect(result.clubs[0]?.octoberRenewals).toBe(3)
        expect(result.clubs[0]?.aprilRenewals).toBe(2)
        expect(result.clubs[0]?.newMembers).toBe(1)
        expect(result.clubs[0]?.paymentsCount).toBe(6)
      })

      it('should produce identical output with empty districtPerformance as old implementation', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            [
              'Club Number',
              'Club Name',
              'Division',
              'Area',
              'Active Members',
              'Goals Met',
              'Mem. Base',
              'Oct. Ren.',
              'Apr. Ren.',
              'New Members',
              'Total to Date',
              'Club Status',
            ],
            [
              '5678',
              'Legacy Club',
              'B',
              '3',
              '22',
              '4',
              '18',
              '7',
              '5',
              '3',
              '15',
              'Active',
            ],
          ],
          divisionPerformance: [],
          districtPerformance: [],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs).toHaveLength(1)
        expect(result.clubs[0]).toEqual({
          clubId: '5678',
          clubName: 'Legacy Club',
          divisionId: 'B',
          areaId: '3',
          divisionName: 'Division B',
          areaName: 'Area 3',
          membershipCount: 22,
          dcpGoals: 4,
          membershipBase: 18,
          status: 'Active',
          clubStatus: 'Active',
          octoberRenewals: 7,
          aprilRenewals: 5,
          newMembers: 3,
          paymentsCount: 15,
        })
      })

      it('should source non-payment fields from clubPerformance even when districtPerformance has different values', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            [
              'Club Number',
              'Club Name',
              'Division',
              'Area',
              'Active Members',
              'Goals Met',
              'Mem. Base',
              'Club Status',
            ],
            ['1234', 'Club From CP', 'A', '1', '25', '5', '20', 'Active'],
          ],
          divisionPerformance: [],
          districtPerformance: [
            [
              'Club',
              'Club Name',
              'Division',
              'Area',
              'Active Members',
              'Goals Met',
              'Mem. Base',
              'Club Status',
              'Oct. Ren.',
              'Apr. Ren.',
              'New Members',
              'Total to Date',
            ],
            [
              '1234',
              'Club From DP',
              'Z',
              '99',
              '999',
              '10',
              '888',
              'Suspended',
              '12',
              '8',
              '4',
              '24',
            ],
          ],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs).toHaveLength(1)
        const club = result.clubs[0]

        // Non-payment fields MUST come from clubPerformance
        expect(club?.clubName).toBe('Club From CP')
        expect(club?.divisionId).toBe('A')
        expect(club?.areaId).toBe('1')
        expect(club?.membershipCount).toBe(25)
        expect(club?.dcpGoals).toBe(5)
        expect(club?.membershipBase).toBe(20)
        expect(club?.clubStatus).toBe('Active')

        // Payment fields MUST come from districtPerformance
        expect(club?.octoberRenewals).toBe(12)
        expect(club?.aprilRenewals).toBe(8)
        expect(club?.newMembers).toBe(4)
        expect(club?.paymentsCount).toBe(24)
      })
    })

    /**
     * Real-world regression tests
     *
     * These tests reproduce actual bugs found in production data.
     * Each test documents the specific club/data that triggered the bug
     * so future-you understands why the test exists and what it protects.
     *
     * Requirements: 1.2, 1.3, 1.4, 1.5, 2.1, 2.2
     */
    describe('real-world regression tests', () => {
      /**
       * Bug report: Club 00009905 had payment data in district-performance.csv
       * but NOT in club-performance.csv. The club ID appears as '00009905' in
       * club-performance.csv (with leading zeros) and '9905' in
       * district-performance.csv (without leading zeros). The normalizeClubId
       * logic must strip leading zeros so these IDs match during the merge.
       *
       * Expected values from the bug report:
       *   octoberRenewals = 9
       *   aprilRenewals   = 4
       *   newMembers       = 2
       *   paymentsCount    = 16
       *
       * Validates: Requirements 1.2, 1.3, 1.4, 1.5, 2.1, 2.2
       */
      it('should merge payment data for Club 00009905 despite leading-zero mismatch between CSV sources', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            [
              'Club Number',
              'Club Name',
              'Division',
              'Area',
              'Active Members',
              'Goals Met',
              'Mem. Base',
              'Club Status',
            ],
            [
              '00009905',
              'Regression Test Club',
              'C',
              '7',
              '15',
              '3',
              '12',
              'Active',
            ],
          ],
          divisionPerformance: [],
          districtPerformance: [
            ['Club', 'Oct. Ren.', 'Apr. Ren.', 'New Members', 'Total to Date'],
            ['9905', '9', '4', '2', '16'],
          ],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs).toHaveLength(1)
        const club = result.clubs[0]

        // Payment fields MUST come from districtPerformance (club ID '9905')
        // despite clubPerformance using '00009905' — normalization bridges the gap
        expect(club?.octoberRenewals).toBe(9)
        expect(club?.aprilRenewals).toBe(4)
        expect(club?.newMembers).toBe(2)
        expect(club?.paymentsCount).toBe(16)

        // Non-payment fields MUST still come from clubPerformance. The id
        // itself is stored in the CANONICAL form (#1440) — the transformer
        // no longer preserves whichever padding that day's export happened
        // to use, because every downstream key inherits it.
        expect(club?.clubId).toBe('9905')
        expect(club?.clubName).toBe('Regression Test Club')
        expect(club?.divisionId).toBe('C')
        expect(club?.areaId).toBe('7')
        expect(club?.membershipCount).toBe(15)
        expect(club?.dcpGoals).toBe(3)
        expect(club?.membershipBase).toBe(12)
        expect(club?.clubStatus).toBe('Active')
      })
    })

    /**
     * Membership base extraction tests
     * Requirements: 2.7
     * - Extract membershipBase for net growth calculation
     */
    describe('membership base extraction', () => {
      it('should extract membership base when present', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            ['Club Number', 'Club Name', 'Mem. Base'],
            ['1234', 'Test Club', '22'],
          ],
          divisionPerformance: [],
          districtPerformance: [],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs[0]?.membershipBase).toBe(22)
      })

      it('should default membership base to 0 when missing', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            ['Club Number', 'Club Name'],
            ['1234', 'Test Club'],
          ],
          divisionPerformance: [],
          districtPerformance: [],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs[0]?.membershipBase).toBe(0)
      })

      it('should handle alternative membership base column names', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            ['Club Number', 'Club Name', 'Membership Base'],
            ['1234', 'Test Club', '18'],
          ],
          divisionPerformance: [],
          districtPerformance: [],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs[0]?.membershipBase).toBe(18)
      })
    })

    /**
     * Club status extraction tests
     * Requirements: 9.1
     * - Extract club operational status (Active, Suspended, Low, Ineligible)
     */
    describe('club status extraction', () => {
      it('should extract Active club status', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            ['Club Number', 'Club Name', 'Club Status'],
            ['1234', 'Test Club', 'Active'],
          ],
          divisionPerformance: [],
          districtPerformance: [],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs[0]?.clubStatus).toBe('Active')
      })

      it('should extract Suspended club status', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            ['Club Number', 'Club Name', 'Club Status'],
            ['1234', 'Test Club', 'Suspended'],
          ],
          divisionPerformance: [],
          districtPerformance: [],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs[0]?.clubStatus).toBe('Suspended')
      })

      it('should extract Low club status', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            ['Club Number', 'Club Name', 'Club Status'],
            ['1234', 'Test Club', 'Low'],
          ],
          divisionPerformance: [],
          districtPerformance: [],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs[0]?.clubStatus).toBe('Low')
      })

      it('should extract Ineligible club status', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            ['Club Number', 'Club Name', 'Club Status'],
            ['1234', 'Test Club', 'Ineligible'],
          ],
          divisionPerformance: [],
          districtPerformance: [],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs[0]?.clubStatus).toBe('Ineligible')
      })

      it('should leave clubStatus undefined when not present', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            ['Club Number', 'Club Name'],
            ['1234', 'Test Club'],
          ],
          divisionPerformance: [],
          districtPerformance: [],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs[0]?.clubStatus).toBeUndefined()
      })

      it('should handle alternative Status column name', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            ['Club Number', 'Club Name', 'Status'],
            ['1234', 'Test Club', 'Suspended'],
          ],
          divisionPerformance: [],
          districtPerformance: [],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs[0]?.clubStatus).toBe('Suspended')
      })

      it('should handle multiple clubs with different statuses', async () => {
        const csvData: RawCSVData = {
          clubPerformance: [
            ['Club Number', 'Club Name', 'Club Status'],
            ['1234', 'Active Club', 'Active'],
            ['5678', 'Suspended Club', 'Suspended'],
            ['9012', 'Low Club', 'Low'],
            ['3456', 'Ineligible Club', 'Ineligible'],
          ],
          divisionPerformance: [],
          districtPerformance: [],
        }

        const result = await transformer.transformRawCSV(
          '2024-01-15',
          'D101',
          csvData
        )

        expect(result.clubs).toHaveLength(4)
        expect(result.clubs[0]?.clubStatus).toBe('Active')
        expect(result.clubs[1]?.clubStatus).toBe('Suspended')
        expect(result.clubs[2]?.clubStatus).toBe('Low')
        expect(result.clubs[3]?.clubStatus).toBe('Ineligible')
      })
    })
  })

  describe('createSnapshot', () => {
    it('should create a snapshot with correct metadata', async () => {
      const districts: DistrictStatistics[] = [
        {
          districtId: 'D101',
          snapshotDate: '2024-01-15',
          clubs: [],
          divisions: [],
          areas: [],
          totals: {
            totalClubs: 0,
            totalMembership: 0,
            totalPayments: 0,
            distinguishedClubs: 0,
            selectDistinguishedClubs: 0,
            presidentDistinguishedClubs: 0,
          },
          // Raw CSV data arrays - required for frontend division/area calculations
          clubPerformance: [],
          divisionPerformance: [],
          districtPerformance: [],
        },
      ]

      const snapshot = await transformer.createSnapshot('2024-01-15', districts)

      expect(snapshot.metadata.snapshotDate).toBe('2024-01-15')
      expect(snapshot.metadata.districtCount).toBe(1)
      expect(snapshot.metadata.version).toBe('1.0.0')
      expect(snapshot.metadata.createdAt).toBeDefined()
      expect(snapshot.districts).toHaveLength(1)
      expect(snapshot.districts[0]?.districtId).toBe('D101')
    })

    it('should create a snapshot with multiple districts', async () => {
      const districts: DistrictStatistics[] = [
        {
          districtId: 'D101',
          snapshotDate: '2024-01-15',
          clubs: [],
          divisions: [],
          areas: [],
          totals: {
            totalClubs: 10,
            totalMembership: 250,
            totalPayments: 300,
            distinguishedClubs: 2,
            selectDistinguishedClubs: 1,
            presidentDistinguishedClubs: 0,
          },
          // Raw CSV data arrays - required for frontend division/area calculations
          clubPerformance: [],
          divisionPerformance: [],
          districtPerformance: [],
        },
        {
          districtId: 'D102',
          snapshotDate: '2024-01-15',
          clubs: [],
          divisions: [],
          areas: [],
          totals: {
            totalClubs: 15,
            totalMembership: 400,
            totalPayments: 450,
            distinguishedClubs: 5,
            selectDistinguishedClubs: 2,
            presidentDistinguishedClubs: 1,
          },
          // Raw CSV data arrays - required for frontend division/area calculations
          clubPerformance: [],
          divisionPerformance: [],
          districtPerformance: [],
        },
      ]

      const snapshot = await transformer.createSnapshot('2024-01-15', districts)

      expect(snapshot.metadata.districtCount).toBe(2)
      expect(snapshot.districts).toHaveLength(2)
    })

    it('should handle empty districts array', async () => {
      const snapshot = await transformer.createSnapshot('2024-01-15', [])

      expect(snapshot.metadata.districtCount).toBe(0)
      expect(snapshot.districts).toHaveLength(0)
    })
  })

  describe('with custom logger', () => {
    it('should use provided logger for diagnostic output', async () => {
      const logs: string[] = []
      const customLogger = {
        info: (msg: string) => logs.push(`INFO: ${msg}`),
        warn: (msg: string) => logs.push(`WARN: ${msg}`),
        error: (msg: string) => logs.push(`ERROR: ${msg}`),
        debug: (msg: string) => logs.push(`DEBUG: ${msg}`),
      }

      const loggedTransformer = new DataTransformer({ logger: customLogger })

      const csvData: RawCSVData = {
        clubPerformance: [
          ['Club Number', 'Club Name', 'Active Members'],
          ['1234', 'Test Club', '25'],
        ],
        divisionPerformance: [],
        districtPerformance: [],
      }

      await loggedTransformer.transformRawCSV('2024-01-15', 'D101', csvData)

      expect(logs.some(log => log.includes('Transforming raw CSV data'))).toBe(
        true
      )
      expect(
        logs.some(log => log.includes('CSV transformation complete'))
      ).toBe(true)
    })
  })

  /**
   * Raw Data Preservation Tests
   *
   * These tests verify that the DataTransformer preserves raw CSV arrays
   * in the output for frontend consumption. The frontend's extractDivisionPerformance
   * function requires these raw arrays to calculate division/area status and
   * recognition levels.
   *
   * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
   * - 1.1: Include original divisionPerformance records in output
   * - 1.2: Include original clubPerformance records in output
   * - 1.3: Include original districtPerformance records in output
   * - 1.4: Convert raw CSV 2D arrays to arrays of ScrapedRecord objects
   * - 1.5: Include empty array when raw CSV array is empty or missing
   * - 1.6: Preserve all original column names and values from CSV files
   */
  describe('raw data preservation', () => {
    /**
     * Test CSV with Division Club Base, Area Club Base columns preserved
     * Validates: Requirements 1.1, 1.6
     */
    it('should preserve Division Club Base and Area Club Base columns in divisionPerformance', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [],
        divisionPerformance: [
          [
            'Division',
            'Area',
            'Club',
            'Division Club Base',
            'Area Club Base',
            'Club Name',
          ],
          ['A', '1', '1234', '5', '3', 'Test Club A'],
          ['A', '2', '5678', '5', '4', 'Test Club B'],
          ['B', '1', '9012', '6', '2', 'Test Club C'],
        ],
        districtPerformance: [],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      // Verify divisionPerformance is included in output
      expect(result.divisionPerformance).toBeDefined()
      expect(result.divisionPerformance).toHaveLength(3)

      // Verify Division Club Base and Area Club Base columns are preserved
      expect(result.divisionPerformance[0]).toEqual({
        Division: 'A',
        Area: '1',
        Club: '1234',
        'Division Club Base': '5',
        'Area Club Base': '3',
        'Club Name': 'Test Club A',
      })
      expect(result.divisionPerformance[1]).toEqual({
        Division: 'A',
        Area: '2',
        Club: '5678',
        'Division Club Base': '5',
        'Area Club Base': '4',
        'Club Name': 'Test Club B',
      })
      expect(result.divisionPerformance[2]).toEqual({
        Division: 'B',
        Area: '1',
        Club: '9012',
        'Division Club Base': '6',
        'Area Club Base': '2',
        'Club Name': 'Test Club C',
      })
    })

    /**
     * Test CSV with Nov Visit award, May visit award columns preserved
     * Validates: Requirements 1.1, 1.6
     */
    it('should preserve Nov Visit award and May visit award columns in divisionPerformance', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [],
        divisionPerformance: [
          [
            'Division',
            'Area',
            'Club',
            'Nov Visit award',
            'May visit award',
            'Club Name',
          ],
          ['A', '1', '1234', '1', '0', 'Test Club A'],
          ['A', '2', '5678', '1', '1', 'Test Club B'],
          ['B', '1', '9012', '0', '0', 'Test Club C'],
        ],
        districtPerformance: [],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      // Verify divisionPerformance is included in output
      expect(result.divisionPerformance).toBeDefined()
      expect(result.divisionPerformance).toHaveLength(3)

      // Verify Nov Visit award and May visit award columns are preserved
      expect(result.divisionPerformance[0]?.['Nov Visit award']).toBe('1')
      expect(result.divisionPerformance[0]?.['May visit award']).toBe('0')
      expect(result.divisionPerformance[1]?.['Nov Visit award']).toBe('1')
      expect(result.divisionPerformance[1]?.['May visit award']).toBe('1')
      expect(result.divisionPerformance[2]?.['Nov Visit award']).toBe('0')
      expect(result.divisionPerformance[2]?.['May visit award']).toBe('0')
    })

    /**
     * Test CSV with Club Status, Club Distinguished Status columns preserved
     * Validates: Requirements 1.2, 1.6
     */
    it('should preserve Club Status and Club Distinguished Status columns in clubPerformance', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [
          [
            'Club Number',
            'Club Name',
            'Division',
            'Area',
            'Club Status',
            'Club Distinguished Status',
          ],
          ['1234', 'Test Club A', 'A', '1', 'Active', 'Distinguished'],
          ['5678', 'Test Club B', 'A', '2', 'Suspended', ''],
          ['9012', 'Test Club C', 'B', '1', 'Low', 'Select Distinguished'],
          [
            '3456',
            'Test Club D',
            'B',
            '2',
            'Active',
            "President's Distinguished",
          ],
        ],
        divisionPerformance: [],
        districtPerformance: [],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      // Verify clubPerformance is included in output
      expect(result.clubPerformance).toBeDefined()
      expect(result.clubPerformance).toHaveLength(4)

      // Verify Club Status and Club Distinguished Status columns are preserved
      expect(result.clubPerformance[0]?.['Club Status']).toBe('Active')
      expect(result.clubPerformance[0]?.['Club Distinguished Status']).toBe(
        'Distinguished'
      )
      expect(result.clubPerformance[1]?.['Club Status']).toBe('Suspended')
      expect(result.clubPerformance[1]?.['Club Distinguished Status']).toBe('')
      expect(result.clubPerformance[2]?.['Club Status']).toBe('Low')
      expect(result.clubPerformance[2]?.['Club Distinguished Status']).toBe(
        'Select Distinguished'
      )
      expect(result.clubPerformance[3]?.['Club Status']).toBe('Active')
      expect(result.clubPerformance[3]?.['Club Distinguished Status']).toBe(
        "President's Distinguished"
      )
    })

    /**
     * The transformed club model must carry the raw 'Club Distinguished
     * Status' value (#1120). Live CSVs use letter codes ('D','S','P','M');
     * extractClubStatus() only keeps word-form values, so without a
     * dedicated field the letter codes were lost and downstream consumers
     * (time-series distinguishedTotal) received the operational status.
     */
    it('should extract distinguishedStatus from Club Distinguished Status, including letter codes (#1120)', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [
          [
            'Club Number',
            'Club Name',
            'Division',
            'Area',
            'Club Status',
            'Club Distinguished Status',
          ],
          ['1234', 'Letter Code Club', 'A', '1', 'Active', 'D'],
          ['5678', 'Word Form Club', 'A', '2', 'Active', 'Distinguished'],
          ['9012', 'Not Yet Club', 'B', '1', 'Low', ''],
        ],
        divisionPerformance: [],
        districtPerformance: [],
      }

      const result = await transformer.transformRawCSV(
        '2026-06-08',
        'D61',
        csvData
      )

      expect(result.clubs[0]?.distinguishedStatus).toBe('D')
      expect(result.clubs[1]?.distinguishedStatus).toBe('Distinguished')
      // Empty / absent column → undefined (heuristic fallback downstream)
      expect(result.clubs[2]?.distinguishedStatus).toBeUndefined()
    })

    it('should leave distinguishedStatus undefined when the column is absent', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [
          ['Club Number', 'Club Name', 'Division', 'Area'],
          ['1234', 'Historical Club', 'A', '1'],
        ],
        divisionPerformance: [],
        districtPerformance: [],
      }

      const result = await transformer.transformRawCSV(
        '2020-01-15',
        'D101',
        csvData
      )

      expect(result.clubs[0]?.distinguishedStatus).toBeUndefined()
    })

    /**
     * Test empty CSV arrays produce empty arrays in output
     * Validates: Requirements 1.5
     */
    it('should produce empty arrays when CSV arrays are empty', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [],
        divisionPerformance: [],
        districtPerformance: [],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      // Verify all raw arrays are empty arrays
      expect(result.clubPerformance).toEqual([])
      expect(result.divisionPerformance).toEqual([])
      expect(result.districtPerformance).toEqual([])
    })

    /**
     * Test missing CSV arrays produce empty arrays in output
     * Validates: Requirements 1.5
     */
    it('should produce empty arrays when CSV arrays are missing (undefined)', async () => {
      const csvData: RawCSVData = {
        // All arrays are undefined/missing
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      // Verify all raw arrays are empty arrays
      expect(result.clubPerformance).toEqual([])
      expect(result.divisionPerformance).toEqual([])
      expect(result.districtPerformance).toEqual([])
    })

    /**
     * Test CSV with only header row produces empty arrays
     * Validates: Requirements 1.5
     */
    it('should produce empty arrays when CSV contains only header row', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [
          [
            'Club Number',
            'Club Name',
            'Division',
            'Area',
            'Club Status',
            'Club Distinguished Status',
          ],
        ],
        divisionPerformance: [
          [
            'Division',
            'Area',
            'Club',
            'Division Club Base',
            'Area Club Base',
            'Nov Visit award',
            'May visit award',
          ],
        ],
        districtPerformance: [
          ['District', 'Total Clubs', 'Total Membership', 'Distinguished'],
        ],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      // Verify all raw arrays are empty (no data rows)
      expect(result.clubPerformance).toEqual([])
      expect(result.divisionPerformance).toEqual([])
      expect(result.districtPerformance).toEqual([])
    })

    /**
     * Test numeric values preserved correctly in raw arrays
     * Validates: Requirements 1.4, 1.6
     */
    it('should preserve numeric string values correctly in raw arrays', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [
          ['Club Number', 'Active Members', 'Goals Met', 'Total to Date'],
          ['1234', '25', '7', '150'],
          ['5678', '18', '3', '95'],
        ],
        divisionPerformance: [
          ['Division', 'Club Count', 'Membership'],
          ['A', '5', '120'],
        ],
        districtPerformance: [
          ['District', 'Total Clubs', 'Total Membership'],
          ['D101', '50', '1250'],
        ],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      // Verify numeric values are preserved as strings in raw arrays
      expect(result.clubPerformance[0]?.['Club Number']).toBe('1234')
      expect(result.clubPerformance[0]?.['Active Members']).toBe('25')
      expect(result.clubPerformance[0]?.['Goals Met']).toBe('7')
      expect(result.clubPerformance[0]?.['Total to Date']).toBe('150')

      expect(result.divisionPerformance[0]?.['Division']).toBe('A')
      expect(result.divisionPerformance[0]?.['Club Count']).toBe('5')
      expect(result.divisionPerformance[0]?.['Membership']).toBe('120')

      expect(result.districtPerformance[0]?.['District']).toBe('D101')
      expect(result.districtPerformance[0]?.['Total Clubs']).toBe('50')
      expect(result.districtPerformance[0]?.['Total Membership']).toBe('1250')
    })

    /**
     * Test string values preserved correctly in raw arrays
     * Validates: Requirements 1.4, 1.6
     */
    it('should preserve string values correctly in raw arrays', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [
          ['Club Number', 'Club Name', 'Division', 'Area', 'Club Status'],
          ['1234', 'Sunrise Speakers', 'Division A', 'Area 12', 'Active'],
          ['5678', "Leader's Edge", 'Division B', 'Area 5', 'Suspended'],
        ],
        divisionPerformance: [
          ['Division', 'Division Name', 'Area'],
          ['A', 'Division Alpha', '1'],
          ['B', 'Division Beta', '2'],
        ],
        districtPerformance: [
          ['District', 'District Name', 'Region'],
          ['D101', 'District 101', 'Region 1'],
        ],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      // Verify string values are preserved exactly
      expect(result.clubPerformance[0]?.['Club Name']).toBe('Sunrise Speakers')
      expect(result.clubPerformance[0]?.['Division']).toBe('Division A')
      expect(result.clubPerformance[0]?.['Area']).toBe('Area 12')
      expect(result.clubPerformance[0]?.['Club Status']).toBe('Active')

      expect(result.clubPerformance[1]?.['Club Name']).toBe("Leader's Edge")
      expect(result.clubPerformance[1]?.['Club Status']).toBe('Suspended')

      expect(result.divisionPerformance[0]?.['Division Name']).toBe(
        'Division Alpha'
      )
      expect(result.divisionPerformance[1]?.['Division Name']).toBe(
        'Division Beta'
      )

      expect(result.districtPerformance[0]?.['District Name']).toBe(
        'District 101'
      )
      expect(result.districtPerformance[0]?.['Region']).toBe('Region 1')
    })

    /**
     * Test districtPerformance raw array is preserved
     * Validates: Requirements 1.3, 1.6
     */
    it('should preserve districtPerformance raw array in output', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [],
        divisionPerformance: [],
        districtPerformance: [
          [
            'District',
            'Total Clubs',
            'Total Membership',
            'Distinguished Clubs',
            'Select Distinguished',
            "President's Distinguished",
          ],
          ['D101', '50', '1250', '15', '8', '5'],
        ],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      // Verify districtPerformance is included in output
      expect(result.districtPerformance).toBeDefined()
      expect(result.districtPerformance).toHaveLength(1)

      // Verify all columns are preserved
      expect(result.districtPerformance[0]).toEqual({
        District: 'D101',
        'Total Clubs': '50',
        'Total Membership': '1250',
        'Distinguished Clubs': '15',
        'Select Distinguished': '8',
        "President's Distinguished": '5',
      })
    })

    /**
     * Test all three raw arrays are included together
     * Validates: Requirements 1.1, 1.2, 1.3
     */
    it('should include all three raw arrays in output simultaneously', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [
          ['Club Number', 'Club Name', 'Club Status'],
          ['1234', 'Test Club', 'Active'],
        ],
        divisionPerformance: [
          ['Division', 'Area', 'Division Club Base'],
          ['A', '1', '5'],
        ],
        districtPerformance: [
          ['District', 'Total Clubs'],
          ['D101', '50'],
        ],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      // Verify all three raw arrays are present
      expect(result.clubPerformance).toHaveLength(1)
      expect(result.divisionPerformance).toHaveLength(1)
      expect(result.districtPerformance).toHaveLength(1)

      // Verify each array has correct data
      expect(result.clubPerformance[0]?.['Club Number']).toBe('1234')
      expect(result.divisionPerformance[0]?.['Division Club Base']).toBe('5')
      expect(result.districtPerformance[0]?.['Total Clubs']).toBe('50')
    })

    /**
     * Test null/empty values in CSV are preserved correctly
     * Validates: Requirements 1.4, 1.6
     */
    it('should preserve null values for missing cell data', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [
          ['Club Number', 'Club Name', 'Division', 'Area', 'Club Status'],
          ['1234', 'Test Club', 'A', '1'], // Missing Club Status
        ],
        divisionPerformance: [],
        districtPerformance: [],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      // Verify the record has the correct number of keys
      expect(result.clubPerformance).toHaveLength(1)
      expect(result.clubPerformance[0]?.['Club Number']).toBe('1234')
      expect(result.clubPerformance[0]?.['Club Name']).toBe('Test Club')
      expect(result.clubPerformance[0]?.['Division']).toBe('A')
      expect(result.clubPerformance[0]?.['Area']).toBe('1')
      // Missing value should be null
      expect(result.clubPerformance[0]?.['Club Status']).toBeNull()
    })

    /**
     * Test that raw arrays are independent of transformed data
     * Validates: Requirements 1.1, 1.2, 1.3
     */
    it('should include raw arrays independent of transformed clubs/divisions/areas', async () => {
      const csvData: RawCSVData = {
        clubPerformance: [
          [
            'Club Number',
            'Club Name',
            'Division',
            'Area',
            'Active Members',
            'Custom Field',
          ],
          ['1234', 'Test Club', 'A', '1', '25', 'Custom Value'],
        ],
        divisionPerformance: [
          ['Division', 'Division Name', 'Extra Column'],
          ['A', 'Division Alpha', 'Extra Data'],
        ],
        districtPerformance: [
          ['District', 'Special Field'],
          ['D101', 'Special Value'],
        ],
      }

      const result = await transformer.transformRawCSV(
        '2024-01-15',
        'D101',
        csvData
      )

      // Verify transformed data exists
      expect(result.clubs).toHaveLength(1)
      expect(result.clubs[0]?.clubId).toBe('1234')

      // Verify raw arrays contain ALL columns including custom ones
      expect(result.clubPerformance[0]?.['Custom Field']).toBe('Custom Value')
      expect(result.divisionPerformance[0]?.['Extra Column']).toBe('Extra Data')
      expect(result.districtPerformance[0]?.['Special Field']).toBe(
        'Special Value'
      )
    })
  })

  /**
   * #1118 (epic #1095) parity pin: dcpGoalsAchieved encodes the official
   * DCP rules verified against TI's own Goals Met (audit 2026-06-09).
   * This fixture must produce the identical array before and after the
   * migration onto the shared goal-definition module.
   */
  describe('dcpGoalsAchieved parity (#1118)', () => {
    const GOAL_HEADER = [
      'Club Number',
      'Club Name',
      'Division',
      'Area',
      'Active Members',
      'Goals Met',
      'Club Status',
      'Mem. Base',
      'Level 1s',
      'Level 2s',
      'Add. Level 2s',
      'Level 3s',
      'Level 4s, Path Completions, or DTM Awards',
      'Add. Level 4s, Path Completions, or DTM award',
      'New Members',
      'Add. New Members',
      'Off. Trained Round 1',
      'Off. Trained Round 2',
      'Mem. dues on time Oct',
      'Mem. dues on time Apr',
      'Off. List On Time',
    ]

    async function goalsFor(goalValues: string[]): Promise<boolean[]> {
      const csvData: RawCSVData = {
        clubPerformance: [
          GOAL_HEADER,
          [
            '1234',
            'Parity Club',
            'A',
            '1',
            '20',
            '0',
            'Active',
            '20',
            ...goalValues,
          ],
        ],
        divisionPerformance: [],
        districtPerformance: [],
      }
      const result = await transformer.transformRawCSV(
        '2026-06-08',
        'D61',
        csvData
      )
      const achieved = result.clubs[0]?.dcpGoalsAchieved
      expect(achieved).toBeDefined()
      return achieved as boolean[]
    }

    it('marks every goal achieved at exactly the official thresholds', async () => {
      // 4 L1s, 2 L2s, 2 add. L2s, 2 L3s, 1 L4/PC/DTM, 1 add., 4 new, 4 add.,
      // 4+4 officers trained, Oct dues + officer list (Apr not needed: OR)
      const achieved = await goalsFor([
        '4',
        '2',
        '2',
        '2',
        '1',
        '1',
        '4',
        '4',
        '4',
        '4',
        '1',
        '0',
        '1',
      ])
      expect(achieved).toEqual(Array(10).fill(true))
    })

    it('marks every goal unachieved one below the official thresholds', async () => {
      // One short on each counted goal; goal 10 has dues but no officer list
      const achieved = await goalsFor([
        '3',
        '1',
        '1',
        '1',
        '0',
        '0',
        '3',
        '3',
        '4',
        '3',
        '1',
        '1',
        '0',
      ])
      expect(achieved).toEqual(Array(10).fill(false))
    })

    it('passes goal 10 with Apr-only dues + officer list', async () => {
      const achieved = await goalsFor([
        '0',
        '0',
        '0',
        '0',
        '0',
        '0',
        '0',
        '0',
        '0',
        '0',
        '0',
        '1',
        '1',
      ])
      expect(achieved?.[9]).toBe(true)
      expect(achieved?.slice(0, 9)).toEqual(Array(9).fill(false))
    })

    /**
     * #1399: TI renamed goals 2-3 for PY 2026-27 ('Level 2s or EOM'). The
     * old detector keyed on goal 1's unchanged header, so the transformer
     * published dcpGoalsAchieved with two goals stuck at false. An export
     * whose headers we cannot resolve must omit the field — and say so.
     */
    describe('unknown goal headers (#1399)', () => {
      const transformWith = async (header: string[]) => {
        const logger = {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        }
        const result = await new DataTransformer({ logger }).transformRawCSV(
          '2026-08-01',
          '61',
          {
            clubPerformance: [
              header,
              [
                '1234',
                'Header Drift Club',
                'A',
                '1',
                '20',
                '0',
                'Active',
                '20',
                ...(Array(header.length - 8).fill('4') as string[]),
              ],
            ],
            divisionPerformance: [],
            districtPerformance: [],
          }
        )
        return { club: result.clubs[0], logger }
      }

      const PY_2026_27_HEADER = GOAL_HEADER.map(column =>
        column === 'Level 2s'
          ? 'Level 2s or EOM'
          : column === 'Add. Level 2s'
            ? 'Add. Level 2s or EOM'
            : column
      )

      it('publishes goals for the PY 2026-27 header, silently', async () => {
        const { club, logger } = await transformWith(PY_2026_27_HEADER)
        expect(club?.dcpGoalsAchieved).toEqual(Array(10).fill(true))
        expect(logger.warn).not.toHaveBeenCalled()
      })

      it('omits dcpGoalsAchieved and warns when a header is unrecognised', async () => {
        const drifted = PY_2026_27_HEADER.map(column =>
          column === 'Level 2s or EOM' ? 'Level 2s or Whatever TI Adds' : column
        )
        const { club, logger } = await transformWith(drifted)

        expect(club?.dcpGoalsAchieved).toBeUndefined()
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('no recognised header for some DCP goals'),
          expect.objectContaining({ missingGoals: [2] })
        )
      })
    })
  })
})
