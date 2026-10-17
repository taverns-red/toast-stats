/**
 * `compute-analytics` writes `time-series/regions/{PY}.json` (#2127).
 *
 * The series is derived whole from the district time-series files on disk
 * after this date's points are written, so it sits inside the time-series
 * store: publish-stores.sh uploads it (changed files only, recorded in the
 * run manifest) and promotion copies time-series/ with it.
 *
 * Inputs: the region-rollups snapshot capture for 2026-06-30 (districts 01,
 * 111, 68, U — compute writes their points) and the recorded prod 2025-26
 * series of Region 09's five districts, pre-seeded as the synced store.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RegionMembershipSeriesSchema } from '@taverns-red/shared-contracts'
import { AnalyticsComputeService } from '../services/AnalyticsComputeService.js'

const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../analytics-core/src/rollup/__tests__/fixtures'
)
const ROLLUP_FIX = path.join(FIXTURES, 'region-rollups')
const SERIES_FIX = path.join(FIXTURES, 'region-membership-series')
const DATE = '2026-06-30'
const PY = '2025-2026'
const DISTRICTS = ['01', '111', '68', 'U']
const REGION_09 = ['75', '76', '80', '87', '93']
// jq '.dataPoints[-1].membership' over the recorded files (2026-06-30).
const REGION_09_LAST = 3043 + 3071 + 5012 + 2261 + 1299

describe('AnalyticsComputeService — time-series/regions/{PY}.json (#2127)', () => {
  let cacheDir: string
  const outPath = () =>
    path.join(cacheDir, 'time-series', 'regions', `${PY}.json`)

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'region-series-'))
    await fs.cp(
      path.join(ROLLUP_FIX, 'snapshots', DATE),
      path.join(cacheDir, 'snapshots', DATE),
      { recursive: true }
    )
    await fs.mkdir(path.join(cacheDir, 'config'), { recursive: true })
    await fs.copyFile(
      path.join(ROLLUP_FIX, 'config/district-region-history.json'),
      path.join(cacheDir, 'config/district-region-history.json')
    )
    for (const id of REGION_09) {
      await fs.cp(
        path.join(SERIES_FIX, 'time-series', `district_${id}`),
        path.join(cacheDir, 'time-series', `district_${id}`),
        { recursive: true }
      )
    }
  })

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  const compute = () =>
    new AnalyticsComputeService({ cacheDir }).compute({
      date: DATE,
      districts: DISTRICTS,
    })

  const read = async () =>
    RegionMembershipSeriesSchema.parse(
      JSON.parse(await fs.readFile(outPath(), 'utf-8'))
    )

  it('writes a schema-valid series for the date’s program year from every district series on disk', async () => {
    const result = await compute()
    expect(result.regionSeriesPath).toBe(outPath())
    expect(result.regionSeriesFailed).toBe(false)
    const series = await read()
    expect(series.programYear).toBe(PY)
    const last = series.dates.indexOf(DATE)
    expect(last).toBe(series.dates.length - 1)
    // Region 09 is whole on disk: its recorded members' sum.
    expect(series.regions!['09']!.districtIds).toEqual(REGION_09)
    expect(series.regions!['09']!.membership[last]).toBe(REGION_09_LAST)
    // District 01 (Region 02) got its point from this compute; the rest of
    // Region 02 has no series here, so the region reads null, never 0.
    expect(series.regions!['02']!.districtIds).toContain('01')
    expect(series.regions!['02']!.membership[last]).toBeNull()
    // U is not placed: listed, not summed.
    expect(series.unassignedDistricts).toContain('U')
  })

  it('is byte-stable across reruns of the same date', async () => {
    await compute()
    const first = await fs.readFile(outPath(), 'utf-8')
    await compute()
    expect(await fs.readFile(outPath(), 'utf-8')).toBe(first)
  })

  it('without a synced region history, writes regions null with the reason', async () => {
    await fs.rm(path.join(cacheDir, 'config'), { recursive: true })
    const result = await compute()
    expect(result.regionSeriesFailed).toBe(false)
    const series = await read()
    expect(series.regions).toBeNull()
    expect(series.regionMembershipNote).toMatch(/district-region-history/)
  })
})
