/**
 * Education rollup fold (#1801, epic #1781) — pure logic.
 *
 * Fixtures are recorded from staging on 2026-10-13, one object at a time
 * (fixtures/education-rollup/; record arrays untouched, ranking rows and
 * region-history districts trimmed to the districts the tests name, and the
 * D49 daily dataset trimmed to its education sections):
 *   raw-education-ledger/2003-2004/district_{85,17}.json   (ok, no-data)
 *   raw-education-ledger/2018-2019/district_111.json       (Legacy+Pathways)
 *   snapshots/2020-06-30/district_111_reports.json         (archive backfill)
 *   snapshots/2026-10-12/district_49_reports.json          (daily feed)
 *   snapshots/{2019-06-30,2020-06-30,2026-10-12}/all-districts-rankings.json
 *   derived/district-region-history.json
 * Expected counts were computed independently (Python over the same files).
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  DistrictRegionHistorySchema,
  DistrictReportsDatasetSchema,
  EducationLedgerHistoryFileSchema,
  EducationRollupIndexSchema,
  EducationRollupProgramYearSchema,
  type DistrictReportsDataset,
  type EducationLedgerHistoryFile,
} from '@taverns-red/shared-contracts'
import {
  buildEducationRollupIndex,
  planEducationRollup,
  rollUpEducationProgramYear,
} from '../educationRollup.js'

const FIX = path.join(
  process.cwd(),
  'scripts/lib/__tests__/fixtures/education-rollup'
)
const json = (rel: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(FIX, rel), 'utf-8'))

const ledger = (py: string, id: string): EducationLedgerHistoryFile =>
  EducationLedgerHistoryFileSchema.parse(
    json(`raw-education-ledger/${py}/district_${id}.json`)
  )
const reports = (date: string, id: string): DistrictReportsDataset =>
  DistrictReportsDatasetSchema.parse(
    json(`snapshots/${date}/district_${id}_reports.json`)
  )
const rankingIds = (date: string): string[] =>
  (
    json(`snapshots/${date}/all-districts-rankings.json`) as {
      rankings: { districtId: string }[]
    }
  ).rankings.map(r => r.districtId)
const regionHistory = DistrictRegionHistorySchema.parse(
  json('derived/district-region-history.json')
)

const rollup2018 = () =>
  rollUpEducationProgramYear({
    programYear: '2018-2019',
    source: 'ledger-history',
    sourceDate: null,
    ledgerFiles: [ledger('2018-2019', '111')],
    reports: [],
    districtIds: rankingIds('2019-06-30'), // 111, 85
    regionHistory,
  })

describe('ledger history PY (2018-19 D111: Legacy and Pathways both counted)', () => {
  it('counts every award, tagged by program, summing to the ledger total', () => {
    const r = rollup2018()
    const d = r.districts['111']
    expect(d?.status).toBe('available')
    if (d?.status !== 'available') return
    expect(d.awards.totals).toEqual({
      awards: 201,
      pathways: 95,
      legacy: 102,
      dtm: 3,
      other: 1,
    })
    expect(d.awards.otherByCode).toEqual({ PWMENTORPGM: 1 })
    expect(d.awards.clubsWithAward).toBe(19)
    // The archive has no member column and no Triple Crown: not measured.
    expect(d.awards.membersWithAward).toBeNull()
    expect(d.awards.tripleCrownAchievers).toBeNull()
  })

  it('the level × path matrix is Pathways only', () => {
    const d = rollup2018().districts['111']
    if (d?.status !== 'available') throw new Error('expected available')
    expect(d.awards.pathwaysMatrix['PM']).toEqual([8, 2, 0, 0, 0])
    expect(d.awards.pathwaysMatrix['IP']).toEqual([24, 3, 1, 0, 0])
    expect(d.awards.pathwaysMatrix['LD']).toEqual([5, 1, 1, 1, 1])
    expect(d.awards.pathwaysMatrix['PI']).toEqual([7, 3, 2, 2, 1])
    expect(Object.keys(d.awards.pathwaysMatrix)).not.toContain('CC')
    expect(Object.keys(d.awards.legacyByCode).sort()).toEqual(
      ['ACB', 'ACG', 'ACS', 'ALB', 'ALS', 'CC', 'CL', 'LDREXC'].sort()
    )
  })

  it("a district in the PY's list with no ledger file is not available, not 0", () => {
    const r = rollup2018()
    expect(r.districts['85']).toEqual({
      status: 'not-available',
      region: '14',
      reason: 'no-file',
    })
    expect(r.world.districtsAvailable).toEqual(['111'])
    expect(r.world.districtsNotAvailable).toEqual(['85'])
    expect(r.world.totals.awards).toBe(201)
  })

  it("regions use that PY's own membership and name what they could not sum", () => {
    const r = rollup2018()
    expect(r.regions?.['08']?.totals.awards).toBe(201)
    expect(r.regions?.['08']?.districtsAvailable).toEqual(['111'])
    expect(r.regions?.['14']?.districtsAvailable).toEqual([])
    expect(r.regions?.['14']?.districtsNotAvailable).toEqual(['85'])
    expect(r.regions?.['14']?.totals.awards).toBe(0)
  })

  it('validates against the shared contract', () => {
    expect(
      EducationRollupProgramYearSchema.safeParse(rollup2018()).success
    ).toBe(true)
  })
})

describe('ledger history PY before the region history (2003-04)', () => {
  const r = () =>
    rollUpEducationProgramYear({
      programYear: '2003-2004',
      source: 'ledger-history',
      sourceDate: null,
      ledgerFiles: [ledger('2003-2004', '85'), ledger('2003-2004', '17')],
      reports: [],
      districtIds: [],
      regionHistory,
    })

  it('a no-data ledger (TI returned an empty body) is not available', () => {
    expect(r().districts['17']).toEqual({
      status: 'not-available',
      region: null,
      reason: 'no-data',
    })
  })

  it('regions are null: no membership recorded for the year; world still sums', () => {
    expect(r().regions).toBeNull()
    expect(r().regionsUnassigned).toEqual([])
    expect(r().world.totals).toEqual({
      awards: 29,
      pathways: 0,
      legacy: 28,
      dtm: 1,
      other: 0,
    })
  })
})

describe('reports PY: archive backfill (2019-20 at 2020-06-30)', () => {
  const r = () =>
    rollUpEducationProgramYear({
      programYear: '2019-2020',
      source: 'reports',
      sourceDate: '2020-06-30',
      ledgerFiles: [],
      reports: [reports('2020-06-30', '111')],
      districtIds: rankingIds('2020-06-30'), // 111, 61, F
      regionHistory,
    })

  it('splits the code from the award string and counts by program', () => {
    const d = r().districts['111']
    if (d?.status !== 'available') throw new Error('expected available')
    expect(d.awards.totals).toEqual({
      awards: 377,
      pathways: 294,
      legacy: 81,
      dtm: 2,
      other: 0,
    })
    expect(d.awards.clubsWithAward).toBe(23)
    expect(d.awards.membersWithAward).toBeNull()
  })

  it('F has no region that year: counted in world, listed as unassigned', () => {
    expect(r().regionsUnassigned).toEqual(['F'])
    expect(r().districts['F']).toEqual({
      status: 'not-available',
      region: null,
      reason: 'no-file',
    })
  })
})

describe('reports PY: daily feed (2026-27 at 2026-10-12)', () => {
  const base = {
    programYear: '2026-2027',
    source: 'reports' as const,
    sourceDate: '2026-10-12',
    ledgerFiles: [],
    districtIds: rankingIds('2026-10-12'), // 49, 61
    regionHistory,
  }

  it('members with an award and Triple Crown come from the daily feed', () => {
    const r = rollUpEducationProgramYear({
      ...base,
      reports: [reports('2026-10-12', '49')],
    })
    const d = r.districts['49']
    if (d?.status !== 'available') throw new Error('expected available')
    expect(d.awards.totals).toEqual({
      awards: 86,
      pathways: 85,
      legacy: 0,
      dtm: 1,
      other: 0,
    })
    expect(d.awards.pathwaysMatrix['CES']).toEqual([1, 0, 0, 0, 0])
    expect(d.awards.pathwaysMatrix['PM']).toEqual([11, 4, 4, 1, 6])
    expect(d.awards.membersWithAward).toBe(65)
    expect(d.awards.tripleCrownAchievers).toBe(5)
    // Region 01 sums only D49 and every summed district measured members.
    expect(r.regions?.['01']?.membersWithAward).toBe(65)
  })

  it('an aggregate is null for members unless every summed district measured it', () => {
    const archiveShaped = reports('2026-10-12', '49')
    const d61: DistrictReportsDataset = {
      ...archiveShaped,
      districtId: '61',
      sections: {
        educationAchievements: archiveShaped.sections.educationAchievements,
      },
    }
    const r = rollUpEducationProgramYear({
      ...base,
      reports: [reports('2026-10-12', '49'), d61],
    })
    expect(r.world.districtsAvailable).toEqual(['49', '61'])
    expect(r.world.totals.awards).toBe(172)
    expect(r.world.membersWithAward).toBeNull()
    expect(r.world.tripleCrownAchievers).toBeNull()
  })

  it('a dataset with no educationAchievements section is not available', () => {
    const noSection: DistrictReportsDataset = {
      ...reports('2026-10-12', '49'),
      sections: {},
    }
    const r = rollUpEducationProgramYear({ ...base, reports: [noSection] })
    expect(r.districts['49']).toEqual({
      status: 'not-available',
      region: '01',
      reason: 'no-education-section',
    })
  })

  it("a dataset whose programYear disagrees with its snapshot's logical date is not available", () => {
    const r = rollUpEducationProgramYear({
      ...base,
      programYear: '2025-2026',
      sourceDate: '2026-06-30',
      districtIds: [],
      reports: [reports('2026-10-12', '49')], // programYear 2026-2027
    })
    expect(r.districts['49']?.status).toBe('not-available')
    expect(r.districts['49']).toMatchObject({
      reason: 'program-year-mismatch',
    })
  })

  it('carries counts only — no club id, club name or location', () => {
    const r = rollUpEducationProgramYear({
      ...base,
      reports: [reports('2026-10-12', '49')],
    })
    const text = JSON.stringify(r)
    const ds = reports('2026-10-12', '49')
    const sample = ds.sections.educationAchievements?.records[0]
    expect(sample).toBeDefined()
    expect(text).not.toContain(sample?.club)
    expect(text).not.toContain(sample?.name)
    expect(text).not.toContain(sample?.location)
  })

  it('is deterministic: input order does not change the bytes', () => {
    const a = reports('2026-10-12', '49')
    const b: DistrictReportsDataset = { ...a, districtId: '61' }
    const one = rollUpEducationProgramYear({ ...base, reports: [a, b] })
    const two = rollUpEducationProgramYear({
      ...base,
      districtIds: [...base.districtIds].reverse(),
      reports: [b, a],
    })
    expect(JSON.stringify(two)).toBe(JSON.stringify(one))
  })
})

describe('buildEducationRollupIndex', () => {
  it('one row per PY ascending, the trend per district and region, omitted years named', () => {
    const y2018 = rollup2018()
    const y2026 = rollUpEducationProgramYear({
      programYear: '2026-2027',
      source: 'reports',
      sourceDate: '2026-10-12',
      ledgerFiles: [],
      reports: [reports('2026-10-12', '49')],
      districtIds: ['49', '61'],
      regionHistory,
    })
    const index = buildEducationRollupIndex(
      [y2026, y2018],
      [{ programYear: '2016-2017', reason: 'no reports at any snapshot date' }]
    )
    expect(EducationRollupIndexSchema.safeParse(index).success).toBe(true)
    expect(index.asOf).toBe('2026-10-12')
    expect(index.programYears.map(p => p.programYear)).toEqual([
      '2018-2019',
      '2026-2027',
    ])
    expect(index.programYears[0]).toMatchObject({
      path: 'derived/education-rollup/2018-2019.json',
      districtsAvailable: 1,
      districtsNotAvailable: 1,
    })
    expect(index.trend.districts['111']?.['2018-2019']?.awards).toBe(201)
    expect(index.trend.districts['85']?.['2018-2019']).toBeNull()
    expect(index.trend.districts['61']?.['2026-2027']).toBeNull()
    expect(index.trend.regions['08']?.['2018-2019']?.awards).toBe(201)
    expect(index.omittedProgramYears).toEqual([
      { programYear: '2016-2017', reason: 'no reports at any snapshot date' },
    ])
  })
})

describe('planEducationRollup', () => {
  it('ledger years use the ledger; later years the reports, newest date first', () => {
    const plan = planEducationRollup(
      ['2003-2004', '2018-2019'],
      [
        '2019-01-31',
        '2019-06-30',
        '2020-05-31',
        '2020-06-30',
        '2026-07-26',
        '2026-10-11',
        '2026-10-12',
      ]
    )
    expect(plan).toEqual([
      {
        programYear: '2003-2004',
        source: 'ledger-history',
        rankingsDate: null,
        reportCandidates: [],
      },
      {
        programYear: '2018-2019',
        source: 'ledger-history',
        rankingsDate: '2019-06-30',
        reportCandidates: [],
      },
      {
        programYear: '2019-2020',
        source: 'reports',
        rankingsDate: '2020-06-30',
        reportCandidates: ['2020-06-30', '2020-05-31'],
      },
      {
        programYear: '2026-2027',
        source: 'reports',
        rankingsDate: '2026-10-12',
        reportCandidates: ['2026-10-12', '2026-10-11', '2026-07-26'],
      },
    ])
  })

  it('a June 30 close belongs to the prior PY by its logical date, though collected in July', () => {
    const plan = planEducationRollup([], ['2026-06-30', '2026-07-26'])
    expect(plan.map(p => [p.programYear, p.reportCandidates])).toEqual([
      ['2025-2026', ['2026-06-30']],
      ['2026-2027', ['2026-07-26']],
    ])
  })

  it('caps the report candidates per PY and ignores non-dates', () => {
    // 2024-25 has 12 dates here (Jan-Jun 2025, the 5th and the 15th).
    const dates = Array.from({ length: 6 }, (_, i) => [
      `2025-0${i + 1}-05`,
      `2025-0${i + 1}-15`,
    ]).flat()
    const plan = planEducationRollup([], [...dates, 'latest', ''])
    const py = plan.find(p => p.programYear === '2024-2025')
    expect(py?.reportCandidates).toHaveLength(6)
    expect(py?.reportCandidates[0]).toBe('2025-06-15')
    expect(py?.reportCandidates[5]).toBe('2025-04-05')
    expect(plan.map(p => p.programYear)).toEqual(['2024-2025'])
  })
})
