/**
 * A scrape of a PAST date must not fetch districts that did not exist then
 * (#1465).
 *
 * The 2026-06-30 directory was rewritten on 2026-07-31 with the then-current
 * discovery set (94 districts, including the renumbered 201-231), while the
 * date's own districtsummary still listed the 128 districts of PY 2025-26.
 * The per-district export endpoint ignores the program-year token (#1342), so
 * every one of those fetches SUCCEEDED and returned current-year data — which
 * landed in a closed year's directory and put 4,673 clubs under two districts.
 *
 * The resolver already downloads and validates that date's districtsummary
 * (#1284). This pins that the orchestrator uses it as the district set for the
 * date it is writing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { CollectorOrchestrator } from '../CollectorOrchestrator.js'
import type { CollectorOrchestratorConfig } from '../types/index.js'

/** The 2025-26 close: the districts that actually existed on 2026-06-30. */
const LEGACY_SUMMARY_CSV = [
  '"DISTRICT","REGION","Paid Clubs Base","Paid Clubs"',
  '"61","6","164","164"',
  '"62","6","90","90"',
  '"F","2","110","110"',
  '"U","14","300","300"',
  '"Month of Jun, As of 07/30/2026"',
].join('\n')

const capturedDownloadSpecs: Array<{
  reportType: string
  districtId?: string
}> = []

vi.mock('../services/HttpCsvDownloader.js', () => ({
  parseClosingPeriodFromCsv: () => ({
    isClosingPeriod: true,
    dataMonth: '2026-06',
    footerFound: true,
  }),
  HttpCsvDownloader: class MockHttpCsvDownloader {
    async downloadCsv(spec: { reportType: string; districtId?: string }) {
      capturedDownloadSpecs.push({
        reportType: spec.reportType,
        districtId: spec.districtId,
      })
      return {
        url: `https://example.com/${spec.reportType}`,
        content: LEGACY_SUMMARY_CSV,
        statusCode: 200,
        byteSize: LEGACY_SUMMARY_CSV.length,
      }
    }
    getRequestCount() {
      return capturedDownloadSpecs.length
    }
    resetRequestCount() {}
  },
}))

describe('CollectorOrchestrator — district set belongs to the date (#1465)', () => {
  let testCacheDir: string
  let testConfigPath: string

  beforeEach(async () => {
    const testId = `district-set-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    testCacheDir = path.join(process.cwd(), 'test-cache', testId)
    testConfigPath = path.join(testCacheDir, 'config', 'districts.json')
    await fs.mkdir(path.dirname(testConfigPath), { recursive: true })
    capturedDownloadSpecs.length = 0
  })

  afterEach(async () => {
    await fs.rm(testCacheDir, { recursive: true, force: true }).catch(() => {})
    vi.clearAllMocks()
  })

  async function scrapeWith(districts: string[]) {
    await fs.writeFile(
      testConfigPath,
      JSON.stringify({
        configuredDistricts: [],
        lastUpdated: new Date().toISOString(),
        updatedBy: 'test',
        version: 1,
      }),
      'utf-8'
    )
    const config: CollectorOrchestratorConfig = {
      cacheDir: testCacheDir,
      districtConfigPath: testConfigPath,
      timeout: 30,
      verbose: false,
    }
    const orchestrator = new CollectorOrchestrator(config)
    const result = await orchestrator.scrape({
      date: '2026-06-30',
      force: true,
      districts,
    })
    await orchestrator.close()
    return result
  }

  it('never fetches a district the date’s districtsummary does not list', async () => {
    const result = await scrapeWith(['61', '201', '231'])

    const fetchedDistricts = capturedDownloadSpecs
      .map(spec => spec.districtId)
      .filter((id): id is string => id !== undefined)

    expect(new Set(fetchedDistricts)).toEqual(new Set(['61']))
    expect(result.districtsProcessed).toEqual(['61'])
    expect(result.districtsSucceeded).toEqual(['61'])
    expect(result.districtsSkipped).toEqual(['201', '231'])
  })

  it('writes no raw CSV cache for a district that did not exist on that date', async () => {
    await scrapeWith(['61', '201'])

    const rawCsvDir = path.join(testCacheDir, 'raw-csv', '2026-06-30')
    const entries = await fs.readdir(rawCsvDir)

    expect(entries).toContain('district-61')
    expect(entries).not.toContain('district-201')
  })

  it('still scrapes every requested district when they all existed', async () => {
    const result = await scrapeWith(['61', 'F', 'U'])

    expect(result.districtsSucceeded).toEqual(['61', 'F', 'U'])
    expect(result.districtsSkipped).toEqual([])
    expect(result.success).toBe(true)
  })
})
