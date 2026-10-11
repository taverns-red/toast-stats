/**
 * Date-level artifacts need the whole district set, or they are not written
 * (#1756, ADR-015 P3 "hydrate, else refuse").
 *
 * Rescrape run 38149429523 (`districts=61`, 2026-10-10) transformed one
 * district and still wrote every date-level artifact: rankings with
 * `clubsWith20PlusMembers`/`newCharteredClubs`/`suspendedClubs` = 0 for the
 * 93 districts whose raw was not on the runner, `manifest.json` with
 * `totalDistricts: 1`, `metadata.json` 1/1, and `competitive-awards.json`
 * built from those zeroed rows. A missing input rendered as a measured zero.
 *
 * The date's own all-districts CSV names the district set. The transform
 * writes the date-level artifacts only when the per-district inputs on disk
 * cover it — the run's own districts plus any hydrated from staging — and
 * otherwise refuses them with a counted error.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { TransformService } from '../services/TransformService.js'
import {
  SUBSET_DATE,
  SUBSET_DISTRICTS,
  writeSubsetRawCsv,
} from './fixtures/dateLevelSubsetFixture.js'

const DATE_LEVEL_FILES = [
  'all-districts-rankings.json',
  'competitive-awards.json',
  'manifest.json',
  'metadata.json',
]

describe('TransformService — date-level artifacts need the whole district set (#1756)', () => {
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

  interface RankingRow {
    districtId: string
    clubsWith20PlusMembers: number
    newCharteredClubs: number
    suspendedClubs: number
  }

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'date-level-'))
    service = new TransformService({ cacheDir })
  })

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  it('writes every date-level artifact from the full set when all raw is present (baseline)', async () => {
    await writeSubsetRawCsv(cacheDir, SUBSET_DISTRICTS)

    const result = await service.transform({ date: SUBSET_DATE, force: true })

    expect(result.errors).toEqual([])
    const rankings = await readJson<{ rankings: RankingRow[] }>(
      'all-districts-rankings.json'
    )
    expect(rankings.rankings.map(r => r.districtId).sort()).toEqual([
      '02',
      '21',
      '49',
    ])
    for (const row of rankings.rankings) {
      expect(row.clubsWith20PlusMembers).toBe(1)
      expect(row.newCharteredClubs).toBe(1)
      expect(row.suspendedClubs).toBe(1)
    }
    const manifest = await readJson<{ totalDistricts: number }>('manifest.json')
    expect(manifest.totalDistricts).toBe(3)
  })

  it('refuses the date-level artifacts when raw exists for 1 of the 3 districts the CSV names', async () => {
    await writeSubsetRawCsv(cacheDir, ['49'])

    const result = await service.transform({
      date: SUBSET_DATE,
      districts: ['49'],
      force: true,
    })

    // The district itself still transforms: refusal is date-level only.
    expect(result.districtsSucceeded).toEqual(['49'])
    expect(await exists('district_49.json')).toBe(true)

    // No rankings file can carry a 0 for 02 or 21 if no rankings file exists.
    if (await exists('all-districts-rankings.json')) {
      const rankings = await readJson<{ rankings: RankingRow[] }>(
        'all-districts-rankings.json'
      )
      for (const row of rankings.rankings) {
        expect(row.clubsWith20PlusMembers, row.districtId).not.toBe(0)
      }
    }
    if (await exists('manifest.json')) {
      const manifest = await readJson<{ totalDistricts: number }>(
        'manifest.json'
      )
      expect(manifest.totalDistricts).not.toBe(1)
    }
    for (const name of DATE_LEVEL_FILES) {
      expect(await exists(name), name).toBe(false)
    }

    // Counted, named, and the run is not a success.
    const refusal = result.errors.filter(e => e.districtId === 'date-level')
    expect(refusal).toHaveLength(1)
    expect(refusal[0]!.error).toContain('02')
    expect(refusal[0]!.error).toContain('21')
    expect(result.success).toBe(false)
  })

  it('refuses on discovery too: a CSV district with no raw directory is a shortfall, not a zero', async () => {
    await writeSubsetRawCsv(cacheDir, ['21', '49'])

    const result = await service.transform({ date: SUBSET_DATE, force: true })

    for (const name of DATE_LEVEL_FILES) {
      expect(await exists(name), name).toBe(false)
    }
    const refusal = result.errors.filter(e => e.districtId === 'date-level')
    expect(refusal).toHaveLength(1)
    expect(refusal[0]!.error).toContain('02')
  })

  it('writes complete artifacts for a subset run once the other districts are hydrated', async () => {
    // Hydration as process-dates.sh does it: the other districts' raw and
    // snapshot files are already on disk (pulled from staging) before the
    // subset transform runs.
    await writeSubsetRawCsv(cacheDir, SUBSET_DISTRICTS)
    await service.transform({ date: SUBSET_DATE, force: true })
    await fs.rm(path.join(snapshotDir(), 'manifest.json'))
    await fs.rm(path.join(snapshotDir(), 'metadata.json'))
    await fs.rm(path.join(snapshotDir(), 'all-districts-rankings.json'))

    const result = await service.transform({
      date: SUBSET_DATE,
      districts: ['49'],
      force: true,
    })

    expect(result.errors).toEqual([])
    const manifest = await readJson<{
      totalDistricts: number
      districts: Array<{ districtId: string }>
    }>('manifest.json')
    expect(manifest.totalDistricts).toBe(3)
    expect(manifest.districts.map(d => d.districtId).sort()).toEqual([
      '02',
      '21',
      '49',
    ])
    const metadata = await readJson<{ successfulDistricts: string[] }>(
      'metadata.json'
    )
    expect([...metadata.successfulDistricts].sort()).toEqual(['02', '21', '49'])
    const rankings = await readJson<{ rankings: RankingRow[] }>(
      'all-districts-rankings.json'
    )
    expect(rankings.rankings).toHaveLength(3)
    for (const row of rankings.rankings) {
      expect(row.clubsWith20PlusMembers, row.districtId).toBe(1)
    }
  })
})
