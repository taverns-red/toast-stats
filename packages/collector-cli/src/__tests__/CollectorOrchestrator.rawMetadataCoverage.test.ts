/**
 * raw-csv `metadata.json` describes the date's FULL district set, or it is
 * not written (#1756, ADR-015 P2/P3).
 *
 * Rescrape run 38149429523 (`districts=61`) wrote `raw-csv/2026-10-10/
 * metadata.json` with one district; the upload is an additive rsync, so that
 * file replaced the 94-district one in staging. The district list comes from
 * the date's own districtsummary; the metadata is written only when a raw
 * directory for every listed district is on disk (scraped now or hydrated
 * from staging), and then lists all of them.
 *
 * The downloader mock mirrors CollectorOrchestrator.districtSet.test.ts: one
 * body for every report, carrying each report's required columns.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { CollectorOrchestrator } from '../CollectorOrchestrator.js'
import type { CollectorOrchestratorConfig } from '../types/index.js'

const DATE = '2026-06-30'

const SUMMARY_CSV = [
  '"DISTRICT","REGION","Paid Clubs Base","Paid Clubs","Division","Club Number"',
  '"61","6","164","164","A","1"',
  '"62","6","90","90","A","2"',
  '"F","2","110","110","A","3"',
  '"Month of Jun, As of 06/30/2026"',
].join('\n')

vi.mock('../services/HttpCsvDownloader.js', () => ({
  parseClosingPeriodFromCsv: () => ({
    isClosingPeriod: true,
    dataMonth: '2026-06',
    footerFound: true,
  }),
  HttpCsvDownloader: class MockHttpCsvDownloader {
    async downloadCsv() {
      return {
        url: 'https://example.com/report',
        content: SUMMARY_CSV,
        statusCode: 200,
        byteSize: SUMMARY_CSV.length,
      }
    }
    getRequestCount() {
      return 0
    }
    resetRequestCount() {}
  },
}))

describe('CollectorOrchestrator — raw metadata needs the date’s whole district set (#1756)', () => {
  let cacheDir: string
  let configPath: string

  const rawDir = () => path.join(cacheDir, 'raw-csv', DATE)
  const metadataPath = () => path.join(rawDir(), 'metadata.json')

  beforeEach(async () => {
    const id = `raw-meta-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    cacheDir = path.join(process.cwd(), 'test-cache', id)
    configPath = path.join(cacheDir, 'config', 'districts.json')
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(
      configPath,
      JSON.stringify({
        configuredDistricts: [],
        lastUpdated: new Date().toISOString(),
        updatedBy: 'test',
        version: 1,
      }),
      'utf-8'
    )
  })

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true }).catch(() => {})
    vi.clearAllMocks()
  })

  async function scrape(districts: string[]) {
    const config: CollectorOrchestratorConfig = {
      cacheDir,
      districtConfigPath: configPath,
      timeout: 30,
      verbose: false,
    }
    const orchestrator = new CollectorOrchestrator(config)
    const result = await orchestrator.scrape({
      date: DATE,
      force: true,
      districts,
    })
    await orchestrator.close()
    return result
  }

  async function hydrate(districtId: string) {
    const dir = path.join(rawDir(), `district-${districtId}`)
    await fs.mkdir(dir, { recursive: true })
    for (const name of [
      'club-performance.csv',
      'district-performance.csv',
      'division-performance.csv',
    ]) {
      await fs.writeFile(path.join(dir, name), SUMMARY_CSV)
    }
  }

  const metadataDistricts = async () =>
    Object.keys(
      (
        JSON.parse(await fs.readFile(metadataPath(), 'utf-8')) as {
          csvFiles: { districts: Record<string, unknown> }
        }
      ).csvFiles.districts
    ).sort()

  it('lists every district when the scrape covers the whole set (baseline)', async () => {
    await scrape(['61', '62', 'F'])

    expect(await metadataDistricts()).toEqual(['61', '62', 'F'])
  })

  it('does not write a one-district metadata.json for a subset scrape', async () => {
    const result = await scrape(['61'])

    expect(result.districtsSucceeded).toEqual(['61'])
    const written = await fs
      .access(metadataPath())
      .then(() => true)
      .catch(() => false)
    if (written) {
      expect(await metadataDistricts()).not.toEqual(['61'])
    }
    expect(written).toBe(false)
    const refusal = result.errors.filter(e => e.districtId === 'date-level')
    expect(refusal).toHaveLength(1)
    expect(refusal[0]!.error).toContain('62')
    expect(refusal[0]!.error).toContain('F')
  })

  it('lists the whole set for a subset scrape once the others are hydrated', async () => {
    await hydrate('62')
    await hydrate('F')

    const result = await scrape(['61'])

    expect(result.errors).toEqual([])
    expect(await metadataDistricts()).toEqual(['61', '62', 'F'])
  })
})
