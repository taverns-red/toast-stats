/**
 * `compute-analytics` writes `snapshots/{date}/reinstatable-clubs.json`
 * (#3007, phase 2): the suspended and closed clubs that can still be
 * reinstated, from the date's `suspended-clubs.json` and the closed-club index
 * the pipeline syncs to `<cache>/config/closed-club-names.json`.
 *
 * Presence carries meaning: when either input is missing the list is unknown,
 * so there is no file, never a file of empty lists. The step never blocks the
 * run: the file is new and nothing depends on it yet.
 *
 * The date's other inputs are the recorded prod captures used by the
 * meeting-times test.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  REINSTATABLE_CLUBS_FILE_NAME,
  ReinstatableClubsSchema,
  SUSPENDED_CLUBS_FORMAT,
} from '@taverns-red/shared-contracts'
import { AnalyticsComputeService } from '../services/AnalyticsComputeService.js'

const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../analytics-core/src/rollup/__tests__/fixtures'
)
const DATE = '2026-10-19'
const DISTRICTS = ['17', '49', '61', 'U']

const SUSPENDED = {
  _format: SUSPENDED_CLUBS_FORMAT,
  snapshotDate: DATE,
  programYear: { start: '2026-07-01', end: '2027-06-30' },
  districts: {
    '61': [
      {
        clubNumber: '1849755',
        clubName: 'Toastmasters At St. Lawrence College',
        division: 'A',
        area: '01',
        suspendDate: '2026-09-30',
      },
    ],
    '17': [],
  },
}

const CLOSED = {
  _format: { version: '1.0.0', type: 'closed-club-name-index' },
  asOf: DATE,
  totalClubs: 1,
  programYears: {
    '2024-2025': {
      '61': [['1314924', 'Maitres Toastmasters', '2025-03-31']],
    },
  },
}

describe('AnalyticsComputeService — reinstatable-clubs.json (#3007)', () => {
  let cacheDir: string
  const snapshotDir = () => path.join(cacheDir, 'snapshots', DATE)
  const outPath = () => path.join(snapshotDir(), REINSTATABLE_CLUBS_FILE_NAME)

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reinstatable-'))
    await fs.cp(
      path.join(FIXTURES, 'meeting-times/snapshots', DATE),
      snapshotDir(),
      { recursive: true }
    )
    await fs.writeFile(
      path.join(snapshotDir(), 'suspended-clubs.json'),
      JSON.stringify(SUSPENDED)
    )
    await fs.mkdir(path.join(cacheDir, 'config'), { recursive: true })
    await fs.writeFile(
      path.join(cacheDir, 'config/closed-club-names.json'),
      JSON.stringify(CLOSED)
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

  it('writes a schema-valid file beside the date’s other artifacts', async () => {
    const result = await compute()
    expect(result.reinstatableClubsFailed).toBe(false)
    expect(result.reinstatableClubsPath).toBe(outPath())
    const file = ReinstatableClubsSchema.parse(
      JSON.parse(await fs.readFile(outPath(), 'utf-8'))
    )
    expect(file.snapshotDate).toBe(DATE)
    expect(file.districts['61']!.map(c => [c.clubNumber, c.status])).toEqual([
      ['1849755', 'suspended'],
      ['1314924', 'closed'],
    ])
    expect(file.districts['17']).toEqual([])
  })

  it('writes no file when the closed-club index is not synced (unknown, not zero)', async () => {
    await fs.rm(path.join(cacheDir, 'config'), { recursive: true })
    const result = await compute()
    expect(result.reinstatableClubsFailed).toBe(false)
    expect(result.reinstatableClubsPath).toBeUndefined()
    await expect(fs.access(outPath())).rejects.toThrow()
  })

  it('writes no file when the date has no suspended-clubs.json', async () => {
    await fs.rm(path.join(snapshotDir(), 'suspended-clubs.json'))
    const result = await compute()
    expect(result.reinstatableClubsFailed).toBe(false)
    expect(result.reinstatableClubsPath).toBeUndefined()
    await expect(fs.access(outPath())).rejects.toThrow()
  })

  it('an unreadable closed-club index fails the step, not the run', async () => {
    await fs.writeFile(
      path.join(cacheDir, 'config/closed-club-names.json'),
      '{ not json'
    )
    const result = await compute()
    expect(result.reinstatableClubsFailed).toBe(true)
    expect(result.reinstatableClubsPath).toBeUndefined()
    expect(
      result.errors.filter(e => e.error.includes(REINSTATABLE_CLUBS_FILE_NAME))
    ).toEqual([])
    await expect(fs.access(outPath())).rejects.toThrow()
  })
})
