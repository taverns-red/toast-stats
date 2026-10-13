/**
 * Per-club list of clubs suspended this program year (#1953, for the Club
 * Growth funnel #1794): `snapshots/{date}/suspended-clubs.json`.
 *
 * Fixtures:
 * - `susp-2026-27/2026-10-11/` — recorded from staging raw-csv/2026-10-11/
 *   (all-districts.csv trimmed to D61 + D83; the four district CSVs verbatim).
 *   D83 carries three ` Susp 10/01/26` rows; D61 carries none, which on a
 *   date whose source has Susp values is a measured zero.
 * - `no-susp-2023-24/2023-11-08/` — TM's 2023-24 shape with no Susp value at
 *   all (#1757): the list is unknown, so the file is absent, never empty.
 *
 * The list must agree with the rankings row's `suspendedClubs` (same column,
 * same logical-date PY window bounded at both ends — #1622/#1675).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { fileURLToPath } from 'node:url'
import { SuspendedClubsSchema } from '@taverns-red/shared-contracts'
import { TransformService } from '../services/TransformService.js'

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures'
)

describe('TransformService — suspended-clubs.json (#1953)', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'transform-susp-list-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  async function stage(fixture: string, date: string): Promise<string> {
    const rawDir = path.join(tempDir, 'raw-csv', date)
    await fs.cp(path.join(FIXTURES, fixture, date), rawDir, {
      recursive: true,
    })
    return rawDir
  }

  async function run(date: string): Promise<void> {
    await new TransformService({ cacheDir: tempDir }).transform({
      date,
      force: true,
    })
  }

  function snapshotFile(snapshotDate: string, name: string): string {
    return path.join(tempDir, 'snapshots', snapshotDate, name)
  }

  async function readJson<T>(file: string): Promise<T> {
    return JSON.parse(await fs.readFile(file, 'utf-8')) as T
  }

  it('lists each in-PY suspension per district, from the recorded 2026-10-11 source', async () => {
    await stage('susp-2026-27', '2026-10-11')
    await run('2026-10-11')

    const file = SuspendedClubsSchema.parse(
      await readJson(snapshotFile('2026-10-11', 'suspended-clubs.json'))
    )
    expect(file.snapshotDate).toBe('2026-10-11')
    expect(file.programYear).toEqual({
      start: '2026-07-01',
      end: '2027-06-30',
    })
    expect(file.districts['83']).toEqual([
      {
        clubNumber: '1380016',
        clubName: 'Travelers Toastmasters',
        division: 'C',
        area: '33',
        suspendDate: '2026-10-01',
      },
      {
        clubNumber: '875053',
        clubName: 'Cartus Magnus Club',
        division: 'G',
        area: '71',
        suspendDate: '2026-10-01',
      },
      {
        clubNumber: '28678052',
        clubName: 'Subway North Hub',
        division: 'G',
        area: '74',
        suspendDate: '2026-10-01',
      },
    ])
    // A district with no Susp row on a populated date: measured zero.
    expect(file.districts['61']).toEqual([])
  })

  it('row count equals the rankings row suspendedClubs for the same district and date', async () => {
    await stage('susp-2026-27', '2026-10-11')
    await run('2026-10-11')

    const list = SuspendedClubsSchema.parse(
      await readJson(snapshotFile('2026-10-11', 'suspended-clubs.json'))
    )
    const { rankings } = await readJson<{
      rankings: Array<{ districtId: string; suspendedClubs?: number }>
    }>(snapshotFile('2026-10-11', 'all-districts-rankings.json'))
    expect(rankings).toHaveLength(2)
    for (const row of rankings) {
      expect(list.districts[row.districtId]).toHaveLength(row.suspendedClubs!)
    }
  })

  it('windows by the logical-date PY at both ends: prior-PY and next-PY Susp dates are excluded', async () => {
    const rawDir = await stage('susp-2026-27', '2026-10-11')
    const csv = path.join(rawDir, 'district-83', 'district-performance.csv')
    const content = await fs.readFile(csv, 'utf-8')
    await fs.writeFile(
      csv,
      content
        // Day before the PY starts (2026-07-01).
        .replace(
          '"Travelers Toastmasters","0","0","0","0","0","0","0",""," Susp 10/01/26"',
          '"Travelers Toastmasters","0","0","0","0","0","0","0",""," Susp 06/30/26"'
        )
        // Day after the PY ends (2027-06-30).
        .replace(
          '"Cartus Magnus Club","0","0","0","0","0","0","0",""," Susp 10/01/26"',
          '"Cartus Magnus Club","0","0","0","0","0","0","0",""," Susp 07/01/27"'
        )
    )
    await run('2026-10-11')

    const list = SuspendedClubsSchema.parse(
      await readJson(snapshotFile('2026-10-11', 'suspended-clubs.json'))
    )
    expect(list.districts['83']!.map(r => r.clubNumber)).toEqual(['28678052'])
  })

  it('a date whose source carries no Susp value at all writes no file (unknown, not [])', async () => {
    await stage('no-susp-2023-24', '2023-11-08')
    await run('2023-11-08')

    // The closing collection is written to its month-end (#193); rankings
    // are written there, so the absence below is not a skipped date.
    await expect(
      fs.access(snapshotFile('2023-10-31', 'all-districts-rankings.json'))
    ).resolves.toBeUndefined()
    await expect(
      fs.access(snapshotFile('2023-10-31', 'suspended-clubs.json'))
    ).rejects.toThrow()
  })
})
