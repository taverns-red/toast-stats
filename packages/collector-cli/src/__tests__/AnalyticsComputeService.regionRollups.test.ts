/**
 * `compute-analytics` writes `snapshots/{date}/region-rollups.json` (#1799).
 *
 * Same placement as `global-totals.json`: the compute step is the one point
 * that holds the whole date on disk, and the per-date upload copies
 * `snapshots/${DATE}/*.json` wholesale, so it lands in the run manifest and
 * is promoted with its date. Region membership is read from
 * `<cache>/config/district-region-history.json`, which the pipeline pulls
 * from staging before compute (`sync-stores.sh district-region-history`).
 *
 * Inputs are the recorded staging captures of the analytics-core fixture.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  REGION_ROLLUPS_FILE_NAME,
  RegionRollupsSchema,
} from '@taverns-red/shared-contracts'
import { AnalyticsComputeService } from '../services/AnalyticsComputeService.js'

const FIX = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../analytics-core/src/rollup/__tests__/fixtures/region-rollups'
)
const DATE = '2026-06-30'
const DISTRICTS = ['01', '111', '68', 'U']

describe('AnalyticsComputeService — region-rollups.json (#1799)', () => {
  let cacheDir: string
  const snapshotDir = () => path.join(cacheDir, 'snapshots', DATE)
  const outPath = () => path.join(snapshotDir(), REGION_ROLLUPS_FILE_NAME)

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'region-rollups-'))
    await fs.cp(path.join(FIX, 'snapshots', DATE), snapshotDir(), {
      recursive: true,
    })
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

  it('writes a schema-valid artifact beside the district snapshots, regions from the synced history', async () => {
    const result = await compute()
    expect(result.regionRollupsPath).toBe(outPath())
    expect(result.regionRollupsFailed).toBe(false)
    const rollups = RegionRollupsSchema.parse(
      JSON.parse(await fs.readFile(outPath(), 'utf-8'))
    )
    expect(rollups.snapshotDate).toBe(DATE)
    expect(rollups.programYear).toBe('2025-2026')
    expect(rollups.districts['01']!.region).toBe('02')
    expect(rollups.world.clubs).toBe(222)
    expect(rollups.scope.excludedDistricts).toEqual(['201'])
  })

  it('without a synced region history, still writes the world and district rows, regions null', async () => {
    await fs.rm(path.join(cacheDir, 'config'), { recursive: true })
    const result = await compute()
    expect(result.regionRollupsFailed).toBe(false)
    const rollups = RegionRollupsSchema.parse(
      JSON.parse(await fs.readFile(outPath(), 'utf-8'))
    )
    expect(rollups.regions).toBeNull()
    expect(rollups.world.clubs).toBe(222)
  })

  it('an unreadable region history is reported in the artifact, not trusted', async () => {
    await fs.writeFile(
      path.join(cacheDir, 'config/district-region-history.json'),
      '{"districts": "not a history"}'
    )
    const result = await compute()
    expect(result.regionRollupsFailed).toBe(false)
    const rollups = RegionRollupsSchema.parse(
      JSON.parse(await fs.readFile(outPath(), 'utf-8'))
    )
    expect(rollups.regions).toBeNull()
    expect(rollups.regionMembershipNote).toMatch(/not a valid/)
  })

  it('refuses the artifact when a listed district has no file (ADR-015 P3), recorded but not publish-blocking', async () => {
    await fs.rm(path.join(snapshotDir(), 'district_68.json'))
    const result = await compute()
    expect(result.regionRollupsFailed).toBe(true)
    expect(result.regionRollupsPath).toBeUndefined()
    await expect(fs.access(outPath())).rejects.toThrow()
    expect(
      result.errors.some(
        e => e.error.includes(REGION_ROLLUPS_FILE_NAME) && /68/.test(e.error)
      )
    ).toBe(true)
  })

  it('skips quietly when the date has no rankings file', async () => {
    await fs.rm(path.join(snapshotDir(), 'all-districts-rankings.json'))
    const result = await compute()
    expect(result.regionRollupsFailed).toBe(false)
    expect(result.regionRollupsPath).toBeUndefined()
    expect(
      result.errors.filter(e => e.error.includes(REGION_ROLLUPS_FILE_NAME))
    ).toEqual([])
  })
})
