/**
 * Transform treats a non-CSV or missing club-performance file as an explicit
 * gap, reported through the single results[] path. It is never read as a
 * district with zero (or garbage) clubs (#1671).
 *
 * raw-csv/2019-07-16/district-U/club-performance.csv in staging is TI's
 * 8082-byte HTML error page. The district's division and district reports at
 * the same as-of are real CSVs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { fileURLToPath } from 'node:url'
import { TransformService } from '../services/TransformService.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TI_ERROR_PAGE = fsSync.readFileSync(
  path.join(
    HERE,
    'fixtures/ti-error-page-2019-07-16-district-U-clubperformance.html'
  ),
  'utf-8'
)

const CLUB_CSV = `Club Number,Club Name,Division,Area,Active Members,Total to Date,Goals Met,Club Status
1234,Test Club One,A,1,25,30,5,Active
5678,Test Club Two,A,2,18,22,3,Active`
const DIVISION_CSV = `Division,Division Name,Club Count,Membership,Total to Date
A,Division Alpha,2,43,52`

const DATE = '2019-07-16'

describe('TransformService — a club-performance file that is not a CSV (#1671)', () => {
  let cacheDir: string
  let service: TransformService

  beforeEach(async () => {
    cacheDir = path.join(
      os.tmpdir(),
      `transform-noncsv-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    await fs.mkdir(cacheDir, { recursive: true })
    service = new TransformService({ cacheDir })
  })

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  async function writeRaw(districtId: string, files: Record<string, string>) {
    const dir = path.join(cacheDir, 'raw-csv', DATE, `district-${districtId}`)
    await fs.mkdir(dir, { recursive: true })
    for (const [name, content] of Object.entries(files)) {
      await fs.writeFile(path.join(dir, name), content)
    }
  }

  async function snapshotExists(districtId: string) {
    try {
      await fs.access(
        path.join(cacheDir, 'snapshots', DATE, `district_${districtId}.json`)
      )
      return true
    } catch {
      return false
    }
  }

  it('skips a district whose club-performance.csv is an HTML error page, writing no snapshot', async () => {
    await writeRaw('61', { 'club-performance.csv': CLUB_CSV })
    await writeRaw('U', {
      'club-performance.csv': TI_ERROR_PAGE,
      'division-performance.csv': DIVISION_CSV,
    })

    const result = await service.transform({ date: DATE })

    expect(result.districtsSucceeded).toContain('61')
    expect(result.districtsSkipped).toEqual(['U'])
    expect(result.districtsFailed).toEqual([])
    expect(await snapshotExists('U')).toBe(false)
    expect(await snapshotExists('61')).toBe(true)
  })

  it('names the reason in the district result', async () => {
    await writeRaw('U', { 'club-performance.csv': TI_ERROR_PAGE })

    const result = await service.transformDistrict(DATE, 'U', { force: true })

    expect(result.skipped).toBe(true)
    expect(result.error).toMatch(/not a CSV/i)
    expect(result.error).toMatch(/HTML/)
  })

  it('reports a missing club-performance.csv as an explicit gap, not zero clubs', async () => {
    // What the downloader leaves behind after rejecting the HTML body: the
    // district's other reports, and no club report.
    await writeRaw('61', { 'club-performance.csv': CLUB_CSV })
    await writeRaw('U', { 'division-performance.csv': DIVISION_CSV })

    const result = await service.transform({ date: DATE })

    expect(result.districtsSkipped).toEqual(['U'])
    expect(await snapshotExists('U')).toBe(false)

    const u = await service.transformDistrict(DATE, 'U', { force: true })
    expect(u.skipped).toBe(true)
    expect(u.error).toMatch(/club-performance\.csv/)
    expect(u.error).toMatch(/gap/)
  })

  it('still fails a district with no raw directory at all', async () => {
    const u = await service.transformDistrict(DATE, 'U', { force: true })
    expect(u.success).toBe(false)
    expect(u.error).toContain('Raw CSV data not found')
  })
})
