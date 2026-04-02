/**
 * Unit Tests for CollectorOrchestrator Partial Failure Resilience
 *
 * Verifies that when downloading fails for some districts, the orchestrator
 * continues processing remaining districts and reports all failures.
 *
 * Updated for #124: mocks HttpCsvDownloader instead of ToastmastersCollector.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { CollectorOrchestrator } from '../CollectorOrchestrator.js'
import type { CollectorOrchestratorConfig } from '../types/index.js'

// Track which districts should fail when downloadCsv is called
let failingDistricts = new Set<string>()

vi.mock('../services/HttpCsvDownloader.js', () => {
  return {
    parseClosingPeriodFromCsv: () => ({
      isClosingPeriod: false,
      dataMonth: undefined,
    }),
    HttpCsvDownloader: class MockHttpCsvDownloader {
      private requestCount = 0

      constructor() {
        // Default config, not used in tests
      }

      async downloadCsv(spec: {
        reportType: string
        districtId?: string
        date: Date
        programYear: string
      }) {
        this.requestCount++

        if (spec.districtId && failingDistricts.has(spec.districtId)) {
          throw new Error(`Simulated failure for district ${spec.districtId}`)
        }

        // Return minimal CSV content with a hardcoded closing period footer for testing
        return {
          url: `https://example.com/${spec.reportType}`,
          content: `Header\nRow1\nMonth of December, As of 01/11/2026`,
          statusCode: 200,
          byteSize: 12,
        }
      }

      getRequestCount() {
        return this.requestCount
      }

      resetRequestCount() {
        this.requestCount = 0
      }
    },
  }
})

describe('CollectorOrchestrator - Partial Failure Resilience (#124)', () => {
  let testCacheDir: string
  let testConfigPath: string

  beforeEach(async () => {
    const testId = `collector-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    testCacheDir = path.join(process.cwd(), 'test-cache', testId)
    testConfigPath = path.join(testCacheDir, 'config', 'districts.json')
    await fs.mkdir(path.dirname(testConfigPath), { recursive: true })
    failingDistricts = new Set()
  })

  afterEach(async () => {
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true })
    } catch {
      // Ignore
    }
    vi.clearAllMocks()
  })

  async function createDistrictConfig(districts: string[]): Promise<void> {
    const config = {
      configuredDistricts: districts,
      lastUpdated: new Date().toISOString(),
      updatedBy: 'test',
      version: 1,
    }
    await fs.writeFile(testConfigPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  function createConfig(): CollectorOrchestratorConfig {
    return {
      cacheDir: testCacheDir,
      districtConfigPath: testConfigPath,
      timeout: 30,
      verbose: false,
    }
  }

  async function runScrapeTest(districts: string[], failing: Set<string>) {
    await createDistrictConfig(districts)
    failingDistricts = failing
    const orchestrator = new CollectorOrchestrator(createConfig())
    const result = await orchestrator.scrape({
      date: '2026-01-11',
      force: true,
    })
    await orchestrator.close()
    return result
  }

  it('should process all districts when none fail', async () => {
    const districts = ['42', '101', 'F']
    const result = await runScrapeTest(districts, new Set())

    expect(result.districtsProcessed.length).toBe(3)
    expect(new Set(result.districtsSucceeded)).toEqual(new Set(districts))
    expect(result.districtsFailed.length).toBe(0)
    expect(result.errors.length).toBe(0)
    expect(result.success).toBe(true)
    expect(result.duration_ms).toBeGreaterThanOrEqual(0)
  })

  it('should continue processing when one district fails', async () => {
    const districts = ['42', '101', 'F']
    const failing = new Set(['101'])
    const result = await runScrapeTest(districts, failing)

    expect(result.districtsProcessed.length).toBe(3)
    expect(new Set(result.districtsSucceeded)).toEqual(new Set(['42', 'F']))
    expect(new Set(result.districtsFailed)).toEqual(failing)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0].districtId).toBe('101')
    expect(result.errors[0].error).toContain('101')
    expect(result.success).toBe(false)
  })

  it('should continue processing when multiple districts fail', async () => {
    const districts = ['1', '42', '101', 'A', 'F']
    const failing = new Set(['42', 'A'])
    const result = await runScrapeTest(districts, failing)

    expect(result.districtsProcessed.length).toBe(5)
    expect(new Set(result.districtsSucceeded)).toEqual(
      new Set(['1', '101', 'F'])
    )
    expect(new Set(result.districtsFailed)).toEqual(failing)
    expect(result.errors.length).toBe(2)
    expect(result.success).toBe(false)

    for (const failedId of failing) {
      const errorEntry = result.errors.find(e => e.districtId === failedId)
      expect(errorEntry).toBeDefined()
      expect(errorEntry?.error).toContain(failedId)
    }
  })

  it('should report all failures when every district fails', async () => {
    const districts = ['42', '101']
    const failing = new Set(districts)
    const result = await runScrapeTest(districts, failing)

    expect(result.districtsProcessed.length).toBe(2)
    expect(result.districtsSucceeded.length).toBe(0)
    expect(new Set(result.districtsFailed)).toEqual(failing)
    expect(result.errors.length).toBe(2)
    expect(result.success).toBe(false)
  })

  it('should handle alphabetic district IDs', async () => {
    const districts = ['A', 'F', 'U']
    const failing = new Set(['F'])
    const result = await runScrapeTest(districts, failing)

    expect(result.districtsProcessed.length).toBe(3)
    expect(new Set(result.districtsSucceeded)).toEqual(new Set(['A', 'U']))
    expect(result.errors.length).toBe(1)
  })

  it('should write CSV files to correct cache paths', async () => {
    const result = await runScrapeTest(['09'], new Set())

    expect(result.success).toBe(true)
    expect(result.cacheLocations.length).toBeGreaterThan(0)

    // Verify CSV files exist on disk
    for (const loc of result.cacheLocations) {
      const stat = await fs.stat(loc)
      expect(stat.isFile()).toBe(true)
    }

    // Verify paths follow the expected convention
    const clubCsvPath = result.cacheLocations.find(p =>
      p.includes('club-performance')
    )
    expect(clubCsvPath).toMatch(
      /raw-csv\/2026-01-11\/district-09\/club-performance\.csv$/
    )
  })

  it('should write metadata.json after successful scrape', async () => {
    await runScrapeTest(['09'], new Set())

    const metadataPath = path.join(
      testCacheDir,
      'raw-csv',
      '2026-01-11',
      'metadata.json'
    )
    const content = await fs.readFile(metadataPath, 'utf-8')
    const metadata = JSON.parse(content) as Record<string, unknown>

    expect(metadata['date']).toBe('2026-01-11')
    expect(metadata['programYear']).toBe('2025-2026')
    expect(metadata['source']).toBe('collector-http')
    expect(metadata['cacheVersion']).toBe(1)

    const csvFiles = metadata['csvFiles'] as Record<string, unknown>
    expect(csvFiles['allDistricts']).toBe(true)
    const districts = csvFiles['districts'] as Record<string, unknown>
    expect(districts['09']).toBeDefined()
  })

  it('should detect closing period and write dataMonth to metadata.json', async () => {
    // The mock downloader writes "Month of December, As of 01/11/2026"
    // The requested date in runScrapeTest is 2026-01-11
    // Month mismatch (12 vs 1) should trigger closing period!
    await runScrapeTest(['09'], new Set())

    const metadataPath = path.join(
      testCacheDir,
      'raw-csv',
      '2026-01-11',
      'metadata.json'
    )
    const content = await fs.readFile(metadataPath, 'utf-8')
    const metadata = JSON.parse(content) as Record<string, unknown>

    expect(metadata['isClosingPeriod']).toBe(true)
    expect(metadata['dataMonth']).toBe('2025-12')
  })
})
