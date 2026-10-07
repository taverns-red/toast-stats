/**
 * A scrape of date D must fetch D, or refuse it. It must never store another
 * day's data under D (#1669).
 *
 * The root `/export.aspx` ignores the requested as-of whenever the URL's
 * month-end slot is empty, and serves the current day instead. The daily path
 * never noticed, because "today" is what it wants. A `mode=rescrape` of
 * 2022-07-28 got back "As of 10/05/2026" and uploaded it as 2022-07-28.
 *
 * The mock below reproduces TI's behaviour as measured on 2026-10-06:
 *
 *   live,    empty slot     → current body, "As of 10/05/2026" (whatever D is)
 *   live,    populated slot → header + "As of D" footer, zero rows, for any D
 *                             outside the live year (2 lines)
 *   archive, populated slot → the real body for D
 *   archive, empty slot     → the year's final body with an "As of <today>"
 *                             footer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { CollectorOrchestrator } from '../CollectorOrchestrator.js'
import type { CollectorOrchestratorConfig } from '../types/index.js'

const SUMMARY_HEADER = '"REGION","DISTRICT","Paid Club Base","Paid Clubs"'
const CLUB_HEADER = '"District","Division","Area","Club Number","Club Name"'

const TODAY_AS_OF = 'Month of Sep, As of 10/05/2026'

interface Spec {
  reportType: string
  programYear: string
  districtId?: string
  date: Date
  monthEndDate?: Date
  pathStyle?: 'live' | 'archive'
}

const captured: Spec[] = []

/** What TI serves, keyed by the request (see the file header). */
let serve: (spec: Spec) => string

function asOfFooter(date: Date, month = 'Jun'): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `Month of ${month}, As of ${mm}/${dd}/${date.getFullYear()}`
}

function body(spec: Spec, footer: string, withRows: boolean): string {
  const header =
    spec.reportType === 'districtsummary' ? SUMMARY_HEADER : CLUB_HEADER
  const row =
    spec.reportType === 'districtsummary'
      ? '"6","61","164","164"'
      : '"61","A","1","1234","Test Club"'
  return [header, ...(withRows ? [row] : []), footer].join('\n')
}

/** TI as measured: only a populated slot on the right path serves D. */
function tiAsMeasured(spec: Spec): string {
  if (!spec.monthEndDate) {
    return body(spec, TODAY_AS_OF, true)
  }
  const servesDate =
    spec.pathStyle === 'archive' && spec.programYear === '2021-2022'
  return body(spec, asOfFooter(spec.date), servesDate)
}

vi.mock('../services/HttpCsvDownloader.js', () => ({
  computeMonthEndDate: (d: Date) => new Date(d.getFullYear(), d.getMonth(), 0),
  parseClosingPeriodFromCsv: () => ({
    isClosingPeriod: true,
    dataMonth: '2022-06',
    footerFound: true,
  }),
  HttpCsvDownloader: class MockHttpCsvDownloader {
    async downloadCsv(spec: Spec) {
      captured.push(spec)
      const content = serve(spec)
      return {
        url: `https://example.com/${spec.reportType}`,
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

describe('CollectorOrchestrator — a scrape returns the requested as-of or nothing (#1669)', () => {
  let cacheDir: string
  let configPath: string

  beforeEach(async () => {
    const id = `as-of-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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
    captured.length = 0
    serve = tiAsMeasured
  })

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true }).catch(() => {})
  })

  async function scrape(date: string) {
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
      districts: ['61'],
    })
    await orchestrator.close()
    return result
  }

  async function readRaw(date: string, rel: string) {
    return fs.readFile(path.join(cacheDir, 'raw-csv', date, rel), 'utf-8')
  }

  it('requests a historical date through the populated month-end slot on the archive path', async () => {
    const result = await scrape('2022-07-28')

    expect(result.success).toBe(true)
    expect(result.districtsSucceeded).toEqual(['61'])

    // Every fetch that produced stored data asked for 2022-07-28 explicitly.
    const dataFetches = captured.filter(s => s.districtId !== undefined)
    expect(dataFetches.length).toBe(3)
    for (const spec of dataFetches) {
      expect(spec.monthEndDate).toBeInstanceOf(Date)
      expect(spec.pathStyle).toBe('archive')
      expect(spec.programYear).toBe('2021-2022')
    }

    const summary = await readRaw('2022-07-28', 'all-districts.csv')
    expect(summary).toContain('As of 07/28/2022')
    expect(summary).not.toContain('As of 10/05/2026')
    const clubs = await readRaw(
      '2022-07-28',
      'district-61/club-performance.csv'
    )
    expect(clubs).toContain('As of 07/28/2022')
  })

  it('refuses the date, writing nothing, when the dashboard only serves "As of 10/05/2026" for a 2022 request', async () => {
    serve = spec => body(spec, TODAY_AS_OF, true)

    const result = await scrape('2022-07-28')

    expect(result.success).toBe(false)
    expect(result.districtsSucceeded).toEqual([])
    expect(result.errors.map(e => e.error).join('\n')).toMatch(
      /2022-07-28.*2026-10-05|2026-10-05.*2022-07-28/
    )
    expect(captured.some(s => s.districtId !== undefined)).toBe(false)
    await expect(
      fs.readdir(path.join(cacheDir, 'raw-csv', '2022-07-28'))
    ).rejects.toThrow()
  })

  it('fails a district, and stores none of its files, when one of its bodies is for another date', async () => {
    serve = spec =>
      spec.reportType === 'divisionperformance'
        ? body(spec, TODAY_AS_OF, true)
        : tiAsMeasured(spec)

    const result = await scrape('2022-07-28')

    expect(result.districtsFailed).toEqual(['61'])
    expect(result.errors.map(e => e.error).join('\n')).toMatch(/2026-10-05/)
    await expect(
      fs.readdir(path.join(cacheDir, 'raw-csv', '2022-07-28', 'district-61'))
    ).rejects.toThrow()
  })

  it('keeps the daily request shape (empty slot) when D is the live as-of', async () => {
    const result = await scrape('2026-10-05')

    expect(result.success).toBe(true)
    expect(captured.every(s => s.monthEndDate === undefined)).toBe(true)
    expect(captured.every(s => s.pathStyle === 'live')).toBe(true)
    const summary = await readRaw('2026-10-05', 'all-districts.csv')
    expect(summary).toContain('As of 10/05/2026')
  })
})
