/**
 * Compute's date-level roster checks accept a district the date's metadata
 * records as failed — a #1671 source gap included — the way transform's
 * does (#2035, #1759).
 *
 * The B4 rerun (run 38586593289, head a1f7ee6a) got past transform, then
 * compute-analytics refused `club-race/first-reached.json` and
 * `region-rollups.json` for every date, `missing: U`: U's club report is
 * TI's 8082-byte XHTML error page, so transform recorded it as a gap
 * (metadata `failedDistricts: [U]`, no district_U.json), while compute's
 * checks still read "ranked but no district file" as an unrecorded hole.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GLOBAL_CLUB_RACE_FILE_NAME,
  GLOBAL_TOTALS_FILE_NAME,
  GlobalTotalsSchema,
  MEETING_TIMES_FILE_NAME,
  REGION_ROLLUPS_FILE_NAME,
} from '@taverns-red/shared-contracts'
import { TransformService } from '../services/TransformService.js'
import { AnalyticsComputeService } from '../services/AnalyticsComputeService.js'
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

describe('AnalyticsComputeService — a recorded gap is accounted for in the rollup rosters (#2035)', () => {
  let cacheDir: string

  const snapshotDir = () => path.join(cacheDir, 'snapshots', SUBSET_DATE)
  const exists = (name: string) =>
    fs.access(path.join(snapshotDir(), name)).then(
      () => true,
      () => false
    )
  const readMetadata = async () =>
    JSON.parse(
      await fs.readFile(path.join(snapshotDir(), 'metadata.json'), 'utf-8')
    ) as { failedDistricts: string[] }
  const writeMetadata = async (value: unknown) =>
    fs.writeFile(
      path.join(snapshotDir(), 'metadata.json'),
      JSON.stringify(value, null, 2)
    )

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'date-level-gap-cmp-'))
    await writeSubsetRawCsv(cacheDir, SUBSET_DISTRICTS)
    await addGapDistrictRaw(cacheDir, TI_ERROR_PAGE)
    const transform = await new TransformService({ cacheDir }).transform({
      date: SUBSET_DATE,
      force: true,
    })
    expect(transform.districtsSkipped).toEqual([GAP_DISTRICT])
    expect(transform.errors).toEqual([])
    expect((await readMetadata()).failedDistricts).toEqual([GAP_DISTRICT])
    expect(await exists(`district_${GAP_DISTRICT}.json`)).toBe(false)
  })

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  it('writes global-totals, the club race and region-rollups without the gap district (B4 rerun)', async () => {
    const result = await new AnalyticsComputeService({ cacheDir }).compute({
      date: SUBSET_DATE,
    })

    expect(
      result.errors.filter(e => e.error.startsWith('Refused')),
      JSON.stringify(result.errors)
    ).toEqual([])
    expect(result.globalTotalsFailed).toBe(false)
    expect(result.clubRaceStoreFailed).toBe(false)
    expect(result.globalClubRaceFailed).toBe(false)
    expect(result.regionRollupsFailed).toBe(false)
    expect(await exists(GLOBAL_TOTALS_FILE_NAME)).toBe(true)
    expect(await exists(GLOBAL_CLUB_RACE_FILE_NAME)).toBe(true)
    expect(await exists(REGION_ROLLUPS_FILE_NAME)).toBe(true)

    // The three real districts' 6 clubs, never a junk U row.
    const totals = JSON.parse(
      await fs.readFile(
        path.join(snapshotDir(), GLOBAL_TOTALS_FILE_NAME),
        'utf-8'
      )
    ) as { membership: { clubsCounted: number } }
    expect(totals.membership.clubsCounted).toBe(6)
  })

  it('states the gap district it left out of the club sums, with its reason and size (#2042)', async () => {
    await new AnalyticsComputeService({ cacheDir }).compute({
      date: SUBSET_DATE,
    })

    // Read through the published contract, so a field the schema does not
    // declare is stripped and this assertion fails.
    const totals = GlobalTotalsSchema.parse(
      JSON.parse(
        await fs.readFile(
          path.join(snapshotDir(), GLOBAL_TOTALS_FILE_NAME),
          'utf-8'
        )
      )
    )

    expect(totals.districts.missingDistricts).toEqual([GAP_DISTRICT])
    const uncounted = totals.districts.uncountedDistricts ?? []
    expect(uncounted).toHaveLength(1)
    // The size of the hole comes from the date's real all-districts.csv row
    // (paid 139, active 147); the reason is the gap transform recorded.
    expect(uncounted[0]).toMatchObject({
      districtId: GAP_DISTRICT,
      paidClubs: 139,
      activeClubs: 147,
    })
    expect(uncounted[0]!.reason).toMatch(/is not a CSV/)
    expect(uncounted[0]!.reason).toMatch(/#1671/)

    // paidClubs stays the sum over every ranked district, U included, but
    // avgClubSize divides the counted clubs' members by the COUNTED
    // districts' paid clubs (151 + 149 + 57), never by U's as well.
    expect(totals.membership.paidClubs).toBe(151 + 149 + 57 + 139)
    expect(totals.membership.totalMembership).toBe(3 * (25 + 11))
    expect(totals.membership.avgClubSize).toBeCloseTo(108 / 357, 10)
  })

  it('still refuses a ranked district with no file that metadata does not record (#1756 intact)', async () => {
    await writeMetadata({ ...(await readMetadata()), failedDistricts: [] })

    const result = await new AnalyticsComputeService({ cacheDir }).compute({
      date: SUBSET_DATE,
    })

    expect(await exists(GLOBAL_TOTALS_FILE_NAME)).toBe(false)
    expect(await exists(REGION_ROLLUPS_FILE_NAME)).toBe(false)
    expect(result.globalTotalsFailed).toBe(true)
    expect(result.clubRaceStoreFailed).toBe(true)
    expect(result.regionRollupsFailed).toBe(true)
    // The per-region club shards (#1800) are a fourth date-level artifact
    // under the same refusal rule.
    expect(result.clubsByRegionFailed).toBe(true)
    // So are the meeting-time counts (#1814), the fifth.
    expect(result.meetingTimesFailed).toBe(true)
    expect(await exists(MEETING_TIMES_FILE_NAME)).toBe(false)
    const refusals = result.errors.filter(
      e => e.error.startsWith('Refused') && e.error.includes('missing: U')
    )
    expect(refusals.length).toBe(5)
  })
})
