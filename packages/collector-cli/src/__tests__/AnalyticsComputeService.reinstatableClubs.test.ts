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

  it('lists a closed club of a retired district, one the date’s rankings lack (#3101)', async () => {
    await fs.writeFile(
      path.join(cacheDir, 'config/closed-club-names.json'),
      JSON.stringify({
        ...CLOSED,
        programYears: {
          ...CLOSED.programYears,
          '2025-2026': {
            '124': [['8000124', 'Old 124 Club', '2026-03-31']],
          },
        },
      })
    )
    await compute()
    const file = ReinstatableClubsSchema.parse(
      JSON.parse(await fs.readFile(outPath(), 'utf-8'))
    )
    expect(
      file.districts['124']!.map(c => [c.clubNumber, c.districtRetiredOn])
    ).toEqual([['8000124', '2026-07-01']])
    expect(file.districts['61']!.every(c => !('districtRetiredOn' in c))).toBe(
      true
    )
  })

  it('without the date’s rankings, takes no district as retired (#3101)', async () => {
    await fs.writeFile(
      path.join(cacheDir, 'config/closed-club-names.json'),
      JSON.stringify({
        ...CLOSED,
        programYears: {
          ...CLOSED.programYears,
          '2025-2026': {
            '124': [['8000124', 'Old 124 Club', '2026-03-31']],
          },
        },
      })
    )
    await fs.rm(path.join(snapshotDir(), 'all-districts-rankings.json'))
    await compute()
    const file = ReinstatableClubsSchema.parse(
      JSON.parse(await fs.readFile(outPath(), 'utf-8'))
    )
    expect(Object.keys(file.districts).sort()).toEqual(['17', '61'])
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

describe('AnalyticsComputeService — reinstatable-clubs.json is point in time (#3064 review)', () => {
  let cacheDir: string

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reinstatable-pit-'))
  })

  afterEach(async () => {
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  /** The recorded 2026-10-19 inputs, filed under `date`. */
  async function seed(date: string, closedAsOf: string): Promise<string> {
    const dir = path.join(cacheDir, 'snapshots', date)
    await fs.cp(path.join(FIXTURES, 'meeting-times/snapshots', DATE), dir, {
      recursive: true,
    })
    await fs.writeFile(
      path.join(dir, 'suspended-clubs.json'),
      JSON.stringify({ ...SUSPENDED, snapshotDate: date })
    )
    await fs.mkdir(path.join(cacheDir, 'config'), { recursive: true })
    await fs.writeFile(
      path.join(cacheDir, 'config/closed-club-names.json'),
      JSON.stringify({ ...CLOSED, asOf: closedAsOf })
    )
    return dir
  }

  const compute = (date: string) =>
    new AnalyticsComputeService({ cacheDir }).compute({
      date,
      districts: DISTRICTS,
    })

  const readOut = async (dir: string) =>
    ReinstatableClubsSchema.parse(
      JSON.parse(
        await fs.readFile(path.join(dir, REINSTATABLE_CLUBS_FILE_NAME), 'utf-8')
      )
    )

  it('skips the step when the closed-club index is newer than the date (a rebuild)', async () => {
    const dir = await seed(DATE, '2026-10-20')
    const result = await compute(DATE)
    expect(result.reinstatableClubsFailed).toBe(false)
    expect(result.reinstatableClubsPath).toBeUndefined()
    await expect(
      fs.access(path.join(dir, REINSTATABLE_CLUBS_FILE_NAME))
    ).rejects.toThrow()
  })

  describe('the previous program year’s June 30 suspended list', () => {
    const AUGUST = '2026-08-15'
    const PREVIOUS = {
      _format: SUSPENDED_CLUBS_FORMAT,
      snapshotDate: '2026-06-30',
      programYear: { start: '2025-07-01', end: '2026-06-30' },
      districts: {
        '61': [
          {
            clubNumber: '3475582',
            clubName: "Tunney's Toastmasters",
            division: 'B',
            area: '22',
            suspendDate: '2026-03-31',
          },
        ],
      },
    }

    async function seedAugust(): Promise<string> {
      const dir = await seed(AUGUST, AUGUST)
      // Tunney's is still on the date's roster, marked Suspended.
      const district61 = path.join(dir, 'district_61.json')
      const snapshot = JSON.parse(await fs.readFile(district61, 'utf-8'))
      snapshot.data.clubs.push({ clubId: '3475582', clubStatus: 'Suspended' })
      await fs.writeFile(district61, JSON.stringify(snapshot))
      return dir
    }

    const previousPath = () =>
      path.join(cacheDir, 'snapshots/2026-06-30/suspended-clubs.json')

    it('lists a Mar 31 suspension that left the date’s list, before Oct 1', async () => {
      const dir = await seedAugust()
      await fs.mkdir(path.dirname(previousPath()), { recursive: true })
      await fs.writeFile(previousPath(), JSON.stringify(PREVIOUS))
      const result = await compute(AUGUST)
      expect(result.reinstatableClubsFailed).toBe(false)
      const file = await readOut(dir)
      expect(
        file.districts['61']!.map(c => [c.clubNumber, c.status, c.addsToBase])
      ).toEqual([
        ['1849755', 'suspended', false],
        ['3475582', 'suspended', true],
        ['1314924', 'closed', false],
      ])
    })

    it('without the previous list, Jul 1 to Sep 30, writes no file (unknown, not zero)', async () => {
      // #3064 review N2: the clubs that list would add are missing, so an
      // empty district would read as a measured zero (#1757).
      const dir = await seedAugust()
      const result = await compute(AUGUST)
      expect(result.reinstatableClubsFailed).toBe(false)
      expect(result.reinstatableClubsPath).toBeUndefined()
      await expect(
        fs.access(path.join(dir, REINSTATABLE_CLUBS_FILE_NAME))
      ).rejects.toThrow()
    })

    it('an unreadable previous list fails the step, not the run', async () => {
      const dir = await seedAugust()
      await fs.mkdir(path.dirname(previousPath()), { recursive: true })
      await fs.writeFile(previousPath(), '{ not json')
      const result = await compute(AUGUST)
      expect(result.reinstatableClubsFailed).toBe(true)
      await expect(
        fs.access(path.join(dir, REINSTATABLE_CLUBS_FILE_NAME))
      ).rejects.toThrow()
    })
  })

  describe('older program years’ June 30 suspended lists (#3064 review F2)', () => {
    // Tunney's Toastmasters (D61) was suspended 2026-03-31 and left the
    // roster at the July rollover (lastSeen 2026-06-30). It closed on
    // Oct 1 2026, inside the window until Sep 30 2028, but only the
    // 2026-06-30 list still has its suspend date.
    const juneList = (date: string, clubs: unknown[]) => ({
      _format: SUSPENDED_CLUBS_FORMAT,
      snapshotDate: date,
      programYear: {
        start: `${Number(date.slice(0, 4)) - 1}-07-01`,
        end: date,
      },
      districts: { '61': clubs },
    })
    const TUNNEYS = {
      clubNumber: '3475582',
      clubName: "Tunney's Toastmasters",
      division: 'B',
      area: '15',
      suspendDate: '2026-03-31',
    }

    async function writeList(date: string, clubs: unknown[]): Promise<void> {
      const file = path.join(
        cacheDir,
        'snapshots',
        date,
        'suspended-clubs.json'
      )
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, JSON.stringify(juneList(date, clubs)))
    }

    for (const [date, lists] of [
      ['2028-04-01', ['2027-06-30']],
      ['2028-08-01', ['2028-06-30', '2027-06-30']],
    ] as const) {
      it(`${date}: dates the suspension from the older list, so it is listed in period 5 (#3103)`, async () => {
        const dir = await seed(date, date)
        await fs.writeFile(
          path.join(cacheDir, 'config/closed-club-names.json'),
          JSON.stringify({
            ...CLOSED,
            asOf: date,
            programYears: {
              '2025-2026': {
                '61': [['3475582', "Tunney's Toastmasters", '2026-06-30']],
              },
            },
          })
        )
        for (const newer of lists) await writeList(newer, [])
        await writeList('2026-06-30', [TUNNEYS])
        const result = await compute(date)
        expect(result.reinstatableClubsFailed).toBe(false)
        const row = (await readOut(dir)).districts['61']!.find(
          c => c.clubNumber === '3475582'
        )
        expect(row).toMatchObject({
          status: 'closed',
          oldestPeriod: false,
          inactivePeriod: 5,
          lastChanceBy: '2028-09-30',
        })
      })
    }
  })

  describe('March 31 lists and the legacy deadlines file (#3103)', () => {
    // report.md §3: on 2026-11-19, 1025927 Above & Beyond (Sept 30 2025,
    // last seen 2026-04-29) has its TI date only on the 2026-03-31 list, and
    // 3778 Club Le Marquis (Mar 31 2025, last seen 2025-06-30) has no TI
    // date at all: only the status-history deadline places it.
    const NOV19 = '2026-11-19'
    const closedWith = (rows: [string, string, string][]) =>
      JSON.stringify({
        ...CLOSED,
        asOf: NOV19,
        programYears: { '2025-2026': { '61': rows } },
      })
    const legacyPath = () =>
      path.join(cacheDir, 'config/legacy-suspension-deadlines.json')
    const LEGACY = {
      _format: { version: '1.0.0', type: 'legacy-suspension-deadlines' },
      generatedAt: '2026-11-21T12:00:00.000Z',
      expires: '2027-10-01',
      sourceDates: ['2025-03-31', '2025-04-30'],
      rowCount: 1,
      rowsSha256: 'a'.repeat(64),
      rows: { '3778': '2025-03-31' },
    }
    const rowOf = async (dir: string, n: string) =>
      (await readOut(dir)).districts['61']!.find(c => c.clubNumber === n)

    it('reads the March 31 list, so a Sept 30 suspension that closed in April has its period', async () => {
      const dir = await seed(NOV19, NOV19)
      await fs.writeFile(
        path.join(cacheDir, 'config/closed-club-names.json'),
        closedWith([['1025927', 'Above & Beyond', '2026-04-29']])
      )
      const march = path.join(
        cacheDir,
        'snapshots/2026-03-31/suspended-clubs.json'
      )
      await fs.mkdir(path.dirname(march), { recursive: true })
      await fs.writeFile(
        march,
        JSON.stringify({
          _format: SUSPENDED_CLUBS_FORMAT,
          snapshotDate: '2026-03-31',
          programYear: { start: '2025-07-01', end: '2026-06-30' },
          districts: {
            '61': [
              {
                clubNumber: '1025927',
                clubName: 'Above & Beyond',
                division: 'D',
                area: '41',
                suspendDate: '2025-09-30',
              },
            ],
          },
        })
      )
      const result = await compute(NOV19)
      expect(result.reinstatableClubsFailed).toBe(false)
      expect(await rowOf(dir, '1025927')).toMatchObject({
        inactivePeriod: 3,
        lastChanceBy: '2028-03-31',
      })
    })

    it('reads config/legacy-suspension-deadlines.json when it is synced', async () => {
      const dir = await seed(NOV19, NOV19)
      await fs.writeFile(
        path.join(cacheDir, 'config/closed-club-names.json'),
        closedWith([['3778', 'Club Le Marquis', '2025-06-30']])
      )
      await fs.writeFile(legacyPath(), JSON.stringify(LEGACY))
      await compute(NOV19)
      expect(await rowOf(dir, '3778')).toMatchObject({
        inactivePeriod: 4,
        lastChanceBy: '2027-09-30',
      })
    })

    it('without the legacy file the club is listed with no period', async () => {
      const dir = await seed(NOV19, NOV19)
      await fs.writeFile(
        path.join(cacheDir, 'config/closed-club-names.json'),
        closedWith([['3778', 'Club Le Marquis', '2025-06-30']])
      )
      const result = await compute(NOV19)
      expect(result.reinstatableClubsFailed).toBe(false)
      const row = await rowOf(dir, '3778')
      expect(row).toBeDefined()
      expect(row!.inactivePeriod).toBeUndefined()
    })

    it('an unreadable legacy file is ignored with a warning: the list is still written, without periods', async () => {
      const dir = await seed(NOV19, NOV19)
      await fs.writeFile(
        path.join(cacheDir, 'config/closed-club-names.json'),
        closedWith([['3778', 'Club Le Marquis', '2025-06-30']])
      )
      await fs.writeFile(legacyPath(), '{"not":"valid"}')
      const result = await compute(NOV19)
      expect(result.reinstatableClubsFailed).toBe(false)
      const row = await rowOf(dir, '3778')
      expect(row).toBeDefined()
      expect(row!.inactivePeriod).toBeUndefined()
    })
  })
})
