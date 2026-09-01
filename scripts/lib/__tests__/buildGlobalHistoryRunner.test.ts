/**
 * `scripts/build-global-history.ts` — behavioural tests (#1499, epic #1496).
 *
 * The assembly rules are unit-tested in `globalHistory.test.ts`. What is
 * tested here is what only the RUNNER can get wrong:
 *
 * - the two-pass contract: `--plan` names exactly the dates the second pass
 *   will read, or the workflow downloads the wrong objects and every year
 *   omits itself;
 * - a date directory with no `district_*_reports.json` yields `education:
 *   null`, not `education: 0` — the live 2026-06-30 hole, which must be
 *   page-ready before the archive backfill lands;
 * - an absent `global-totals.json` omits ONE year, logs a `::warning::` and
 *   still exits 0 with the other rows. This step is shared with
 *   `v1/latest.json`; failing it over one un-backfilled year takes the whole
 *   manifest generation down.
 *
 * Runs the real script against a temp directory. No network.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SCRIPT = resolve(process.cwd(), 'scripts/build-global-history.ts')
const AS_OF = '2026-09-01'

let dir: string
let sourceDir: string
let datesFile: string
let outPath: string

const DATES = [
  '2022-03-31',
  '2022-06-30',
  '2023-03-31',
  '2023-06-30',
  '2024-03-31',
  '2024-06-30',
  '2025-03-31',
  '2025-06-30',
  '2026-03-31',
  '2026-06-30',
  '2026-08-30',
]

function totals(
  date: string,
  programYear: string,
  totalMembership: number,
  smedley: number | null
): unknown {
  return {
    _format: { version: '1.0.0', type: 'global-totals' },
    date,
    programYear,
    generatedAt: '2026-09-01T00:00:00.000Z',
    districts: {
      total: 2,
      numbered: 1,
      includesUndistricted: true,
      excludedDistricts: [],
      missingDistricts: [],
      duplicateClubs: [],
    },
    membership: {
      totalMembership,
      totalPayments: 100,
      paidClubs: 10,
      activeClubs: 10,
      clubsCounted: 10,
      avgClubSize: totalMembership / 10,
    },
    distinguishedClubs: {
      // distinguishedOrBetter is distinguished-OR-BETTER (#1124), so the tiers
      // are subsets of it and the derived base can never go negative.
      distinguishedOrBetter: 5 + (smedley ?? 0),
      select: 1,
      presidents: 1,
      smedley,
      base: 3,
      percentOfPaidClubs: 50,
    },
    distinguishedDistricts: {
      distinguishedOrBetter: 1,
      byTier: {
        Distinguished: 1,
        Select: 0,
        Presidents: 0,
        Smedley: 0,
        NotDistinguished: 0,
        Unknown: 0,
      },
      undefinedVerdictDistricts: [],
    },
    clubMovement: { newClubsStillActive: 3, suspendedClubs: 2 },
    clubsByCountry: { countries: [], unknown: 10 },
  }
}

function writeDate(date: string, body: unknown): void {
  const dateDir = join(sourceDir, date)
  mkdirSync(dateDir, { recursive: true })
  writeFileSync(
    join(dateDir, 'global-totals.json'),
    JSON.stringify(body),
    'utf-8'
  )
}

function writeRankings(date: string, districtIds: string[]): void {
  const dateDir = join(sourceDir, date)
  mkdirSync(dateDir, { recursive: true })
  writeFileSync(
    join(dateDir, 'all-districts-rankings.json'),
    JSON.stringify({
      rankings: districtIds.map(districtId => ({ districtId })),
    }),
    'utf-8'
  )
}

function writeReports(
  date: string,
  districtId: string,
  awards: ReadonlyArray<[string, number]>
): void {
  const dateDir = join(sourceDir, date)
  mkdirSync(dateDir, { recursive: true })
  writeFileSync(
    join(dateDir, `district_${districtId}_reports.json`),
    JSON.stringify({
      districtId,
      programYear: '2024-2025',
      generatedAt: '2026-09-01T00:00:00.000Z',
      sections: {
        educationAchievements: {
          sources: [],
          records: awards.map(([award, achievementCount]) => ({
            club: '1',
            division: 'A',
            area: '01',
            name: 'Club',
            location: 'Somewhere',
            award,
            achievementCount,
          })),
        },
      },
    }),
    'utf-8'
  )
}

function run(args: string[]) {
  return spawnSync('npx', ['tsx', SCRIPT, ...args], {
    encoding: 'utf-8',
    cwd: process.cwd(),
  })
}

/** Populate every completed year with a rollup, so tests can subtract. */
function seedAllYears(): void {
  const years: Array<[string, string, number, number | null]> = [
    ['2022-06-30', '2021-2022', 258664, null],
    ['2023-06-30', '2022-2023', 250000, null],
    ['2024-06-30', '2023-2024', 245000, null],
    ['2025-06-30', '2024-2025', 257729, null],
    ['2026-06-30', '2025-2026', 260000, 1912],
  ]
  for (const [date, py, members, smedley] of years) {
    writeDate(date, totals(date, py, members, smedley))
  }
  for (const [march, py, members] of [
    ['2022-03-31', '2021-2022', 265000],
    ['2023-03-31', '2022-2023', 264000],
    ['2024-03-31', '2023-2024', 263000],
    ['2025-03-31', '2024-2025', 265512],
    ['2026-03-31', '2025-2026', 266000],
  ] as Array<[string, string, number]>) {
    writeDate(march, totals(march, py, members, null))
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'global-history-'))
  sourceDir = join(dir, 'src')
  mkdirSync(sourceDir, { recursive: true })
  datesFile = join(dir, 'dates.txt')
  outPath = join(dir, 'global-history.json')
  writeFileSync(datesFile, DATES.join('\n') + '\n', 'utf-8')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('build-global-history.ts --plan', () => {
  it('names the five year-ends and five March 31s the build will read', () => {
    const result = run(['--plan', '--dates-file', datesFile, '--as-of', AS_OF])

    expect(result.status).toBe(0)
    expect(result.stdout.trim().split('\n')).toEqual([
      '2026-06-30\tyear-end',
      '2026-03-31\tmarch',
      '2025-06-30\tyear-end',
      '2025-03-31\tmarch',
      '2024-06-30\tyear-end',
      '2024-03-31\tmarch',
      '2023-06-30\tyear-end',
      '2023-03-31\tmarch',
      '2022-06-30\tyear-end',
      '2022-03-31\tmarch',
    ])
    // The in-progress PY 2026-27 is not planned — 2026-08-30 is a mid-year
    // reading and has no place in a year-end series.
    expect(result.stdout).not.toContain('2026-08-30')
  })
})

describe('build-global-history.ts', () => {
  it('writes five rows newest-first with Smedley absent before 2025-2026', () => {
    seedAllYears()
    const result = run([
      '--dates-file',
      datesFile,
      '--source-dir',
      sourceDir,
      '--out',
      outPath,
      '--as-of',
      AS_OF,
    ])

    expect(result.status).toBe(0)
    const history = JSON.parse(readFileSync(outPath, 'utf-8'))
    expect(
      history.years.map((y: { programYear: string }) => y.programYear)
    ).toEqual(['2025-2026', '2024-2025', '2023-2024', '2022-2023', '2021-2022'])
    expect(history.years[0].distinguishedClubs.smedley).toBe(1912)
    for (const year of history.years.slice(1)) {
      expect(year.distinguishedClubs.smedley).toBeNull()
    }
    expect(history.years[1].membership.totalMembership).toBe(257729)
    expect(history.years[1].membership.totalMembershipMarch31).toBe(265512)
    expect(JSON.parse(result.stdout).years).toBe(5)
  })

  it('leaves education null for a year with no reports sidecars', () => {
    seedAllYears()
    writeRankings('2026-06-30', ['61', 'U'])
    // 2026-06-30 has rankings but no district_*_reports.json — the live hole
    // the 2025-2026 education-archive backfill dispatch fills.
    writeRankings('2025-06-30', ['61', 'U'])
    writeReports('2025-06-30', '61', [
      ['MS1Motivational Strategies Level 1', 4],
      ['DTMDistinguished Toastmaster', 2],
      ['PWMENTORPGMPathways Mentor Program', 1],
    ])

    const result = run([
      '--dates-file',
      datesFile,
      '--source-dir',
      sourceDir,
      '--out',
      outPath,
      '--as-of',
      AS_OF,
    ])

    expect(result.status).toBe(0)
    const history = JSON.parse(readFileSync(outPath, 'utf-8'))
    expect(history.years[0].education).toBeNull()
    expect(history.years[1].education).toMatchObject({
      level1: 4,
      dtm: 2,
      other: 1,
      total: 7,
      districtsReporting: 1,
    })
    expect(JSON.parse(result.stdout).educationYears).toEqual(['2024-2025'])
  })

  it('excludes an out-of-set reports file from the education sums (#1465)', () => {
    seedAllYears()
    writeRankings('2025-06-30', ['61', 'U'])
    writeReports('2025-06-30', '61', [
      ['MS1Motivational Strategies Level 1', 10],
    ])
    // District 201 did not exist at the 2024-25 close; its file is a rewrite
    // artefact and counting it double-counts the same clubs.
    writeReports('2025-06-30', '201', [
      ['MS1Motivational Strategies Level 1', 500],
    ])

    run([
      '--dates-file',
      datesFile,
      '--source-dir',
      sourceDir,
      '--out',
      outPath,
      '--as-of',
      AS_OF,
    ])

    const history = JSON.parse(readFileSync(outPath, 'utf-8'))
    expect(history.years[1].education.total).toBe(10)
    expect(history.years[1].education.excludedDistricts).toEqual(['201'])
  })

  it('omits a year with no rollup, warns loudly, and still exits 0', () => {
    seedAllYears()
    rmSync(join(sourceDir, '2026-06-30', 'global-totals.json'))

    const result = run([
      '--dates-file',
      datesFile,
      '--source-dir',
      sourceDir,
      '--out',
      outPath,
      '--as-of',
      AS_OF,
    ])

    expect(result.status).toBe(0)
    expect(result.stderr).toContain('::warning::')
    expect(result.stderr).toContain('backfill-global-totals')
    const history = JSON.parse(readFileSync(outPath, 'utf-8'))
    expect(history.years).toHaveLength(4)
    expect(history.omitted).toEqual([
      {
        programYear: '2025-2026',
        yearEndDate: '2026-06-30',
        reason: 'no global-totals.json at the year-end date',
      },
    ])
  })

  it('refuses a missing dates file rather than publishing an empty series', () => {
    const result = run([
      '--dates-file',
      join(dir, 'nope.txt'),
      '--source-dir',
      sourceDir,
      '--out',
      outPath,
    ])
    expect(result.status).toBe(2)
  })
})
