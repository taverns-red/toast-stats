/**
 * The worldwide rollups refuse a date whose district files do not cover the
 * date's district set (#1756, ADR-015 P3).
 *
 * Rescrape run 38149429523 (`districts=61`) wrote `global-totals.json` with
 * `clubs: 161` for a 94-district date and `global-club-race.json` with
 * `clubsScanned: 161`: the rankings file listed 94 districts, the runner held
 * one district file, and both rollups summed what was there. The sibling
 * runner `scripts/build-global-totals.ts` already refuses exactly this shape;
 * the compute step now does too — a counted error, no file.
 *
 * The snapshot directory is produced by a real transform of the real-shape
 * raw fixture, then the two other district files are removed: the rankings
 * file names three districts, one district file is on disk.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  GLOBAL_CLUB_RACE_FILE_NAME,
  GLOBAL_TOTALS_FILE_NAME,
} from '@taverns-red/shared-contracts'
import { TransformService } from '../services/TransformService.js'
import { AnalyticsComputeService } from '../services/AnalyticsComputeService.js'
import {
  SUBSET_DATE,
  SUBSET_DISTRICTS,
  writeSubsetRawCsv,
} from './fixtures/dateLevelSubsetFixture.js'

describe('AnalyticsComputeService — rollups need the whole district set (#1756)', () => {
  let cacheDir: string

  const snapshotDir = () => path.join(cacheDir, 'snapshots', SUBSET_DATE)
  const exists = (name: string) =>
    fs.access(path.join(snapshotDir(), name)).then(
      () => true,
      () => false
    )

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'date-level-compute-'))
    await writeSubsetRawCsv(cacheDir, SUBSET_DISTRICTS)
    const transform = await new TransformService({ cacheDir }).transform({
      date: SUBSET_DATE,
      force: true,
    })
    expect(transform.errors).toEqual([])
  })

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  it('writes both rollups over all three districts when every file is present (baseline)', async () => {
    const result = await new AnalyticsComputeService({ cacheDir }).compute({
      date: SUBSET_DATE,
    })

    expect(result.globalTotalsFailed).toBe(false)
    const totals = JSON.parse(
      await fs.readFile(
        path.join(snapshotDir(), GLOBAL_TOTALS_FILE_NAME),
        'utf-8'
      )
    ) as { membership: { clubsCounted: number } }
    expect(totals.membership.clubsCounted).toBe(6)
    expect(await exists(GLOBAL_CLUB_RACE_FILE_NAME)).toBe(true)
  })

  it('refuses global-totals and the club race when 2 of the 3 ranked districts have no file', async () => {
    await fs.rm(path.join(snapshotDir(), 'district_02.json'))
    await fs.rm(path.join(snapshotDir(), 'district_21.json'))

    const result = await new AnalyticsComputeService({ cacheDir }).compute({
      date: SUBSET_DATE,
      districts: ['49'],
    })

    // Today's bug wrote clubsCounted = 2: one district's clubs as the world.
    if (await exists(GLOBAL_TOTALS_FILE_NAME)) {
      const totals = JSON.parse(
        await fs.readFile(
          path.join(snapshotDir(), GLOBAL_TOTALS_FILE_NAME),
          'utf-8'
        )
      ) as { membership: { clubsCounted: number } }
      expect(totals.membership.clubsCounted).not.toBe(2)
    }
    expect(await exists(GLOBAL_TOTALS_FILE_NAME)).toBe(false)
    expect(await exists(GLOBAL_CLUB_RACE_FILE_NAME)).toBe(false)
    expect(result.globalTotalsFailed).toBe(true)
    expect(result.clubRaceStoreFailed).toBe(true)

    const named = result.errors.filter(
      e => e.error.includes('02') && e.error.includes('21')
    )
    expect(named.length).toBeGreaterThanOrEqual(2)
    expect(result.success).toBe(false)
  })
})
