/**
 * District discovery is per date, from the date's own all-districts CSV
 * (#1766, ADR-015 P3, audit D-7 and D-25).
 *
 * A transform with no explicit district list used to take every
 * `raw-csv/<date>/district-*` directory on disk. Raw-csv uploads never delete
 * (`gcloud storage rsync` without `--delete`), so a directory for a district
 * that no longer exists on that date survives in staging, is pulled by the
 * next rebuild, and is transformed into the date again (D-25). The date's
 * all-districts CSV names the districts that existed on it; a raw directory
 * it does not name is ignored. Across the 2026-27 consolidation (128 → 94)
 * the two sides of the boundary have different sets, and each date must
 * transform its own (D-7).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { TransformService } from '../services/TransformService.js'
import { writeRawCsvForDate } from './fixtures/dateLevelSubsetFixture.js'

describe('TransformService — per-date district discovery (#1766)', () => {
  let cacheDir: string
  let service: TransformService

  const districtFiles = async (date: string): Promise<string[]> =>
    (await fs.readdir(path.join(cacheDir, 'snapshots', date)))
      .filter(name => /^district_[^_]+\.json$/.test(name))
      .sort()

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'per-date-discovery-'))
    service = new TransformService({ cacheDir })
  })

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  it('two dates whose CSVs list different district sets each transform their own set', async () => {
    // Both dates carry raw for all three districts, as a staging date with a
    // leftover directory does. Only the CSV says which existed.
    await writeRawCsvForDate(
      cacheDir,
      '2026-10-08',
      ['02', '21'],
      ['02', '21', '49']
    )
    await writeRawCsvForDate(
      cacheDir,
      '2026-10-09',
      ['21', '49'],
      ['02', '21', '49']
    )

    const first = await service.transform({ date: '2026-10-08', force: true })
    const second = await service.transform({ date: '2026-10-09', force: true })

    expect(first.districtsProcessed).toEqual(['02', '21'])
    expect(second.districtsProcessed).toEqual(['21', '49'])
    expect(await districtFiles('2026-10-08')).toEqual([
      'district_02.json',
      'district_21.json',
    ])
    expect(await districtFiles('2026-10-09')).toEqual([
      'district_21.json',
      'district_49.json',
    ])
  })

  it('a stale district-XX/ raw directory the date’s CSV does not name is not transformed', async () => {
    await writeRawCsvForDate(
      cacheDir,
      '2026-10-09',
      ['02', '21'],
      ['02', '21', '49']
    )

    const result = await service.transform({ date: '2026-10-09', force: true })

    expect(result.districtsProcessed).not.toContain('49')
    expect(result.districtsSucceeded).toEqual(['02', '21'])
    expect(await districtFiles('2026-10-09')).not.toContain('district_49.json')
    // The date-level artifacts describe the CSV's set, which is fully
    // covered, so the stale directory refuses nothing either.
    expect(result.errors).toEqual([])
  })

  it('matches directory and CSV ids by district, not by spelling (zero padding)', async () => {
    await writeRawCsvForDate(cacheDir, '2026-10-09', ['02', '21'], ['21'])
    await fs.rename(
      path.join(cacheDir, 'raw-csv', '2026-10-09', 'district-21'),
      path.join(cacheDir, 'raw-csv', '2026-10-09', 'district-021')
    )

    const result = await service.transform({ date: '2026-10-09', force: true })

    expect(result.districtsProcessed).toEqual(['021'])
  })

  it('a date with no readable all-districts CSV still transforms every raw directory (undecided, not emptied)', async () => {
    await writeRawCsvForDate(
      cacheDir,
      '2026-10-09',
      ['02', '21'],
      ['02', '21', '49']
    )
    await fs.rm(
      path.join(cacheDir, 'raw-csv', '2026-10-09', 'all-districts.csv')
    )

    const result = await service.transform({ date: '2026-10-09', force: true })

    expect(result.districtsProcessed).toEqual(['02', '21', '49'])
  })

  it('an explicit district list is still taken as given', async () => {
    await writeRawCsvForDate(
      cacheDir,
      '2026-10-09',
      ['02', '21'],
      ['02', '21', '49']
    )

    const result = await service.transform({
      date: '2026-10-09',
      districts: ['21'],
      force: true,
    })

    expect(result.districtsProcessed).toEqual(['21'])
  })
})
