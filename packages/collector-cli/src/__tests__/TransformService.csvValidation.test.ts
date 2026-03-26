/**
 * Tests for corrupt CSV detection during transform (#199)
 *
 * Validates that the TransformService detects and skips corrupt CSVs
 * (e.g., headers-only 478-byte files) instead of producing snapshots
 * with membership: 0.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { TransformService } from '../services/TransformService.js'

/**
 * Create an isolated test cache directory
 */
function createIsolatedCacheDir(): {
  path: string
  cleanup: () => Promise<void>
} {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const cachePath = path.join(os.tmpdir(), `csv-validation-test-${uniqueId}`)

  return {
    path: cachePath,
    cleanup: async () => {
      await fs.rm(cachePath, { recursive: true, force: true })
    },
  }
}

/**
 * A headers-only CSV — the exact corruption pattern from #199.
 * Real example: 478 bytes, header + footer, zero data rows.
 */
const HEADERS_ONLY_CSV = `Club Number,Club Name,Division,Area,Active Members,Total to Date,Goals Met,Club Status
Month of January, As of 01/08/2026`

/**
 * A valid CSV with multiple data rows (exceeds 1 KB minimum).
 */
const VALID_CSV = `Club Number,Club Name,Division,Area,Active Members,Total to Date,Goals Met,Club Status
1234,Test Club One - A Longer Name For Padding,A,1,25,30,5,Active
5678,Test Club Two - Another Long Club Name Here,A,2,18,22,3,Active
9012,Test Club Three - Yet Another Long Name Club,B,1,12,15,2,Distinguished
3456,Test Club Four - The Fourth Test Club Entry,B,2,30,35,7,Presidents Distinguished
7890,Test Club Five - Fifth Club With Extra Details,C,1,22,28,4,Select Distinguished
2345,Test Club Six - Sixth Club For Good Measure,C,2,15,20,3,Active
6789,Test Club Seven - Seventh Club Row In Our CSV,D,1,20,25,6,Active
1111,Test Club Eight - Eighth Club Entry For Size,D,2,10,14,1,Active
2222,Test Club Nine - Ninth Club in the CSV File,E,1,28,33,5,Distinguished
3333,Test Club Ten - Tenth and Final Test Club Row,E,2,16,21,2,Active`

/**
 * Mock logger for capturing log messages
 */
function createMockLogger() {
  const warnings: Array<{ message: string; data?: unknown }> = []
  return {
    logger: {
      info: () => {},
      warn: (msg: string, data?: unknown) => {
        warnings.push({ message: msg, data })
      },
      error: () => {},
      debug: () => {},
    },
    warnings,
  }
}

describe('TransformService — Corrupt CSV Detection (#199)', () => {
  let testCache: { path: string; cleanup: () => Promise<void> }

  beforeEach(async () => {
    testCache = createIsolatedCacheDir()
    await fs.mkdir(testCache.path, { recursive: true })
  })

  afterEach(async () => {
    await testCache.cleanup()
  })

  it('should skip district with headers-only club-performance.csv', async () => {
    const date = '2026-01-08'
    const districtId = '61'
    const mockLog = createMockLogger()

    const service = new TransformService({
      cacheDir: testCache.path,
      logger: mockLog.logger,
    })

    // Create raw CSV with headers-only content (the actual bug)
    const districtDir = path.join(
      testCache.path,
      'raw-csv',
      date,
      `district-${districtId}`
    )
    await fs.mkdir(districtDir, { recursive: true })
    await fs.writeFile(
      path.join(districtDir, 'club-performance.csv'),
      HEADERS_ONLY_CSV
    )

    const result = await service.transformDistrict(date, districtId)

    // Should be marked as skipped (not failed) with a clear reason
    expect(result.success).toBe(true)
    expect(result.skipped).toBe(true)
    expect(result.error).toContain('corrupt')
  })

  it('should log a warning for corrupt CSV with file details', async () => {
    const date = '2026-01-08'
    const districtId = '61'
    const mockLog = createMockLogger()

    const service = new TransformService({
      cacheDir: testCache.path,
      logger: mockLog.logger,
    })

    const districtDir = path.join(
      testCache.path,
      'raw-csv',
      date,
      `district-${districtId}`
    )
    await fs.mkdir(districtDir, { recursive: true })
    await fs.writeFile(
      path.join(districtDir, 'club-performance.csv'),
      HEADERS_ONLY_CSV
    )

    await service.transformDistrict(date, districtId)

    // Should have logged a warning about the corrupt CSV
    const corruptWarning = mockLog.warnings.find(w =>
      w.message.toLowerCase().includes('corrupt')
    )
    expect(corruptWarning).toBeDefined()
  })

  it('should accept valid CSV with data rows', async () => {
    const date = '2026-01-08'
    const districtId = '61'

    const service = new TransformService({ cacheDir: testCache.path })

    const districtDir = path.join(
      testCache.path,
      'raw-csv',
      date,
      `district-${districtId}`
    )
    await fs.mkdir(districtDir, { recursive: true })
    await fs.writeFile(
      path.join(districtDir, 'club-performance.csv'),
      VALID_CSV
    )

    const result = await service.transformDistrict(date, districtId)

    // Should succeed with valid CSV
    expect(result.success).toBe(true)
    expect(result.skipped).toBeFalsy()
  })

  it('should count corrupt districts as skipped in batch transform result', async () => {
    const date = '2026-01-08'
    const mockLog = createMockLogger()

    const service = new TransformService({
      cacheDir: testCache.path,
      logger: mockLog.logger,
    })

    // District 1: valid CSV
    const dir1 = path.join(testCache.path, 'raw-csv', date, 'district-1')
    await fs.mkdir(dir1, { recursive: true })
    await fs.writeFile(path.join(dir1, 'club-performance.csv'), VALID_CSV)

    // District 2: corrupt CSV (headers only)
    const dir2 = path.join(testCache.path, 'raw-csv', date, 'district-2')
    await fs.mkdir(dir2, { recursive: true })
    await fs.writeFile(
      path.join(dir2, 'club-performance.csv'),
      HEADERS_ONLY_CSV
    )

    const result = await service.transform({ date })

    // District 1 should succeed, district 2 should be skipped
    expect(result.districtsSucceeded).toContain('1')
    expect(result.districtsSkipped).toContain('2')
    expect(result.districtsFailed).not.toContain('2')
  })
})
