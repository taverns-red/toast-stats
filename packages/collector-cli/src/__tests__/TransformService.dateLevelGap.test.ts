/**
 * A #1671 source gap counts toward the #1756 date-level roster the way a
 * recorded failure does (#2035, #1759).
 *
 * Rebuild run 38571400392 (#1759 B4) refused every date: district U's
 * club-performance.csv is TI's 8082-byte XHTML error page for every closing
 * raw 2017-02-08..2020-07-12. #1671 records that as a gap (success, skipped,
 * no district_U.json); #1756's roster accepted only a snapshot file or a
 * recorded failure, so U counted as missing and metadata, manifest, rankings
 * and awards were all refused. Ron's decision: count gaps as failures.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TransformService } from '../services/TransformService.js'
import {
  GAP_DISTRICT,
  SUBSET_DATE,
  SUBSET_DISTRICTS,
  addGapDistrictRaw,
  writeSubsetRawCsv,
} from './fixtures/dateLevelSubsetFixture.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TI_ERROR_PAGE = fsSync.readFileSync(
  path.join(
    HERE,
    'fixtures/ti-error-page-2019-07-16-district-U-clubperformance.html'
  ),
  'utf-8'
)

const DATE_LEVEL_FILES = [
  'all-districts-rankings.json',
  'competitive-awards.json',
  'manifest.json',
  'metadata.json',
]

describe('TransformService — a source gap is accounted for in the date-level roster (#2035)', () => {
  let cacheDir: string
  let service: TransformService

  const snapshotDir = () => path.join(cacheDir, 'snapshots', SUBSET_DATE)
  const readJson = async <T>(name: string): Promise<T> =>
    JSON.parse(await fs.readFile(path.join(snapshotDir(), name), 'utf-8')) as T
  const exists = (name: string) =>
    fs.access(path.join(snapshotDir(), name)).then(
      () => true,
      () => false
    )

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'date-level-gap-'))
    service = new TransformService({ cacheDir })
  })

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  it('fixture: the club report is the real 8082-byte TI error page', () => {
    expect(Buffer.byteLength(TI_ERROR_PAGE)).toBe(8082)
    expect(TI_ERROR_PAGE).toMatch(/<!DOCTYPE html/i)
  })

  it('writes all four date-level artifacts when a district of the set is a recorded gap (B4)', async () => {
    await writeSubsetRawCsv(cacheDir, SUBSET_DISTRICTS)
    await addGapDistrictRaw(cacheDir, TI_ERROR_PAGE)

    const result = await service.transform({ date: SUBSET_DATE, force: true })

    // The gap stays a skipped district in the run result (exit code unchanged).
    expect(result.districtsSkipped).toEqual([GAP_DISTRICT])
    expect(result.districtsFailed).toEqual([])
    expect(result.errors.filter(e => e.districtId === 'date-level')).toEqual([])
    expect(await exists(`district_${GAP_DISTRICT}.json`)).toBe(false)
    for (const name of DATE_LEVEL_FILES) {
      expect(await exists(name), name).toBe(true)
    }
  })

  it('records the gap district as failed, with its reason, in metadata.json and manifest.json', async () => {
    await writeSubsetRawCsv(cacheDir, SUBSET_DISTRICTS)
    await addGapDistrictRaw(cacheDir, TI_ERROR_PAGE)

    await service.transform({ date: SUBSET_DATE, force: true })

    const metadata = await readJson<{
      status: string
      successfulDistricts: string[]
      failedDistricts: string[]
      configuredDistricts: string[]
      errors: string[]
    }>('metadata.json')
    expect([...metadata.successfulDistricts].sort()).toEqual(['02', '21', '49'])
    expect(metadata.failedDistricts).toEqual([GAP_DISTRICT])
    expect([...metadata.configuredDistricts].sort()).toEqual([
      '02',
      '21',
      '49',
      GAP_DISTRICT,
    ])
    expect(metadata.status).toBe('partial')
    const reason = metadata.errors.filter(e =>
      e.startsWith(`${GAP_DISTRICT}: `)
    )
    expect(reason).toHaveLength(1)
    expect(reason[0]).toMatch(/not a CSV/)
    expect(reason[0]).toMatch(/#1671/)

    const manifest = await readJson<{
      totalDistricts: number
      successfulDistricts: number
      failedDistricts: number
      districts: Array<{ districtId: string }>
    }>('manifest.json')
    expect(manifest.districts.map(d => d.districtId).sort()).toEqual([
      '02',
      '21',
      '49',
    ])
    expect(manifest.successfulDistricts).toBe(3)
    expect(manifest.failedDistricts).toBe(1)
    expect(manifest.totalDistricts).toBe(4)
  })

  it('still refuses when another district of the set has no input and no recorded gap or failure (#1756 intact)', async () => {
    await writeSubsetRawCsv(cacheDir, ['21', '49'])
    await addGapDistrictRaw(cacheDir, TI_ERROR_PAGE)

    const result = await service.transform({
      date: SUBSET_DATE,
      districts: ['21', '49', GAP_DISTRICT],
      force: true,
    })

    for (const name of DATE_LEVEL_FILES) {
      expect(await exists(name), name).toBe(false)
    }
    const refusal = result.errors.filter(e => e.districtId === 'date-level')
    expect(refusal).toHaveLength(1)
    expect(refusal[0]!.error).toMatch(/missing: 02\)/)
  })
})
