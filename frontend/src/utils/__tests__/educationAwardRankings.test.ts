import { describe, it, expect } from 'vitest'
import type { DistrictReportsDataset } from '@taverns-red/shared-contracts'
import {
  computeEducationAwardRankings,
  isCountedEducationAward,
  MIN_ELIGIBLE_BASE,
  type EducationAwardClub,
} from '../educationAwardRankings'

const club = (
  clubId: string,
  membershipBase: number,
  clubName = `Club ${clubId}`
): EducationAwardClub => ({
  clubId,
  clubName,
  divisionId: 'A',
  areaId: '01',
  membershipBase,
})

const source = (reportType: string, asOf = 'October 01, 2026') => ({
  reportType,
  tableId: 'c757d313-f815-4b22-93dc-b839d04cec7b',
  asOf,
})

const award = (club: string, award: string, achievementCount = 1) => ({
  club,
  division: 'A',
  area: '01',
  name: `Club ${club}`,
  location: 'Town',
  award,
  achievementCount,
})

const dataset = (
  sections: DistrictReportsDataset['sections']
): DistrictReportsDataset => ({
  districtId: '61',
  programYear: '2026-2027',
  generatedAt: '2026-10-01T00:00:00.000Z',
  sections,
})

describe('isCountedEducationAward (#1592: Pathways L1–L5 + DTM)', () => {
  it('counts every Pathways level 1–5 award, each once', () => {
    for (const a of [
      'PM1Presentation Mastery Level 1',
      'VC3Visionary Communication Level 3',
      'PM5Presentation Mastery Level 5', // the path completion — counted once
      'BT1Basic Training For Toastmasters Level 1',
    ]) {
      expect(isCountedEducationAward(a)).toBe(true)
    }
  })

  it('counts DTM', () => {
    expect(isCountedEducationAward('DTMDistinguished Toastmaster')).toBe(true)
  })

  it('excludes non-level awards such as the Pathways Mentor Program (archive only)', () => {
    expect(isCountedEducationAward('PWMENTORPGMPathways Mentor Program')).toBe(
      false
    )
    expect(isCountedEducationAward('')).toBe(false)
  })
})

describe('computeEducationAwardRankings — awards per base member (Crowning Glory)', () => {
  const clubs = [club('1', 10), club('2', 20), club('3', 8), club('4', 12)]
  const reports = dataset({
    educationAchievements: {
      sources: [source('education-achievements')],
      records: [
        award('1', 'PM1Presentation Mastery Level 1', 3),
        award('1', 'DTMDistinguished Toastmaster', 1),
        award('1', 'PWMENTORPGMPathways Mentor Program', 5), // not counted
        award('2', 'VC2Visionary Communication Level 2', 8),
        award('3', 'PM5Presentation Mastery Level 5', 2),
        award('999', 'PM1Presentation Mastery Level 1', 4), // club not in district list
      ],
    },
  })

  it('ranks awards ÷ base, highest first, with numerator and denominator', () => {
    const { awardsPerBase } = computeEducationAwardRankings(clubs, reports)
    expect(
      awardsPerBase.ranked.map(e => [e.clubId, e.numerator, e.denominator])
    ).toEqual([
      ['1', 4, 10], // 0.40
      ['2', 8, 20], // 0.40 — tied
      ['3', 2, 8], // 0.25
      ['4', 0, 12], // 0 — eligible, no awards
    ])
    expect(awardsPerBase.ranked.map(e => e.rank)).toEqual([1, 1, 3, 4])
    expect(awardsPerBase.ranked[0]!.ratio).toBeCloseTo(0.4)
  })

  it('ignores report rows for clubs missing from the district club list', () => {
    const { awardsPerBase } = computeEducationAwardRankings(clubs, reports)
    expect(awardsPerBase.ranked.find(e => e.clubId === '999')).toBeUndefined()
  })

  it('also works from the prior-year Archive section (same record shape)', () => {
    const archive = dataset({
      educationAchievements: {
        sources: [source('education-archive', '')],
        records: [award('3', 'PM1Presentation Mastery Level 1', 4)],
      },
    })
    const { awardsPerBase } = computeEducationAwardRankings(clubs, archive)
    expect(awardsPerBase.available).toBe(true)
    expect(awardsPerBase.sourceReportType).toBe('education-archive')
    expect(awardsPerBase.ranked[0]).toMatchObject({
      clubId: '3',
      numerator: 4,
      rank: 1,
    })
  })
})

describe('computeEducationAwardRankings — eligibility', () => {
  it(`lists clubs with base below ${MIN_ELIGIBLE_BASE} as ineligible, unranked`, () => {
    const clubs = [club('1', 10), club('small', 7), club('new', 0)]
    const reports = dataset({
      educationAchievements: {
        sources: [source('education-achievements')],
        records: [award('small', 'PM1Presentation Mastery Level 1', 7)],
      },
    })
    const { awardsPerBase } = computeEducationAwardRankings(clubs, reports)
    expect(awardsPerBase.ranked.map(e => e.clubId)).toEqual(['1'])
    expect(awardsPerBase.ineligible.map(e => e.clubId).sort()).toEqual([
      'new',
      'small',
    ])
    expect(
      awardsPerBase.ineligible.find(e => e.clubId === 'small')
    ).toMatchObject({ numerator: 7, denominator: 7, rank: null })
  })
})

describe('computeEducationAwardRankings — eligibility boundary', () => {
  it(`ranks a club whose base is exactly ${MIN_ELIGIBLE_BASE}`, () => {
    const clubs = [club('edge', MIN_ELIGIBLE_BASE), club('under', 7)]
    const reports = dataset({
      educationAchievements: {
        sources: [source('education-achievements')],
        records: [award('edge', 'PM1Presentation Mastery Level 1', 2)],
      },
    })
    const { awardsPerBase } = computeEducationAwardRankings(clubs, reports)
    expect(awardsPerBase.ranked.map(e => [e.clubId, e.rank])).toEqual([
      ['edge', 1],
    ])
    expect(awardsPerBase.ineligible.map(e => e.clubId)).toEqual(['under'])
  })
})

describe('computeEducationAwardRankings — members with an award (Team Spirit)', () => {
  const clubs = [club('1', 10), club('2', 8), club('3', 9)]

  it('ranks distinct members with an award ÷ base; a club absent from the section scores 0', () => {
    const reports = dataset({
      educationMembers: {
        sources: [source('education-achievements')],
        records: [
          { club: '1', membersWithAward: 5 },
          { club: '2', membersWithAward: 4 },
        ],
      },
    })
    const { membersWithAward } = computeEducationAwardRankings(clubs, reports)
    expect(membersWithAward.available).toBe(true)
    expect(
      membersWithAward.ranked.map(e => [e.clubId, e.numerator, e.rank])
    ).toEqual([
      ['1', 5, 1], // 0.5
      ['2', 4, 1], // 0.5 — tied
      ['3', 0, 3],
    ])
  })

  it('is NOT available when the dataset has no educationMembers (prior years: the Archive has no member column)', () => {
    const reports = dataset({
      educationAchievements: {
        sources: [source('education-archive', '')],
        records: [award('1', 'PM1Presentation Mastery Level 1', 1)],
      },
    })
    const { membersWithAward, awardsPerBase } = computeEducationAwardRankings(
      clubs,
      reports
    )
    expect(membersWithAward.available).toBe(false)
    expect(membersWithAward.ranked).toEqual([])
    expect(awardsPerBase.available).toBe(true)
  })
})

describe('computeEducationAwardRankings — graceful absence', () => {
  it('reports both rankings unavailable for a null dataset', () => {
    const r = computeEducationAwardRankings([club('1', 10)], null)
    expect(r.awardsPerBase.available).toBe(false)
    expect(r.membersWithAward.available).toBe(false)
  })
})
