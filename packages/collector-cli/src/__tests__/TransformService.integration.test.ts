/**
 * Integration Tests for TransformService - Raw Data Preservation
 *
 * Tests the complete transformation pipeline to verify that raw CSV arrays
 * are correctly preserved in the transformed output and that the output
 * passes Zod validation.
 *
 * These tests validate Property 4 (Backend Data Integrity) from the design:
 * - Transform CSV files with known content → verify JSON output contains exact raw arrays
 * - Read generated JSON file → verify Zod validation passes
 * - Verify specific column values are preserved exactly as input
 *
 * Requirements: 1.1, 1.2, 1.3, 1.6, 4.1, 4.2
 * - 1.1: Include original divisionPerformance records in output
 * - 1.2: Include original clubPerformance records in output
 * - 1.3: Include original districtPerformance records in output
 * - 1.6: Preserve all original column names and values from CSV files
 * - 4.1: Backend serves raw data fields from snapshot
 * - 4.2: Backend serves data exactly as stored in snapshot
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { TransformService } from '../services/TransformService.js'
import {
  DistrictStatisticsFileSchema,
  type PerDistrictData,
} from '@taverns-red/shared-contracts'

/**
 * Create an isolated test cache directory with unique ID for parallel test safety.
 *
 * Per testing steering document:
 * - Use unique, isolated directories created per test (timestamps/random IDs)
 * - Clean up all created files in afterEach hooks
 */
function createIsolatedCacheDir(): {
  path: string
  cleanup: () => Promise<void>
} {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}-${process.pid}`
  const cachePath = path.join(
    os.tmpdir(),
    `transform-service-raw-data-test-${uniqueId}`
  )

  return {
    path: cachePath,
    cleanup: async () => {
      await fs.rm(cachePath, { recursive: true, force: true })
    },
  }
}

/**
 * Sample club performance CSV with all required fields for frontend division/area calculations.
 * Includes Club Status and Club Distinguished Status columns.
 */
const SAMPLE_CLUB_PERFORMANCE_CSV = `Club Number,Club Name,Division,Area,Active Members,Total to Date,Goals Met,Club Status,Club Distinguished Status,Oct. Ren.,Apr. Ren.,New Members,Mem. Base
1234,Alpha Speakers,A,1,25,30,7,Active,Distinguished,10,8,7,20
5678,Beta Toastmasters,A,2,18,22,5,Active,Select Distinguished,6,5,7,15
9012,Gamma Club,B,1,12,15,3,Suspended,,4,3,5,10
3456,Delta Speakers,B,2,8,10,2,Low,President's Distinguished,2,2,4,8`

/**
 * Sample division performance CSV with Division Club Base, Area Club Base,
 * and visit award fields required by frontend.
 */
const SAMPLE_DIVISION_PERFORMANCE_CSV = `Division,Area,Club,Club Name,Division Club Base,Area Club Base,Nov Visit award,May visit award
A,1,1234,Alpha Speakers,5,3,1,0
A,2,5678,Beta Toastmasters,5,4,1,1
B,1,9012,Gamma Club,6,2,0,0
B,2,3456,Delta Speakers,6,3,0,1`

/**
 * Sample district performance CSV with district-level statistics.
 */
const SAMPLE_DISTRICT_PERFORMANCE_CSV = `District,Total Clubs,Total Membership,Distinguished Clubs,Select Distinguished,President's Distinguished
D101,50,1250,15,8,5`

/**
 * Write raw CSV files for a district to the test cache.
 * Creates the directory structure expected by TransformService.
 */
async function writeRawCSVFiles(
  cacheDir: string,
  date: string,
  districtId: string,
  clubCsv: string,
  divisionCsv: string,
  districtCsv: string
): Promise<void> {
  const districtDir = path.join(
    cacheDir,
    'raw-csv',
    date,
    `district-${districtId}`
  )
  await fs.mkdir(districtDir, { recursive: true })

  await fs.writeFile(
    path.join(districtDir, 'club-performance.csv'),
    clubCsv,
    'utf-8'
  )
  await fs.writeFile(
    path.join(districtDir, 'division-performance.csv'),
    divisionCsv,
    'utf-8'
  )
  await fs.writeFile(
    path.join(districtDir, 'district-performance.csv'),
    districtCsv,
    'utf-8'
  )
}

describe('TransformService Integration Tests - Raw Data Preservation', () => {
  let testCache: { path: string; cleanup: () => Promise<void> }
  let transformService: TransformService

  beforeEach(async () => {
    // Create isolated cache directory for this test
    testCache = createIsolatedCacheDir()
    await fs.mkdir(testCache.path, { recursive: true })

    // Create fresh service instance per test via dependency injection
    transformService = new TransformService({
      cacheDir: testCache.path,
    })
  })

  afterEach(async () => {
    // Clean up all created files
    await testCache.cleanup()
  })

  describe('Raw Data Arrays in Transformed Output (Property 4: Backend Data Integrity)', () => {
    /**
     * Validates: Requirements 1.1, 1.2, 1.3
     * Transform CSV files with known content → verify JSON output contains exact raw arrays
     */
    it('should include all three raw arrays in transformed district JSON', async () => {
      const date = '2024-01-15'
      const districtId = '101'

      // Write raw CSV files
      await writeRawCSVFiles(
        testCache.path,
        date,
        districtId,
        SAMPLE_CLUB_PERFORMANCE_CSV,
        SAMPLE_DIVISION_PERFORMANCE_CSV,
        SAMPLE_DISTRICT_PERFORMANCE_CSV
      )

      // Transform raw CSV to snapshot
      const transformResult = await transformService.transform({
        date,
        districts: [districtId],
      })

      expect(transformResult.success).toBe(true)
      expect(transformResult.districtsSucceeded).toContain(districtId)

      // Read the generated JSON file
      const snapshotPath = path.join(
        testCache.path,
        'snapshots',
        date,
        `district_${districtId}.json`
      )
      const snapshotContent = await fs.readFile(snapshotPath, 'utf-8')
      const wrapper = JSON.parse(snapshotContent) as PerDistrictData

      // Verify all three raw arrays are present
      expect(wrapper.data.clubPerformance).toBeDefined()
      expect(wrapper.data.divisionPerformance).toBeDefined()
      expect(wrapper.data.districtPerformance).toBeDefined()

      // Verify arrays have correct lengths (4 clubs, 4 division records, 1 district record)
      expect(wrapper.data.clubPerformance).toHaveLength(4)
      expect(wrapper.data.divisionPerformance).toHaveLength(4)
      expect(wrapper.data.districtPerformance).toHaveLength(1)
    })

    /**
     * Validates: Requirements 1.6, 4.2
     * Verify specific column values are preserved exactly as input
     */
    it('should preserve Club Status and Club Distinguished Status columns exactly', async () => {
      const date = '2024-01-15'
      const districtId = '101'

      await writeRawCSVFiles(
        testCache.path,
        date,
        districtId,
        SAMPLE_CLUB_PERFORMANCE_CSV,
        SAMPLE_DIVISION_PERFORMANCE_CSV,
        SAMPLE_DISTRICT_PERFORMANCE_CSV
      )

      const transformResult = await transformService.transform({
        date,
        districts: [districtId],
      })

      expect(transformResult.success).toBe(true)

      // Read the generated JSON file
      const snapshotPath = path.join(
        testCache.path,
        'snapshots',
        date,
        `district_${districtId}.json`
      )
      const snapshotContent = await fs.readFile(snapshotPath, 'utf-8')
      const wrapper = JSON.parse(snapshotContent) as PerDistrictData

      // Verify Club Status values are preserved exactly
      const clubPerformance = wrapper.data.clubPerformance
      expect(clubPerformance[0]?.['Club Status']).toBe('Active')
      expect(clubPerformance[1]?.['Club Status']).toBe('Active')
      expect(clubPerformance[2]?.['Club Status']).toBe('Suspended')
      expect(clubPerformance[3]?.['Club Status']).toBe('Low')

      // Verify Club Distinguished Status values are preserved exactly
      expect(clubPerformance[0]?.['Club Distinguished Status']).toBe(
        'Distinguished'
      )
      expect(clubPerformance[1]?.['Club Distinguished Status']).toBe(
        'Select Distinguished'
      )
      expect(clubPerformance[2]?.['Club Distinguished Status']).toBe('')
      expect(clubPerformance[3]?.['Club Distinguished Status']).toBe(
        "President's Distinguished"
      )
    })

    /**
     * Validates: Requirements 1.1, 1.6, 4.2
     * Verify Division Club Base and Area Club Base columns are preserved exactly
     */
    it('should preserve Division Club Base and Area Club Base columns exactly', async () => {
      const date = '2024-01-15'
      const districtId = '101'

      await writeRawCSVFiles(
        testCache.path,
        date,
        districtId,
        SAMPLE_CLUB_PERFORMANCE_CSV,
        SAMPLE_DIVISION_PERFORMANCE_CSV,
        SAMPLE_DISTRICT_PERFORMANCE_CSV
      )

      const transformResult = await transformService.transform({
        date,
        districts: [districtId],
      })

      expect(transformResult.success).toBe(true)

      // Read the generated JSON file
      const snapshotPath = path.join(
        testCache.path,
        'snapshots',
        date,
        `district_${districtId}.json`
      )
      const snapshotContent = await fs.readFile(snapshotPath, 'utf-8')
      const wrapper = JSON.parse(snapshotContent) as PerDistrictData

      // Verify Division Club Base and Area Club Base values are preserved exactly
      const divisionPerformance = wrapper.data.divisionPerformance
      expect(divisionPerformance[0]?.['Division Club Base']).toBe('5')
      expect(divisionPerformance[0]?.['Area Club Base']).toBe('3')
      expect(divisionPerformance[1]?.['Division Club Base']).toBe('5')
      expect(divisionPerformance[1]?.['Area Club Base']).toBe('4')
      expect(divisionPerformance[2]?.['Division Club Base']).toBe('6')
      expect(divisionPerformance[2]?.['Area Club Base']).toBe('2')
      expect(divisionPerformance[3]?.['Division Club Base']).toBe('6')
      expect(divisionPerformance[3]?.['Area Club Base']).toBe('3')
    })

    /**
     * Validates: Requirements 1.1, 1.6, 4.2
     * Verify Nov Visit award and May visit award columns are preserved exactly
     */
    it('should preserve Nov Visit award and May visit award columns exactly', async () => {
      const date = '2024-01-15'
      const districtId = '101'

      await writeRawCSVFiles(
        testCache.path,
        date,
        districtId,
        SAMPLE_CLUB_PERFORMANCE_CSV,
        SAMPLE_DIVISION_PERFORMANCE_CSV,
        SAMPLE_DISTRICT_PERFORMANCE_CSV
      )

      const transformResult = await transformService.transform({
        date,
        districts: [districtId],
      })

      expect(transformResult.success).toBe(true)

      // Read the generated JSON file
      const snapshotPath = path.join(
        testCache.path,
        'snapshots',
        date,
        `district_${districtId}.json`
      )
      const snapshotContent = await fs.readFile(snapshotPath, 'utf-8')
      const wrapper = JSON.parse(snapshotContent) as PerDistrictData

      // Verify Nov Visit award and May visit award values are preserved exactly
      const divisionPerformance = wrapper.data.divisionPerformance
      expect(divisionPerformance[0]?.['Nov Visit award']).toBe('1')
      expect(divisionPerformance[0]?.['May visit award']).toBe('0')
      expect(divisionPerformance[1]?.['Nov Visit award']).toBe('1')
      expect(divisionPerformance[1]?.['May visit award']).toBe('1')
      expect(divisionPerformance[2]?.['Nov Visit award']).toBe('0')
      expect(divisionPerformance[2]?.['May visit award']).toBe('0')
      expect(divisionPerformance[3]?.['Nov Visit award']).toBe('0')
      expect(divisionPerformance[3]?.['May visit award']).toBe('1')
    })

    /**
     * Validates: Requirements 1.3, 1.6, 4.2
     * Verify district performance columns are preserved exactly
     */
    it('should preserve district performance columns exactly', async () => {
      const date = '2024-01-15'
      const districtId = '101'

      await writeRawCSVFiles(
        testCache.path,
        date,
        districtId,
        SAMPLE_CLUB_PERFORMANCE_CSV,
        SAMPLE_DIVISION_PERFORMANCE_CSV,
        SAMPLE_DISTRICT_PERFORMANCE_CSV
      )

      const transformResult = await transformService.transform({
        date,
        districts: [districtId],
      })

      expect(transformResult.success).toBe(true)

      // Read the generated JSON file
      const snapshotPath = path.join(
        testCache.path,
        'snapshots',
        date,
        `district_${districtId}.json`
      )
      const snapshotContent = await fs.readFile(snapshotPath, 'utf-8')
      const wrapper = JSON.parse(snapshotContent) as PerDistrictData

      // Verify district performance values are preserved exactly
      const districtPerformance = wrapper.data.districtPerformance
      expect(districtPerformance).toHaveLength(1)
      expect(districtPerformance[0]?.['District']).toBe('D101')
      expect(districtPerformance[0]?.['Total Clubs']).toBe('50')
      expect(districtPerformance[0]?.['Total Membership']).toBe('1250')
      expect(districtPerformance[0]?.['Distinguished Clubs']).toBe('15')
      expect(districtPerformance[0]?.['Select Distinguished']).toBe('8')
      expect(districtPerformance[0]?.["President's Distinguished"]).toBe('5')
    })
  })

  describe('Zod Validation for Generated Files', () => {
    /**
     * Validates: Requirements 4.1, 4.2
     * Read generated JSON file → verify Zod validation passes
     */
    it('should pass Zod validation for generated district statistics file', async () => {
      const date = '2024-01-15'
      const districtId = '101'

      await writeRawCSVFiles(
        testCache.path,
        date,
        districtId,
        SAMPLE_CLUB_PERFORMANCE_CSV,
        SAMPLE_DIVISION_PERFORMANCE_CSV,
        SAMPLE_DISTRICT_PERFORMANCE_CSV
      )

      const transformResult = await transformService.transform({
        date,
        districts: [districtId],
      })

      expect(transformResult.success).toBe(true)

      // Read the generated JSON file
      const snapshotPath = path.join(
        testCache.path,
        'snapshots',
        date,
        `district_${districtId}.json`
      )
      const snapshotContent = await fs.readFile(snapshotPath, 'utf-8')
      const wrapper = JSON.parse(snapshotContent) as PerDistrictData

      // Validate the district statistics data using Zod schema
      const validationResult = DistrictStatisticsFileSchema.safeParse(
        wrapper.data
      )

      expect(validationResult.success).toBe(true)
      if (!validationResult.success) {
        // Log validation errors for debugging if test fails
        console.error('Zod validation errors:', validationResult.error.errors)
      }
    })

    /**
     * Validates: Requirements 4.1, 4.2
     * Verify Zod validation passes for multiple districts
     */
    it('should pass Zod validation for multiple district files', async () => {
      const date = '2024-01-15'
      const districts = ['101', '102']

      // Write CSV files for both districts
      for (const districtId of districts) {
        await writeRawCSVFiles(
          testCache.path,
          date,
          districtId,
          SAMPLE_CLUB_PERFORMANCE_CSV,
          SAMPLE_DIVISION_PERFORMANCE_CSV,
          SAMPLE_DISTRICT_PERFORMANCE_CSV
        )
      }

      const transformResult = await transformService.transform({ date })

      expect(transformResult.success).toBe(true)
      expect(transformResult.districtsSucceeded).toEqual(districts)

      // Validate each generated file
      for (const districtId of districts) {
        const snapshotPath = path.join(
          testCache.path,
          'snapshots',
          date,
          `district_${districtId}.json`
        )
        const snapshotContent = await fs.readFile(snapshotPath, 'utf-8')
        const wrapper = JSON.parse(snapshotContent) as PerDistrictData

        const validationResult = DistrictStatisticsFileSchema.safeParse(
          wrapper.data
        )

        expect(validationResult.success).toBe(true)
        if (!validationResult.success) {
          console.error(
            `Zod validation errors for district ${districtId}:`,
            validationResult.error.errors
          )
        }
      }
    })

    /**
     * Validates: Requirements 1.5, 4.1
     * Verify Zod validation passes when raw arrays are empty
     */
    it('should pass Zod validation when division and district CSV are missing', async () => {
      const date = '2024-01-15'
      const districtId = '101'

      // Write only club performance CSV (minimum required)
      const districtDir = path.join(
        testCache.path,
        'raw-csv',
        date,
        `district-${districtId}`
      )
      await fs.mkdir(districtDir, { recursive: true })
      await fs.writeFile(
        path.join(districtDir, 'club-performance.csv'),
        SAMPLE_CLUB_PERFORMANCE_CSV,
        'utf-8'
      )

      const transformResult = await transformService.transform({
        date,
        districts: [districtId],
      })

      expect(transformResult.success).toBe(true)

      // Read the generated JSON file
      const snapshotPath = path.join(
        testCache.path,
        'snapshots',
        date,
        `district_${districtId}.json`
      )
      const snapshotContent = await fs.readFile(snapshotPath, 'utf-8')
      const wrapper = JSON.parse(snapshotContent) as PerDistrictData

      // Verify empty arrays are present for missing CSV files
      expect(wrapper.data.divisionPerformance).toEqual([])
      expect(wrapper.data.districtPerformance).toEqual([])

      // Validate using Zod schema - should still pass with empty arrays
      const validationResult = DistrictStatisticsFileSchema.safeParse(
        wrapper.data
      )

      expect(validationResult.success).toBe(true)
    })
  })

  describe('Data Integrity Across Pipeline', () => {
    /**
     * Validates: Requirements 4.1, 4.2
     * Verify raw data is preserved exactly through the transformation pipeline
     */
    it('should preserve all column names exactly as they appear in CSV', async () => {
      const date = '2024-01-15'
      const districtId = '101'

      await writeRawCSVFiles(
        testCache.path,
        date,
        districtId,
        SAMPLE_CLUB_PERFORMANCE_CSV,
        SAMPLE_DIVISION_PERFORMANCE_CSV,
        SAMPLE_DISTRICT_PERFORMANCE_CSV
      )

      const transformResult = await transformService.transform({
        date,
        districts: [districtId],
      })

      expect(transformResult.success).toBe(true)

      // Read the generated JSON file
      const snapshotPath = path.join(
        testCache.path,
        'snapshots',
        date,
        `district_${districtId}.json`
      )
      const snapshotContent = await fs.readFile(snapshotPath, 'utf-8')
      const wrapper = JSON.parse(snapshotContent) as PerDistrictData

      // Verify all expected column names are present in clubPerformance
      const clubRecord = wrapper.data.clubPerformance[0]
      expect(clubRecord).toHaveProperty('Club Number')
      expect(clubRecord).toHaveProperty('Club Name')
      expect(clubRecord).toHaveProperty('Division')
      expect(clubRecord).toHaveProperty('Area')
      expect(clubRecord).toHaveProperty('Active Members')
      expect(clubRecord).toHaveProperty('Total to Date')
      expect(clubRecord).toHaveProperty('Goals Met')
      expect(clubRecord).toHaveProperty('Club Status')
      expect(clubRecord).toHaveProperty('Club Distinguished Status')
      expect(clubRecord).toHaveProperty('Oct. Ren.')
      expect(clubRecord).toHaveProperty('Apr. Ren.')
      expect(clubRecord).toHaveProperty('New Members')
      expect(clubRecord).toHaveProperty('Mem. Base')

      // Verify all expected column names are present in divisionPerformance
      const divisionRecord = wrapper.data.divisionPerformance[0]
      expect(divisionRecord).toHaveProperty('Division')
      expect(divisionRecord).toHaveProperty('Area')
      expect(divisionRecord).toHaveProperty('Club')
      expect(divisionRecord).toHaveProperty('Club Name')
      expect(divisionRecord).toHaveProperty('Division Club Base')
      expect(divisionRecord).toHaveProperty('Area Club Base')
      expect(divisionRecord).toHaveProperty('Nov Visit award')
      expect(divisionRecord).toHaveProperty('May visit award')

      // Verify all expected column names are present in districtPerformance
      const districtRecord = wrapper.data.districtPerformance[0]
      expect(districtRecord).toHaveProperty('District')
      expect(districtRecord).toHaveProperty('Total Clubs')
      expect(districtRecord).toHaveProperty('Total Membership')
      expect(districtRecord).toHaveProperty('Distinguished Clubs')
      expect(districtRecord).toHaveProperty('Select Distinguished')
      expect(districtRecord).toHaveProperty("President's Distinguished")
    })

    /**
     * Validates: Requirements 1.2, 1.6, 4.2
     * Verify club performance record values match CSV input exactly
     */
    it('should preserve complete club performance record values exactly', async () => {
      const date = '2024-01-15'
      const districtId = '101'

      await writeRawCSVFiles(
        testCache.path,
        date,
        districtId,
        SAMPLE_CLUB_PERFORMANCE_CSV,
        SAMPLE_DIVISION_PERFORMANCE_CSV,
        SAMPLE_DISTRICT_PERFORMANCE_CSV
      )

      const transformResult = await transformService.transform({
        date,
        districts: [districtId],
      })

      expect(transformResult.success).toBe(true)

      // Read the generated JSON file
      const snapshotPath = path.join(
        testCache.path,
        'snapshots',
        date,
        `district_${districtId}.json`
      )
      const snapshotContent = await fs.readFile(snapshotPath, 'utf-8')
      const wrapper = JSON.parse(snapshotContent) as PerDistrictData

      // Verify first club record matches CSV input exactly
      const firstClub = wrapper.data.clubPerformance[0]
      expect(firstClub).toEqual({
        'Club Number': '1234',
        'Club Name': 'Alpha Speakers',
        Division: 'A',
        Area: '1',
        'Active Members': '25',
        'Total to Date': '30',
        'Goals Met': '7',
        'Club Status': 'Active',
        'Club Distinguished Status': 'Distinguished',
        'Oct. Ren.': '10',
        'Apr. Ren.': '8',
        'New Members': '7',
        'Mem. Base': '20',
      })

      // Verify second club record matches CSV input exactly
      const secondClub = wrapper.data.clubPerformance[1]
      expect(secondClub).toEqual({
        'Club Number': '5678',
        'Club Name': 'Beta Toastmasters',
        Division: 'A',
        Area: '2',
        'Active Members': '18',
        'Total to Date': '22',
        'Goals Met': '5',
        'Club Status': 'Active',
        'Club Distinguished Status': 'Select Distinguished',
        'Oct. Ren.': '6',
        'Apr. Ren.': '5',
        'New Members': '7',
        'Mem. Base': '15',
      })
    })

    /**
     * Validates: Requirements 1.1, 1.6, 4.2
     * Verify division performance record values match CSV input exactly
     */
    it('should preserve complete division performance record values exactly', async () => {
      const date = '2024-01-15'
      const districtId = '101'

      await writeRawCSVFiles(
        testCache.path,
        date,
        districtId,
        SAMPLE_CLUB_PERFORMANCE_CSV,
        SAMPLE_DIVISION_PERFORMANCE_CSV,
        SAMPLE_DISTRICT_PERFORMANCE_CSV
      )

      const transformResult = await transformService.transform({
        date,
        districts: [districtId],
      })

      expect(transformResult.success).toBe(true)

      // Read the generated JSON file
      const snapshotPath = path.join(
        testCache.path,
        'snapshots',
        date,
        `district_${districtId}.json`
      )
      const snapshotContent = await fs.readFile(snapshotPath, 'utf-8')
      const wrapper = JSON.parse(snapshotContent) as PerDistrictData

      // Verify first division record matches CSV input exactly
      const firstDivision = wrapper.data.divisionPerformance[0]
      expect(firstDivision).toEqual({
        Division: 'A',
        Area: '1',
        Club: '1234',
        'Club Name': 'Alpha Speakers',
        'Division Club Base': '5',
        'Area Club Base': '3',
        'Nov Visit award': '1',
        'May visit award': '0',
      })

      // Verify last division record matches CSV input exactly
      const lastDivision = wrapper.data.divisionPerformance[3]
      expect(lastDivision).toEqual({
        Division: 'B',
        Area: '2',
        Club: '3456',
        'Club Name': 'Delta Speakers',
        'Division Club Base': '6',
        'Area Club Base': '3',
        'Nov Visit award': '0',
        'May visit award': '1',
      })
    })
  })
})
