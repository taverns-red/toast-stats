/**
 * `compute-analytics` writes `snapshots/{date}/clubs-by-region/` (#1800):
 * one shard per region plus `world.json`.
 *
 * Same placement and refusal rules as `region-rollups.json` (#1799): the
 * compute step holds the whole date on disk; a ranked district without a
 * file refuses every file (ADR-015 P3, never a partial region); regions come
 * from `<cache>/config/district-region-history.json`, which the pipeline
 * pulls from staging before compute. The per-date upload sends the
 * directory, so each file lands in the run manifest and is promoted with its
 * date.
 *
 * Inputs are the recorded staging captures of the analytics-core fixture.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CLUBS_BY_REGION_DIR,
  CLUBS_BY_REGION_WORLD_FILE_NAME,
  ClubsByRegionShardSchema,
  ClubsByRegionWorldSchema,
} from '@taverns-red/shared-contracts'
import { AnalyticsComputeService } from '../services/AnalyticsComputeService.js'

const FIX = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../analytics-core/src/rollup/__tests__/fixtures/clubs-by-region'
)
const DATE = '2026-10-16'
const DISTRICTS = ['17', '49', '61', 'U']

describe('AnalyticsComputeService — clubs-by-region/ (#1800)', () => {
  let cacheDir: string
  const snapshotDir = () => path.join(cacheDir, 'snapshots', DATE)
  const outDir = () => path.join(snapshotDir(), CLUBS_BY_REGION_DIR)
  const read = async (name: string) =>
    JSON.parse(await fs.readFile(path.join(outDir(), name), 'utf-8'))

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clubs-by-region-'))
    await fs.cp(path.join(FIX, 'snapshots', DATE), snapshotDir(), {
      recursive: true,
    })
    await fs.rm(path.join(snapshotDir(), 'region-rollups.districts.json'))
    await fs.mkdir(path.join(cacheDir, 'config'), { recursive: true })
    await fs.copyFile(
      path.join(FIX, 'config/district-region-history.json'),
      path.join(cacheDir, 'config/district-region-history.json')
    )
  })

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  const compute = () =>
    new AnalyticsComputeService({ cacheDir }).compute({
      date: DATE,
      districts: DISTRICTS,
    })

  it('writes one schema-valid shard per region and the world file, regions from the synced history', async () => {
    const result = await compute()
    expect(result.clubsByRegionFailed).toBe(false)
    expect(result.clubsByRegionPaths).toEqual(
      ['01.json', '05.json', '12.json', 'unassigned.json', 'world.json'].map(
        f => path.join(outDir(), f)
      )
    )
    expect((await fs.readdir(outDir())).sort()).toEqual([
      '01.json',
      '05.json',
      '12.json',
      'unassigned.json',
      'world.json',
    ])
    const shard = ClubsByRegionShardSchema.parse(await read('05.json'))
    expect(shard.districtIds).toEqual(['61'])
    expect(shard.counts).toEqual({ clubs: 161, mapped: 159, unmapped: 2 })
    const world = ClubsByRegionWorldSchema.parse(
      await read(CLUBS_BY_REGION_WORLD_FILE_NAME)
    )
    expect(world.totals.clubs).toBe(318)
    expect(world.programYear).toBe('2026-2027')
  })

  it('writes compact JSON (the world file feeds a 15k-pin map)', async () => {
    await compute()
    const raw = await fs.readFile(
      path.join(outDir(), CLUBS_BY_REGION_WORLD_FILE_NAME),
      'utf-8'
    )
    expect(raw.split('\n').filter(Boolean)).toHaveLength(1)
  })

  it('replaces a previous run’s shards: a region that no longer exists leaves no file behind', async () => {
    await fs.mkdir(outDir(), { recursive: true })
    await fs.writeFile(path.join(outDir(), '09.json'), '{"stale":true}\n')
    await compute()
    await expect(fs.access(path.join(outDir(), '09.json'))).rejects.toThrow()
  })

  it('without a synced region history writes only the world file, which says why', async () => {
    await fs.rm(path.join(cacheDir, 'config'), { recursive: true })
    const result = await compute()
    expect(result.clubsByRegionFailed).toBe(false)
    expect(await fs.readdir(outDir())).toEqual(['world.json'])
    const world = ClubsByRegionWorldSchema.parse(
      await read(CLUBS_BY_REGION_WORLD_FILE_NAME)
    )
    expect(world.shards).toBeNull()
    expect(world.regionMembershipNote).toMatch(/district-region-history/)
  })

  it('refuses every file when a listed district has no file (ADR-015 P3), recorded but not publish-blocking', async () => {
    await fs.rm(path.join(snapshotDir(), 'district_49.json'))
    const result = await compute()
    expect(result.clubsByRegionFailed).toBe(true)
    expect(result.clubsByRegionPaths).toBeUndefined()
    await expect(fs.access(outDir())).rejects.toThrow()
    expect(
      result.errors.some(
        e => e.error.includes(CLUBS_BY_REGION_DIR) && /49/.test(e.error)
      )
    ).toBe(true)
  })

  it('skips quietly when the date has no rankings file', async () => {
    await fs.rm(path.join(snapshotDir(), 'all-districts-rankings.json'))
    const result = await compute()
    expect(result.clubsByRegionFailed).toBe(false)
    expect(result.clubsByRegionPaths).toBeUndefined()
    expect(
      result.errors.filter(e => e.error.includes(CLUBS_BY_REGION_DIR))
    ).toEqual([])
  })
})
