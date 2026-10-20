/**
 * `compute-analytics` writes `snapshots/{date}/meeting-times.json` (#1814):
 * per-district weekday × start-hour meeting counts for the region and world
 * heatmaps.
 *
 * Same placement and refusal rules as `region-rollups.json` (#1799): beside
 * it in the date directory, so the per-date upload records it in the run
 * manifest and promotion copies it with its date; a ranked district without
 * a file refuses it (ADR-015 P3, never a partial region); regions come from
 * `<cache>/config/district-region-history.json`.
 *
 * Inputs are the recorded prod captures of the analytics-core fixture.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MEETING_TIMES_FILE_NAME,
  MeetingTimesSchema,
} from '@taverns-red/shared-contracts'
import { AnalyticsComputeService } from '../services/AnalyticsComputeService.js'

const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../analytics-core/src/rollup/__tests__/fixtures'
)
const DATE = '2026-10-19'
const DISTRICTS = ['17', '49', '61', 'U']

describe('AnalyticsComputeService — meeting-times.json (#1814)', () => {
  let cacheDir: string
  const snapshotDir = () => path.join(cacheDir, 'snapshots', DATE)
  const outPath = () => path.join(snapshotDir(), MEETING_TIMES_FILE_NAME)

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'meeting-times-'))
    await fs.cp(
      path.join(FIXTURES, 'meeting-times/snapshots', DATE),
      snapshotDir(),
      { recursive: true }
    )
    await fs.mkdir(path.join(cacheDir, 'config'), { recursive: true })
    await fs.copyFile(
      path.join(
        FIXTURES,
        'clubs-by-region/config/district-region-history.json'
      ),
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

  it('writes a schema-valid file beside the date’s other rollups', async () => {
    const result = await compute()
    expect(result.meetingTimesFailed).toBe(false)
    expect(result.meetingTimesPath).toBe(outPath())
    const raw = await fs.readFile(outPath(), 'utf-8')
    expect(raw.split('\n').filter(Boolean)).toHaveLength(1)
    const m = MeetingTimesSchema.parse(JSON.parse(raw))
    expect(m.snapshotDate).toBe(DATE)
    expect(m.totals).toEqual({ districts: 4, clubs: 318, scheduled: 309 })
    expect(m.districts['61']!.region).toBe('05')
  })

  it('without a synced region history still writes it, regions null with the reason', async () => {
    await fs.rm(path.join(cacheDir, 'config'), { recursive: true })
    const result = await compute()
    expect(result.meetingTimesFailed).toBe(false)
    const m = MeetingTimesSchema.parse(
      JSON.parse(await fs.readFile(outPath(), 'utf-8'))
    )
    expect(m.regionMembership).toBeNull()
    expect(m.regionMembershipNote).toMatch(/district-region-history/)
  })

  it('refuses the file when a listed district has no file (ADR-015 P3), recorded', async () => {
    await fs.rm(path.join(snapshotDir(), 'district_49.json'))
    const result = await compute()
    expect(result.meetingTimesFailed).toBe(true)
    expect(result.meetingTimesPath).toBeUndefined()
    await expect(fs.access(outPath())).rejects.toThrow()
    expect(
      result.errors.some(
        e => e.error.includes(MEETING_TIMES_FILE_NAME) && /49/.test(e.error)
      )
    ).toBe(true)
  })

  it('skips quietly when the date has no rankings file', async () => {
    await fs.rm(path.join(snapshotDir(), 'all-districts-rankings.json'))
    const result = await compute()
    expect(result.meetingTimesFailed).toBe(false)
    expect(result.meetingTimesPath).toBeUndefined()
    expect(
      result.errors.filter(e => e.error.includes(MEETING_TIMES_FILE_NAME))
    ).toEqual([])
  })
})
