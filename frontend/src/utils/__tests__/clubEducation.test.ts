import { describe, it, expect } from 'vitest'
import type { DistrictReportsDataset } from '@taverns-red/shared-contracts'
import {
  classifyEducationAward,
  summarizeClubEducation,
} from '../clubEducation'

/**
 * #1790 — the club page's Education panel. Ledger only (Ron, 2026-10-11):
 * every `educationAchievements` award counts, tagged Pathways or Legacy, DTM
 * under its own code. The award strings below are the full non-level
 * vocabulary read from D61's reports sidecars 2019-20 → 2026-27 on the CDN
 * (2026-10-11), plus a sample of Pathways level codes.
 */

describe('classifyEducationAward', () => {
  it.each([
    [
      'PM1Presentation Mastery Level 1',
      'Pathways',
      'PM',
      'Presentation Mastery',
      1,
    ],
    [
      'VC5Visionary Communication Level 5',
      'Pathways',
      'VC',
      'Visionary Communication',
      5,
    ],
    [
      'BT1Basic Training For Toastmasters Level 1',
      'Pathways',
      'BT',
      'Basic Training For Toastmasters',
      1,
    ],
    // #1976: the vintage Communication Series path has a three-letter code.
    [
      'CES3CS: Entertaining + Storytelling Level 3',
      'Pathways',
      'CES',
      'CS: Entertaining + Storytelling',
      3,
    ],
  ])('%s → Pathways level award', (award, program, code, pathName, level) => {
    expect(classifyEducationAward(award)).toEqual({
      program,
      code,
      pathName,
      level,
    })
  })

  it('tags the Pathways Mentor Program as Pathways, with no level', () => {
    expect(
      classifyEducationAward('PWMENTORPGMPathways Mentor Program')
    ).toEqual({
      program: 'Pathways',
      code: 'PWMENTORPGM',
      pathName: null,
      level: null,
    })
  })

  it.each([
    ['CCCompetent Communicator', 'CC'],
    ['CLCompetent Leader', 'CL'],
    ['ACBAdvanced Communicator Bronze', 'ACB'],
    ['ACSAdvanced Communicator Silver', 'ACS'],
    ['ACGAdvanced Communicator Gold', 'ACG'],
    ['ALBAdvanced Leader Bronze', 'ALB'],
    ['ALSAdvanced Leader Silver', 'ALS'],
    ['LDREXCLeadership Excellence', 'LDREXC'],
  ])('%s → Legacy', (award, code) => {
    expect(classifyEducationAward(award)).toEqual({
      program: 'Legacy',
      code,
      pathName: null,
      level: null,
    })
  })

  it('counts DTM under its own code', () => {
    expect(classifyEducationAward('DTMDistinguished Toastmaster')).toEqual({
      program: 'DTM',
      code: 'DTM',
      pathName: null,
      level: null,
    })
  })

  it('skips the blank award rows the archive carries', () => {
    expect(classifyEducationAward('')).toBeNull()
  })
})

const ledger = (
  records: Array<{ club: string; award: string; achievementCount: number }>,
  opts: {
    reportType?: string
    asOf?: string
    members?: Array<{ club: string; membersWithAward: number }>
  } = {}
): DistrictReportsDataset =>
  ({
    districtId: '61',
    programYear: '2026-2027',
    generatedAt: '2026-10-11T09:05:12.053Z',
    sections: {
      educationAchievements: {
        sources: [
          {
            reportType: opts.reportType ?? 'education-achievements',
            tableId: 'c757d313-f815-4b22-93dc-b839d04cec7b',
            asOf: opts.asOf ?? 'October 11, 2026',
          },
        ],
        records: records.map(r => ({
          division: 'D',
          area: '33',
          name: 'Los Amigos Online',
          location: 'Ottawa',
          ...r,
        })),
      },
      ...(opts.members
        ? {
            educationMembers: {
              sources: [
                {
                  reportType: 'education-achievements',
                  tableId: 'c757d313-f815-4b22-93dc-b839d04cec7b',
                  asOf: 'October 11, 2026',
                },
              ],
              records: opts.members,
            },
          }
        : {}),
    },
  }) as unknown as DistrictReportsDataset

describe('summarizeClubEducation', () => {
  it('is unavailable — never zero — when the date has no reports file', () => {
    expect(summarizeClubEducation(null, '1009147')).toEqual({
      available: false,
    })
  })

  it('is unavailable when the reports file has no education ledger', () => {
    const noLedger = {
      districtId: '61',
      programYear: '2026-2027',
      generatedAt: '',
      sections: {},
    } as unknown as DistrictReportsDataset
    expect(summarizeClubEducation(noLedger, '1009147')).toEqual({
      available: false,
    })
  })

  it('sums the ledger for this club only, stacked by program, with Pathways levels and paths', () => {
    const reports = ledger(
      [
        {
          club: '1009147',
          award: 'PM1Presentation Mastery Level 1',
          achievementCount: 2,
        },
        {
          club: '1009147',
          award: 'PM2Presentation Mastery Level 2',
          achievementCount: 1,
        },
        {
          club: '1009147',
          award: 'VC1Visionary Communication Level 1',
          achievementCount: 1,
        },
        {
          club: '1009147',
          award: 'DTMDistinguished Toastmaster',
          achievementCount: 1,
        },
        {
          club: '1009147',
          award: 'CCCompetent Communicator',
          achievementCount: 3,
        },
        {
          club: '1009147',
          award: 'PWMENTORPGMPathways Mentor Program',
          achievementCount: 1,
        },
        { club: '1009147', award: '', achievementCount: 4 },
        {
          club: '1935',
          award: 'PM1Presentation Mastery Level 1',
          achievementCount: 9,
        },
      ],
      { members: [{ club: '1009147', membersWithAward: 3 }] }
    )
    expect(summarizeClubEducation(reports, '01009147')).toEqual({
      available: true,
      asOf: 'October 11, 2026',
      isArchive: false,
      total: 9,
      byProgram: { Pathways: 5, Legacy: 3, DTM: 1 },
      pathwaysLevels: [3, 1, 0, 0, 0],
      paths: [
        { code: 'PM', name: 'Presentation Mastery', count: 3 },
        { code: 'VC', name: 'Visionary Communication', count: 1 },
      ],
      membersWithAward: 3,
    })
  })

  it('reports zero awards (not unavailable) for a club absent from an existing ledger', () => {
    const reports = ledger(
      [
        {
          club: '1935',
          award: 'PM1Presentation Mastery Level 1',
          achievementCount: 2,
        },
      ],
      { members: [{ club: '1935', membersWithAward: 2 }] }
    )
    const s = summarizeClubEducation(reports, '3045')
    expect(s).toMatchObject({
      available: true,
      total: 0,
      membersWithAward: 0,
    })
  })

  it('leaves members-with-award unknown when the date has no members section (archive years)', () => {
    const reports = ledger(
      [{ club: '3045', award: 'CLCompetent Leader', achievementCount: 1 }],
      { reportType: 'education-archive', asOf: '' }
    )
    expect(summarizeClubEducation(reports, '3045')).toMatchObject({
      available: true,
      isArchive: true,
      asOf: '',
      total: 1,
      byProgram: { Pathways: 0, Legacy: 1, DTM: 0 },
      membersWithAward: null,
    })
  })
})
