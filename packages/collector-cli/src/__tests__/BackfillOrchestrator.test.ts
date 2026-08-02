/**
 * Unit Tests for BackfillOrchestrator (#123, #125)
 *
 * Tests the 3-phase backfill orchestration logic.
 * #125: Verifies storage paths are compatible with OrchestratorCacheAdapter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  BackfillOrchestrator,
  buildBackfillMetadata,
  type BackfillConfig,
  type BackfillStorage,
} from '../services/BackfillOrchestrator.js'
import {
  buildCsvPathFromReport,
  buildMetadataPath,
} from '../utils/CachePaths.js'
import type { BackfillDateSpec } from '../services/HttpCsvDownloader.js'

/** Spy storage that records all writes for path assertions. */
function createSpyStorage(): BackfillStorage & { writtenPaths: string[] } {
  const writtenPaths: string[] = []
  return {
    writtenPaths,
    async exists() {
      return false
    },
    async existsFresh() {
      return false
    },
    async read() {
      return ''
    },
    async write(filePath: string) {
      writtenPaths.push(filePath)
    },
  }
}

describe('BackfillOrchestrator (#123)', () => {
  const defaultConfig: BackfillConfig = {
    startYear: 2024,
    endYear: 2024,
    frequency: 'monthly',
    ratePerSecond: 10,
    outputDir: '/tmp/backfill-test',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create orchestrator with valid config', () => {
      const orchestrator = new BackfillOrchestrator(defaultConfig)
      expect(orchestrator).toBeDefined()
    })
  })

  describe('calculateScope', () => {
    it('should calculate total requests for single year monthly', () => {
      const orchestrator = new BackfillOrchestrator(defaultConfig)
      const scope = orchestrator.calculateScope()

      // 1 program year, monthly dates ≈ 12-15 dates
      expect(scope.programYears).toEqual(['2024-2025'])
      expect(scope.datesPerYear).toBeGreaterThanOrEqual(12)
      expect(scope.datesPerYear).toBeLessThanOrEqual(15)

      // Phase 1: 1 request per date (districtsummary)
      expect(scope.phase1Requests).toBe(scope.datesPerYear)

      // Per district: 3 report types × dates per year
      expect(scope.requestsPerDistrict).toBe(scope.datesPerYear * 3)
    })

    it('should calculate scope for multi-year range', () => {
      const orchestrator = new BackfillOrchestrator({
        ...defaultConfig,
        startYear: 2017,
        endYear: 2024,
      })
      const scope = orchestrator.calculateScope()

      expect(scope.programYears).toHaveLength(8)
      expect(scope.phase1Requests).toBe(scope.datesPerYear * 8)
    })
  })

  describe('phase 1: discovery', () => {
    it('should discover districts from summary CSVs', async () => {
      const orchestrator = new BackfillOrchestrator({
        ...defaultConfig,
        frequency: 'monthly',
      })

      // Replace the downloader's downloadCsv with a mock
      const mockDownload = vi.fn().mockResolvedValue({
        url: 'https://test.example.com',
        content: `"REGION","DISTRICT","DSP","Training"
"01","02","Y","Y"
"01","09","Y","Y"
"02","42","Y","Y"
`,
        statusCode: 200,
        byteSize: 100,
      })

      orchestrator.downloader.downloadCsv = mockDownload

      const result = await orchestrator.runPhase1Discovery()

      // Should have made requests for each date in the program year
      expect(mockDownload).toHaveBeenCalled()

      // Each call should be for 'districtsummary' report
      for (const call of mockDownload.mock.calls) {
        const spec = call[0] as BackfillDateSpec
        expect(spec.reportType).toBe('districtsummary')
        expect(spec.programYear).toBe('2024-2025')
      }

      // Should have discovered 3 districts
      expect(result.districtsPerYear['2024-2025']).toEqual(['02', '09', '42'])
    })
  })

  describe('estimateTime', () => {
    it('should estimate completion time based on rate and count', () => {
      const orchestrator = new BackfillOrchestrator(defaultConfig)

      // 1000 requests at 2/s = 500 seconds ≈ 8 min
      const estimate = orchestrator.estimateTime(1000, 2)
      expect(estimate.totalSeconds).toBeCloseTo(500, -1)
      expect(estimate.humanReadable).toContain('min')
    })

    it('should format hours for large request counts', () => {
      const orchestrator = new BackfillOrchestrator(defaultConfig)

      // 72000 requests at 2/s = 36000 seconds = 10 hours
      const estimate = orchestrator.estimateTime(72000, 2)
      expect(estimate.totalSeconds).toBeCloseTo(36000, -1)
      expect(estimate.humanReadable).toContain('h')
    })
  })
})

// #125: Storage path compatibility tests
describe('buildCsvPathFromReport (#125)', () => {
  it('should produce OrchestratorCacheAdapter-compatible path for club CSV', () => {
    const date = new Date(2025, 0, 15) // Jan 15, 2025
    const result = buildCsvPathFromReport(
      '/data/cache',
      date,
      'clubperformance',
      '109'
    )
    expect(result).toBe(
      '/data/cache/raw-csv/2025-01-15/district-109/club-performance.csv'
    )
  })

  it('should produce correct path for division CSV', () => {
    const date = new Date(2025, 6, 1) // Jul 1, 2025
    const result = buildCsvPathFromReport(
      '/data/cache',
      date,
      'divisionperformance',
      '42'
    )
    expect(result).toBe(
      '/data/cache/raw-csv/2025-07-01/district-42/division-performance.csv'
    )
  })

  it('should produce correct path for district CSV', () => {
    const date = new Date(2025, 11, 31) // Dec 31, 2025
    const result = buildCsvPathFromReport(
      '/data/cache',
      date,
      'districtperformance',
      '02'
    )
    expect(result).toBe(
      '/data/cache/raw-csv/2025-12-31/district-02/district-performance.csv'
    )
  })

  it('should produce correct path for all-districts summary', () => {
    const date = new Date(2025, 0, 15)
    const result = buildCsvPathFromReport(
      '/data/cache',
      date,
      'districtsummary'
    )
    expect(result).toBe('/data/cache/raw-csv/2025-01-15/all-districts.csv')
  })

  it('should throw when districtId is missing for per-district report', () => {
    const date = new Date(2025, 0, 15)
    expect(() =>
      buildCsvPathFromReport('/data/cache', date, 'clubperformance')
    ).toThrow('districtId is required')
  })
})

describe('BackfillOrchestrator storage paths (#125)', () => {
  it('Phase 1 should write to raw-csv/{date}/all-districts.csv', async () => {
    const spyStorage = createSpyStorage()
    const orchestrator = new BackfillOrchestrator({
      startYear: 2024,
      endYear: 2024,
      frequency: 'monthly',
      ratePerSecond: 100,
      outputDir: '/data/cache',
      storage: spyStorage,
    })

    orchestrator.downloader.downloadCsv = vi.fn().mockResolvedValue({
      url: 'https://test.example.com',
      content: '"REGION","DISTRICT"\n"01","09"\n',
      statusCode: 200,
      byteSize: 50,
    })

    await orchestrator.runPhase1Discovery()

    // Every written path should match all-districts format
    for (const p of spyStorage.writtenPaths) {
      expect(p).toMatch(
        /^\/data\/cache\/raw-csv\/\d{4}-\d{2}-\d{2}\/all-districts\.csv$/
      )
    }
    expect(spyStorage.writtenPaths.length).toBeGreaterThan(0)
  })

  it('Phase 2 should write to raw-csv/{date}/district-{id}/{type}.csv and metadata.json', async () => {
    const spyStorage = createSpyStorage()
    const orchestrator = new BackfillOrchestrator({
      startYear: 2024,
      endYear: 2024,
      frequency: 'monthly',
      ratePerSecond: 100,
      outputDir: '/data/cache',
      storage: spyStorage,
    })

    orchestrator.downloader.downloadCsv = vi.fn().mockResolvedValue({
      url: 'https://test.example.com',
      // Needs at least one data row. A header-only body is exactly what the
      // dashboard returns for a period it has no data for, and #1384 skips
      // those instead of writing a bogus snapshot. This test is about the
      // storage path shape, so the fixture has to be a realistic response.
      content: 'some,csv,data\n1,2,3\n',
      statusCode: 200,
      byteSize: 20,
    })

    await orchestrator.runPhase2Collection({
      '2024-2025': ['09'],
    })

    // Should have written 3 report types × N dates + N metadata files
    expect(spyStorage.writtenPaths.length).toBeGreaterThan(0)

    const csvPaths = spyStorage.writtenPaths.filter(p => p.endsWith('.csv'))
    const metadataPaths = spyStorage.writtenPaths.filter(p =>
      p.endsWith('metadata.json')
    )

    // CSV paths should follow the compatible format
    for (const p of csvPaths) {
      expect(p).toMatch(
        /^\/data\/cache\/raw-csv\/\d{4}-\d{2}-\d{2}\/district-09\/(club|division|district)-performance\.csv$/
      )
    }

    // metadata.json should be written for each date
    expect(metadataPaths.length).toBeGreaterThan(0)
    for (const p of metadataPaths) {
      expect(p).toMatch(
        /^\/data\/cache\/raw-csv\/\d{4}-\d{2}-\d{2}\/metadata\.json$/
      )
    }
  })
})

// #125: metadata.json tests
describe('buildBackfillMetadata (#125)', () => {
  it('should produce metadata with correct programYear for July date', () => {
    const date = new Date(2024, 6, 15) // July 15, 2024
    const metadata = buildBackfillMetadata(date, ['09', '42'])

    expect(metadata.date).toBe('2024-07-15')
    expect(metadata.programYear).toBe('2024-2025')
    expect(metadata.source).toBe('backfill')
    expect(metadata.cacheVersion).toBe(1)
    // Backfill does not parse the CSV footer, so it cannot DECIDE the
    // closing-period status. It must OMIT the key (undecided) rather than
    // launder a hardcoded false that the downstream trust branch would honor
    // — the #1129 twin-writer pattern (Lesson 158, #1160). Downstream
    // resolution (CSV footer → registry) then decides honestly.
    expect('isClosingPeriod' in metadata).toBe(false)
    expect((metadata.csvFiles as Record<string, unknown>).allDistricts).toBe(
      true
    )
  })

  it('omits isClosingPeriod entirely — never a laundered false (#1160)', () => {
    // A closing-window date (e.g. 2024-07-01 sits in June 2024's window)
    // must NOT carry an explicit false; the writer did not decide it.
    const date = new Date(2024, 6, 1) // July 1, 2024
    const metadata = buildBackfillMetadata(date, ['09'])

    expect(metadata.isClosingPeriod).toBeUndefined()
    expect(Object.keys(metadata)).not.toContain('isClosingPeriod')
  })

  it('should produce correct programYear for January date', () => {
    const date = new Date(2025, 0, 15) // January 15, 2025
    const metadata = buildBackfillMetadata(date, ['09'])

    expect(metadata.programYear).toBe('2024-2025')
  })

  it('should list all districts in csvFiles.districts', () => {
    const date = new Date(2025, 0, 15)
    const metadata = buildBackfillMetadata(date, ['02', '09', '42'])

    const csvFiles = metadata.csvFiles as Record<string, unknown>
    const districts = csvFiles.districts as Record<string, unknown>
    expect(Object.keys(districts).sort()).toEqual(['02', '09', '42'])
    expect(districts['09']).toEqual({
      districtPerformance: true,
      divisionPerformance: true,
      clubPerformance: true,
    })
  })
})

describe('buildMetadataPath (#125)', () => {
  it('should produce correct metadata path', () => {
    const date = new Date(2025, 0, 15)
    expect(buildMetadataPath('/data/cache', date)).toBe(
      '/data/cache/raw-csv/2025-01-15/metadata.json'
    )
  })
})
