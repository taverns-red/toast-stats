/**
 * `scrape --discover-districts`: the district set is read from the scraped
 * date's own districtsummary (#1766, ADR-015 P3, audit D-7).
 *
 * The rescrape step used to discover districts once, from the first date, and
 * hand that list to every date. Across the 2026-27 consolidation (128 → 94
 * districts) one side of the boundary was scraped with the other side's set.
 * #1465 already drops a requested district the date does not list, but a
 * district the date lists and the first date did not was never fetched.
 *
 * `collector-cli discover-districts --date D` cannot stand in per date: it
 * reads the live endpoint, which answers any past date with today's as-of.
 * The scrape itself already resolves D's own as-of body (#1669) — that body's
 * DISTRICT column is the date's set, with no extra fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { CollectorOrchestrator } from '../CollectorOrchestrator.js'
import type { CollectorOrchestratorConfig } from '../types/index.js'

/** The districts each date's districtsummary lists. */
const SETS: Record<string, string[]> = {
  '2026-06-30': ['61', '62', 'F'],
  '2026-07-31': ['61', '201'],
}

function summaryFor(date: string): string {
  const [year, month, day] = date.split('-')
  const monthName = month === '06' ? 'Jun' : 'Jul'
  return [
    // One body serves every report in this mock, so the header carries each
    // report's required columns (#1671).
    '"DISTRICT","REGION","Paid Clubs Base","Paid Clubs","Division","Club Number"',
    ...(SETS[date] ?? []).map(id => `"${id}","6","100","100","A","1"`),
    // The footer names the requested date, or the body is refused (#1669).
    `"Month of ${monthName}, As of ${month}/${day}/${year}"`,
  ].join('\n')
}

const captured: Array<{ date: string; districtId?: string }> = []

vi.mock('../services/HttpCsvDownloader.js', () => ({
  parseClosingPeriodFromCsv: () => ({
    isClosingPeriod: false,
    footerFound: true,
  }),
  HttpCsvDownloader: class MockHttpCsvDownloader {
    async downloadCsv(spec: { date: Date; districtId?: string }) {
      const d = spec.date
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      captured.push({ date, districtId: spec.districtId })
      const content = summaryFor(date)
      return {
        url: 'https://example.com/export',
        content,
        statusCode: 200,
        byteSize: content.length,
      }
    }
    getRequestCount() {
      return captured.length
    }
    resetRequestCount() {}
  },
}))

describe('CollectorOrchestrator — discoverDistricts reads the date’s own set (#1766)', () => {
  let cacheDir: string
  let configPath: string

  beforeEach(async () => {
    const id = `discover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    cacheDir = path.join(process.cwd(), 'test-cache', id)
    configPath = path.join(cacheDir, 'config', 'districts.json')
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    // The config names a district neither date lists: discovery must not
    // fall back to it.
    await fs.writeFile(
      configPath,
      JSON.stringify({
        configuredDistricts: ['999'],
        lastUpdated: new Date().toISOString(),
        updatedBy: 'test',
        version: 1,
      }),
      'utf-8'
    )
    captured.length = 0
  })

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true }).catch(() => {})
    vi.clearAllMocks()
  })

  async function scrape(date: string, options: { districts?: string[] } = {}) {
    const config: CollectorOrchestratorConfig = {
      cacheDir,
      districtConfigPath: configPath,
      timeout: 30,
      verbose: false,
    }
    const orchestrator = new CollectorOrchestrator(config)
    const result = await orchestrator.scrape({
      date,
      force: true,
      discoverDistricts: true,
      ...options,
    })
    await orchestrator.close()
    return result
  }

  const fetchedFor = (date: string) =>
    captured
      .filter(c => c.date === date && c.districtId !== undefined)
      .map(c => c.districtId)

  it('two dates whose summaries list different sets each scrape their own set', async () => {
    const june = await scrape('2026-06-30')
    const july = await scrape('2026-07-31')

    expect(june.districtsSucceeded).toEqual(['61', '62', 'F'])
    expect(july.districtsSucceeded).toEqual(['61', '201'])
    expect(new Set(fetchedFor('2026-06-30'))).toEqual(
      new Set(['61', '62', 'F'])
    )
    expect(new Set(fetchedFor('2026-07-31'))).toEqual(new Set(['61', '201']))
  })

  it('never falls back to the configured districts', async () => {
    const result = await scrape('2026-06-30')

    expect(result.districtsProcessed).not.toContain('999')
  })

  it('refuses to combine discovery with an explicit list', async () => {
    const result = await scrape('2026-06-30', { districts: ['61'] })

    expect(result.success).toBe(false)
    expect(result.errors[0]?.error).toMatch(/discoverDistricts/)
    expect(captured).toEqual([])
  })
})
