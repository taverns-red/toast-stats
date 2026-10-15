import { describe, it, expect } from 'vitest'
import type { DistrictReportsDataset } from '@taverns-red/shared-contracts'
import recordedD61 from '../../__tests__/fixtures/d61-education-reports.recorded.json'
import recordedClubs from '../../__tests__/fixtures/d61-education-clubs.recorded.json'
import recordedArchive from '../../__tests__/fixtures/d111-education-archive-2019-2020.recorded.json'
import {
  buildDistrictEducation,
  PATHWAYS_PATHS,
  pathTitleFromAward,
  type EducationClub,
} from '../districtEducation'

/* #1793 — the district Education page model. Ledger only: every number is
   read from the reports dataset's `educationAchievements` (plus its
   `educationMembers` and `tripleCrown` siblings), never from the dashboard
   CSV. Fixtures are the live D61 sidecar (2026-10-13) and the analytics
   club list of the same snapshot, plus the recorded D111 2019-20 archive
   (Legacy and Pathways in one year). Expected values were computed from
   the raw records by a separate script, not by this module. */

const d61 = recordedD61 as unknown as DistrictReportsDataset
const archive = recordedArchive as unknown as DistrictReportsDataset
const clubs = (
  recordedClubs as { clubs: (EducationClub & { membershipBase: number })[] }
).clubs

const build = (
  reports: DistrictReportsDataset | null,
  programYear = '2026-2027',
  clubList: EducationClub[] = clubs
) => buildDistrictEducation({ reports, programYear, clubs: clubList })

const available = (r: ReturnType<typeof build>) => {
  if (r.status !== 'available') throw new Error(`not available: ${r.reason}`)
  return r
}

describe('buildDistrictEducation — live D61 2026-10-13 (#1793)', () => {
  const e = available(build(d61))

  it('counts every ledger award, by program', () => {
    expect(e.totals).toEqual({
      awards: 297,
      pathways: 293,
      legacy: 0,
      dtm: 4,
      other: 0,
    })
  })

  it('KPI strip: members with an award, DTMs, Triple Crown, per base member', () => {
    expect(e.kpis.awards).toBe(297)
    expect(e.kpis.membersWithAward).toBe(229)
    expect(e.kpis.dtms).toBe(4)
    expect(e.kpis.tripleCrownAchievers).toBe(9)
    expect(e.kpis.baseMembers).toBe(2880)
    expect(e.kpis.awardsPerBaseMember).toBeCloseTo(297 / 2880, 10)
  })

  it('level rows are Pathways L1–L5 then DTM, each with path chips', () => {
    expect(e.levels.map(l => [l.key, l.count])).toEqual([
      ['L1', 88],
      ['L2', 79],
      ['L3', 38],
      ['L4', 45],
      ['L5', 43],
      ['DTM', 4],
    ])
    const l1 = e.levels[0]!
    // Chips: paths with awards at that level, most first.
    expect(l1.byPath[0]).toEqual({ path: 'PM', count: 39 })
    expect(l1.byPath.reduce((s, c) => s + c.count, 0)).toBe(88)
  })

  it('the matrix is Pathways only, keyed by path × level, and sums to the Pathways total', () => {
    const pm = e.paths.find(p => p.path === 'PM')!
    expect(pm.levels).toEqual([39, 33, 15, 11, 8])
    expect(pm.total).toBe(106)
    expect(pm.title).toBe('Presentation Mastery')
    expect(e.paths.reduce((s, p) => s + p.total, 0)).toBe(293)
    expect(e.levelTotals).toEqual([88, 79, 38, 45, 43])
  })

  it('always lists the 11 Pathways paths, then any other path the ledger names', () => {
    const codes = e.paths.map(p => p.path)
    expect(codes.slice(0, 11)).toEqual(PATHWAYS_PATHS.map(p => p.code))
    // BT ("Basic Training For Toastmasters") is in the live feed, not the 11.
    expect(codes.slice(11)).toEqual(['BT'])
    const bt = e.paths.find(p => p.path === 'BT')!
    expect(bt.title).toBe('Basic Training For Toastmasters')
    // A canonical path with no award this year is a real zero.
    for (const p of e.paths) expect(p.total).toBeGreaterThanOrEqual(0)
  })

  it('division rollup: one row per division, awards and members by club, base from the club list', () => {
    expect(
      e.divisions.map(d => [d.id, d.awards, d.membersWithAward, d.baseMembers])
    ).toEqual([
      ['A', 42, 32, 298],
      ['B', 42, 33, 398],
      ['C', 24, 23, 328],
      ['D', 26, 18, 275],
      ['F', 71, 46, 361],
      ['G', 35, 28, 491],
      ['H', 32, 27, 364],
      ['I', 25, 22, 365],
    ])
    expect(e.divisions.reduce((s, d) => s + d.awards, 0)).toBe(297)
    expect(
      e.divisions.find(d => d.id === 'F')!.awardsPerBaseMember
    ).toBeCloseTo(71 / 361, 10)
  })

  it('area rollup covers every area of the club list, zero-award areas included', () => {
    // 34 areas in the club list, 32 with an award: the other two are real 0s.
    expect(e.areas).toHaveLength(34)
    expect(e.areas.filter(a => a.awards === 0)).toHaveLength(2)
    expect(e.areas.reduce((s, a) => s + a.awards, 0)).toBe(297)
    // "4" in the ledger and "04" in the club list are one area.
    expect(new Set(e.areas.map(a => a.key)).size).toBe(34)
  })

  it('carries the report provenance', () => {
    expect(e.source).toEqual({
      reportType: 'education-achievements',
      asOf: 'October 14, 2026',
    })
  })
})

describe('buildDistrictEducation — recorded D111 2019-20 archive (Legacy + Pathways)', () => {
  const e = available(build(archive, '2019-2020', []))

  it('tags legacy codes Legacy and counts them in totals, never in the matrix', () => {
    expect(e.totals).toEqual({
      awards: 377,
      pathways: 294,
      legacy: 81,
      dtm: 2,
      other: 0,
    })
    expect(e.paths.reduce((s, p) => s + p.total, 0)).toBe(294)
    expect(e.legacyByCode).toEqual([
      { code: 'CC', count: 30 },
      { code: 'CL', count: 26 },
      { code: 'ACB', count: 8 },
      { code: 'ALB', count: 7 },
      { code: 'ACG', count: 4 },
      { code: 'ACS', count: 2 },
      { code: 'ALS', count: 2 },
      { code: 'LDREXC', count: 2 },
    ])
  })

  it('the archive has no member or Triple Crown columns: not measured, not 0', () => {
    expect(e.kpis.membersWithAward).toBeNull()
    expect(e.kpis.tripleCrownAchievers).toBeNull()
  })

  it('with no club list, base members are unknown, not 0', () => {
    expect(e.kpis.baseMembers).toBeNull()
    expect(e.kpis.awardsPerBaseMember).toBeNull()
    // Divisions still come from the ledger rows themselves.
    expect(e.divisions.map(d => [d.id, d.awards])).toEqual([['B', 377]])
    expect(e.divisions[0]!.baseMembers).toBeNull()
  })

  it('names the archive as the source', () => {
    expect(e.source.reportType).toBe('education-archive')
  })
})

describe('buildDistrictEducation — not available is never 0', () => {
  it('no reports dataset', () => {
    expect(build(null)).toEqual({
      status: 'not-available',
      reason: 'no-reports',
    })
  })

  it('a dataset without the education section', () => {
    const { educationAchievements: _drop, ...rest } = d61.sections
    expect(build({ ...d61, sections: rest })).toEqual({
      status: 'not-available',
      reason: 'no-education-section',
    })
  })

  it('a dataset for another program year than the one selected (R3)', () => {
    expect(build(d61, '2025-2026')).toEqual({
      status: 'not-available',
      reason: 'program-year-mismatch',
    })
  })
})

describe('pathTitleFromAward', () => {
  it('strips the code and the level from the recorded titles', () => {
    expect(pathTitleFromAward('PM1Presentation Mastery Level 1', 'PM')).toBe(
      'Presentation Mastery'
    )
    expect(
      pathTitleFromAward('BT1Basic Training For Toastmasters Level 1', 'BT')
    ).toBe('Basic Training For Toastmasters')
    expect(
      pathTitleFromAward('CES1CS: Entertaining + Storytelling Level 1', 'CES')
    ).toBe('CS: Entertaining + Storytelling')
  })
})
