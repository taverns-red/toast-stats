/**
 * Property-based test for chronological ordering of snapshot pointer updates.
 *
 * @pbt-justification Warranted per .kiro/steering/testing.md criteria:
 *   - Mathematical invariant: chronological ordering must be preserved across updates
 *   - Complex input space: generated date sequences for pointer ordering
 *
 * **Property 1: Chronological ordering of pointer updates**
 * For any two valid snapshot dates A and B, regardless of the order in which
 * `writeSnapshotPointer` is called, the resulting pointer file SHALL contain
 * the chronologically later date.
 *
 * **Validates: Requirements 1.5**
 *
 * Tag: Feature: latest-snapshot-symlink, Property 1: Chronological ordering of pointer updates
 *
 * @module TransformService.pointer.property.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { TransformService } from '../services/TransformService.js'
import { SnapshotPointerSchema } from '@taverns-red/shared-contracts'

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create an isolated test cache directory with unique ID for parallel test safety.
 *
 * Per testing steering document:
 * - Use unique, isolated directories (timestamps/random IDs)
 * - Clean up all created files in afterEach hooks
 */
function createIsolatedCacheDir(): {
  path: string
  cleanup: () => Promise<void>
} {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}-${process.pid}`
  const cachePath = path.join(os.tmpdir(), `transform-pointer-pbt-${uniqueId}`)

  return {
    path: cachePath,
    cleanup: async () => {
      await fs.rm(cachePath, { recursive: true, force: true })
    },
  }
}

/**
 * Minimal club performance CSV — smallest valid data for a successful transform.
 */
const MINIMAL_CLUB_CSV = `Club Number,Club Name,Division,Area,Active Members,Total to Date,Goals Met,Club Status
1234,Test Club,A,1,20,25,4,Active`

/**
 * Set up raw CSV data for a district so that transform() succeeds.
 */
async function setupRawCsvData(
  cacheDir: string,
  date: string,
  districtId: string
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
    MINIMAL_CLUB_CSV
  )
}

/**
 * Read and parse the pointer file from the snapshots directory.
 * Returns null if the file does not exist.
 */
async function readPointerFile(cacheDir: string): Promise<{
  snapshotId: string
  updatedAt: string
  schemaVersion: string
} | null> {
  const pointerPath = path.join(cacheDir, 'snapshots', 'latest-successful.json')
  try {
    const content = await fs.readFile(pointerPath, 'utf-8')
    return JSON.parse(content) as {
      snapshotId: string
      updatedAt: string
      schemaVersion: string
    }
  } catch {
    return null
  }
}

/**
 * Silent logger to suppress output during property test iterations.
 */
const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

// ============================================================================
// Fast-check Arbitraries
// ============================================================================

/**
 * Arbitrary for valid YYYY-MM-DD date strings.
 * Constrains year to 2020-2030, month to 01-12, day to 01-28
 * to ensure all generated dates are valid calendar dates.
 *
 * Reuses the generator pattern from shared-contracts property tests.
 */
const yyyyMmDdArb = fc
  .record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
  })
  .map(
    ({ year, month, day }) =>
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  )

/**
 * Arbitrary for pairs of distinct YYYY-MM-DD date strings.
 * Ensures the two dates are different so the ordering property is meaningful.
 */
const distinctDatePairArb = fc
  .tuple(yyyyMmDdArb, yyyyMmDdArb)
  .filter(([a, b]) => a !== b)

// ============================================================================
// Property Tests
// ============================================================================

describe('Feature: latest-snapshot-symlink, Property 1: Chronological ordering of pointer updates', () => {
  let testCache: { path: string; cleanup: () => Promise<void> }

  beforeEach(async () => {
    testCache = createIsolatedCacheDir()
    await fs.mkdir(testCache.path, { recursive: true })
  })

  afterEach(async () => {
    await testCache.cleanup()
  })

  /**
   * Test configuration: minimum 100 iterations per design document requirements.
   */
  const fcOptions = { numRuns: 100 }

  /**
   * **Validates: Requirements 1.5**
   *
   * For any two valid snapshot dates A and B (A ≠ B), when we:
   * 1. Run a successful transform for date A
   * 2. Run a successful transform for date B
   *
   * The resulting pointer file SHALL contain max(A, B) — the chronologically
   * later date — regardless of the order in which the transforms are called.
   *
   * This tests the concurrency guard in writeSnapshotPointer that compares
   * the incoming date against the existing pointer and only updates if the
   * incoming date is >= the existing one.
   */
  it('should always contain the chronologically later date after two sequential transforms', async () => {
    await fc.assert(
      fc.asyncProperty(distinctDatePairArb, async ([dateA, dateB]) => {
        // Determine the expected winner (chronologically later date)
        const expectedLatest = dateA > dateB ? dateA : dateB

        // Create a fresh isolated cache for this iteration
        const iterationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const iterationCacheDir = path.join(testCache.path, iterationId)
        await fs.mkdir(iterationCacheDir, { recursive: true })

        // Set up minimal raw CSV data for both dates
        await setupRawCsvData(iterationCacheDir, dateA, '1')
        await setupRawCsvData(iterationCacheDir, dateB, '1')

        const service = new TransformService({
          cacheDir: iterationCacheDir,
          logger: silentLogger,
        })

        // Transform date A first, then date B
        const resultA = await service.transform({ date: dateA })
        expect(resultA.success).toBe(true)

        const resultB = await service.transform({ date: dateB })
        expect(resultB.success).toBe(true)

        // Read the pointer file
        const pointer = await readPointerFile(iterationCacheDir)
        expect(pointer).not.toBeNull()

        // Validate pointer is a valid SnapshotPointer
        const validation = SnapshotPointerSchema.safeParse(pointer)
        expect(validation.success).toBe(true)

        // The pointer MUST contain the chronologically later date
        expect(pointer?.snapshotId).toBe(expectedLatest)
      }),
      fcOptions
    )
  }, 120_000) // 2 minute timeout for property test with I/O

  /**
   * **Validates: Requirements 1.5**
   *
   * Complementary property: the ordering invariant holds regardless of
   * which date is transformed first. For any pair (A, B), transforming
   * in order [A, B] or [B, A] must both result in max(A, B).
   *
   * This explicitly tests both orderings to catch asymmetric bugs in
   * the comparison logic.
   */
  it('should produce the same pointer result regardless of transform order', async () => {
    await fc.assert(
      fc.asyncProperty(distinctDatePairArb, async ([dateA, dateB]) => {
        const expectedLatest = dateA > dateB ? dateA : dateB

        // --- Order 1: A then B ---
        const cacheDir1 = path.join(
          testCache.path,
          `order1-${Date.now()}-${Math.random().toString(36).slice(2)}`
        )
        await fs.mkdir(cacheDir1, { recursive: true })
        await setupRawCsvData(cacheDir1, dateA, '1')
        await setupRawCsvData(cacheDir1, dateB, '1')

        const service1 = new TransformService({
          cacheDir: cacheDir1,
          logger: silentLogger,
        })
        await service1.transform({ date: dateA })
        await service1.transform({ date: dateB })

        const pointer1 = await readPointerFile(cacheDir1)

        // --- Order 2: B then A ---
        const cacheDir2 = path.join(
          testCache.path,
          `order2-${Date.now()}-${Math.random().toString(36).slice(2)}`
        )
        await fs.mkdir(cacheDir2, { recursive: true })
        await setupRawCsvData(cacheDir2, dateA, '1')
        await setupRawCsvData(cacheDir2, dateB, '1')

        const service2 = new TransformService({
          cacheDir: cacheDir2,
          logger: silentLogger,
        })
        await service2.transform({ date: dateB })
        await service2.transform({ date: dateA })

        const pointer2 = await readPointerFile(cacheDir2)

        // Both orderings must produce the same result: the later date
        expect(pointer1?.snapshotId).toBe(expectedLatest)
        expect(pointer2?.snapshotId).toBe(expectedLatest)
      }),
      fcOptions
    )
  }, 120_000) // 2 minute timeout for property test with I/O
})
