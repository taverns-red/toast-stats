/**
 * `v1/global-history.json` — the pure assembler (#1499, epic #1496).
 *
 * One worldwide row per COMPLETED program year, so the /history extension
 * (epic Sprint 4) renders the five-year scoreboard from one fetch.
 *
 * What these tests pin is not arithmetic — the rollup arithmetic is already
 * pinned in analytics-core against the frozen 2026-06-30 capture. What they
 * pin is the set of facts this artifact is allowed to ASSERT, because every
 * one of them has a plausible wrong answer that type-checks:
 *
 * - Smedley before PY 2025-2026 is ABSENT, not 0 (the tier did not exist;
 *   archived rankings still store a literal 0, #1406).
 * - Education with no reports set is NULL, not 0 (a year we never fetched is
 *   not a year with no awards).
 * - `other` is a published residual: Pathways Mentor Program is a real award
 *   with no level, and dropping it makes the buckets sum to a lie.
 * - Report-basis `newClubs` is NULL for every historical year and is a
 *   DIFFERENT metric from `newClubsStillActive` (#1426 ruling 5).
 * - `totalMembershipMarch31` is NULL when the March rollup is absent.
 * - A missing year-end rollup OMITS that year loudly — it never aborts the
 *   run and never emits a half-filled row.
 * - Reports files for districts outside the date's own rankings set are
 *   excluded from the education sums (#1465/#1466).
 *
 * Frozen fixtures only. No network.
 */

import { describe, it, expect } from 'vitest'
import { GlobalHistorySchema } from '@taverns-red/shared-contracts'
import {
  buildGlobalHistory,
  selectProgramYearEnds,
  summarizeEducation,
  type GlobalHistoryYearSource,
} from '../globalHistory'

const GENERATED_AT = '2026-09-01T12:00:00.000Z'

/** A schema-valid `global-totals.json` payload with overridable parts. */
function totals(
  date: string,
  programYear: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    _format: { version: '1.0.0', type: 'global-totals' },
    date,
    programYear,
    generatedAt: GENERATED_AT,
    districts: {
      total: 132,
      numbered: 131,
      includesUndistricted: true,
      excludedDistricts: [],
      missingDistricts: [],
      duplicateClubs: [],
    },
    membership: {
      totalMembership: 257729,
      totalPayments: 549006,
      paidClubs: 13834,
      activeClubs: 14444,
      clubsCounted: 15261,
      avgClubSize: 18.63,
    },
    distinguishedClubs: {
      distinguishedOrBetter: 6736,
      select: 1274,
      presidents: 3636,
      smedley: null,
      base: 1826,
      percentOfPaidClubs: 48.69,
    },
    distinguishedDistricts: {
      distinguishedOrBetter: 37,
      byTier: {
        Distinguished: 13,
        Select: 8,
        Presidents: 5,
        Smedley: 11,
        NotDistinguished: 94,
        Unknown: 0,
      },
      undefinedVerdictDistricts: [],
    },
    clubMovement: { newClubsStillActive: 951, suspendedClubs: 733 },
    clubsByCountry: { countries: [], unknown: 15261 },
    ...overrides,
  }
}

/** A `district_{id}_reports.json` payload carrying education records. */
function reportsFile(
  districtId: string,
  awards: ReadonlyArray<[string, number]>,
  extraSections: Record<string, unknown> = {}
): { districtId: string; dataset: unknown } {
  return {
    districtId,
    dataset: {
      districtId,
      programYear: '2024-2025',
      generatedAt: GENERATED_AT,
      sections: {
        educationAchievements: {
          sources: [],
          records: awards.map(([award, achievementCount]) => ({
            club: '00000000',
            division: 'A',
            area: '01',
            name: 'A Club',
            location: 'Somewhere',
            award,
            achievementCount,
          })),
        },
        ...extraSections,
      },
    },
  }
}

function source(
  overrides: Partial<GlobalHistoryYearSource> = {}
): GlobalHistoryYearSource {
  return {
    programYear: '2024-2025',
    yearEndDate: '2025-06-30',
    marchDate: '2025-03-31',
    yearEndTotals: totals('2025-06-30', '2024-2025'),
    marchTotals: totals('2025-03-31', '2024-2025', {
      membership: {
        totalMembership: 265512,
        totalPayments: 300000,
        paidClubs: 13000,
        activeClubs: 14000,
        clubsCounted: 15000,
        avgClubSize: 20.42,
      },
    }),
    rankingsDistrictIds: ['61', 'U'],
    reports: null,
    ...overrides,
  }
}

describe('selectProgramYearEnds', () => {
  const dates = [
    '2021-07-31',
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

  it('returns one completed program year per year-end, newest first', () => {
    const selected = selectProgramYearEnds(dates, '2026-09-01')

    expect(selected.map(s => s.programYear)).toEqual([
      '2025-2026',
      '2024-2025',
      '2023-2024',
      '2022-2023',
      '2021-2022',
    ])
    expect(selected.map(s => s.yearEndDate)).toEqual([
      '2026-06-30',
      '2025-06-30',
      '2024-06-30',
      '2023-06-30',
      '2022-06-30',
    ])
    expect(selected.map(s => s.marchDate)).toEqual([
      '2026-03-31',
      '2025-03-31',
      '2024-03-31',
      '2023-03-31',
      '2022-03-31',
    ])
  })

  it('gives the in-progress program year no row', () => {
    const selected = selectProgramYearEnds(dates, '2026-09-01')
    expect(selected.some(s => s.programYear === '2026-2027')).toBe(false)
  })

  it('takes the latest date in the year, not necessarily June 30', () => {
    const selected = selectProgramYearEnds(
      ['2024-07-31', '2025-05-31', '2025-06-15'],
      '2026-09-01'
    )
    expect(selected).toEqual([
      {
        programYear: '2024-2025',
        yearEndDate: '2025-06-15',
        marchDate: null,
      },
    ])
  })

  it('string-parses dates rather than constructing Date objects', () => {
    // A `new Date('2025-06-30')` in a UTC-negative zone is June 29 locally,
    // which walks the year-end into the previous program year.
    const selected = selectProgramYearEnds(
      ['2025-06-30', '2025-07-01'],
      '2026-09-01'
    )
    expect(selected).toEqual([
      { programYear: '2024-2025', yearEndDate: '2025-06-30', marchDate: null },
    ])
  })
})

describe('summarizeEducation', () => {
  it('buckets L1–L5, DTM and a non-level residual', () => {
    const summary = summarizeEducation(
      [
        reportsFile('61', [
          ['MS1Motivational Strategies Level 1', 3],
          ['EC3Effective Coaching Level 3', 2],
          ['DL2Dynamic Leadership Level 2', 1],
          ['IP4Innovative Planning Level 4', 4],
          ['EH5Engaging Humor Level 5', 5],
          ['DTMDistinguished Toastmaster', 7],
          ['PWMENTORPGMPathways Mentor Program', 9],
        ]),
      ],
      ['61']
    )

    expect(summary).toEqual({
      level1: 3,
      level2: 1,
      level3: 2,
      level4: 4,
      level5: 5,
      dtm: 7,
      other: 9,
      total: 31,
      districtsReporting: 1,
      excludedDistricts: [],
    })
  })

  it('excludes report files for districts outside the date set (#1465)', () => {
    const summary = summarizeEducation(
      [
        reportsFile('61', [['MS1Motivational Strategies Level 1', 10]]),
        // District 201 did not exist at this date — its file is a rewrite
        // artefact sitting in the directory, and counting it double-counts
        // the same clubs under a renumbered id.
        reportsFile('201', [['MS1Motivational Strategies Level 1', 500]]),
      ],
      ['61', 'U']
    )

    expect(summary?.level1).toBe(10)
    expect(summary?.total).toBe(10)
    expect(summary?.excludedDistricts).toEqual(['201'])
  })

  it('is null when no in-scope district supplied an education section', () => {
    expect(summarizeEducation([], ['61'])).toBeNull()
    expect(summarizeEducation([reportsFile('201', [])], ['61'])).toBeNull()
  })

  it('refuses to sum without a district scope', () => {
    expect(
      summarizeEducation([reportsFile('61', [['DTMx Level 1', 1]])], null)
    ).toBeNull()
  })
})

describe('buildGlobalHistory', () => {
  it('emits one row per program year, newest first, with the full mapping', () => {
    const { history } = buildGlobalHistory(
      [
        source({ programYear: '2025-2026', yearEndDate: '2026-06-30' }),
        source(),
      ],
      GENERATED_AT
    )

    expect(history._format).toEqual({
      version: '1.0.0',
      type: 'global-history',
    })
    expect(history.generatedAt).toBe(GENERATED_AT)
    expect(history.years.map(y => y.programYear)).toEqual([
      '2025-2026',
      '2024-2025',
    ])

    const row = history.years[1]
    expect(row?.yearEndDate).toBe('2025-06-30')
    expect(row?.marchDate).toBe('2025-03-31')
    expect(row?.districts).toEqual({
      total: 132,
      numbered: 131,
      includesUndistricted: true,
    })
    expect(row?.membership.totalMembership).toBe(257729)
    expect(row?.membership.totalPayments).toBe(549006)
    expect(row?.membership.paidClubs).toBe(13834)
    expect(row?.membership.activeClubs).toBe(14444)
    expect(row?.membership.clubsCounted).toBe(15261)
    expect(row?.membership.avgClubSize).toBe(18.63)
    expect(row?.distinguishedClubs).toEqual({
      distinguishedOrBetter: 6736,
      select: 1274,
      presidents: 3636,
      smedley: null,
      base: 1826,
      percentOfPaidClubs: 48.69,
    })
    expect(row?.distinguishedDistricts.distinguishedOrBetter).toBe(37)
    expect(row?.distinguishedDistricts.byTier.Smedley).toBe(11)
    expect(row?.clubMovement.newClubsStillActive).toBe(951)
    expect(row?.clubMovement.suspendedClubs).toBe(733)
  })

  it('round-trips through the published schema', () => {
    const { history } = buildGlobalHistory([source()], GENERATED_AT)
    expect(GlobalHistorySchema.safeParse(history).success).toBe(true)
  })

  it('carries March-31 membership alongside the June-30 primary', () => {
    const { history } = buildGlobalHistory([source()], GENERATED_AT)
    expect(history.years[0]?.membership.totalMembership).toBe(257729)
    expect(history.years[0]?.membership.totalMembershipMarch31).toBe(265512)
  })

  it('nulls March-31 membership when the March rollup is absent', () => {
    const { history } = buildGlobalHistory(
      [source({ marchTotals: null, marchDate: null })],
      GENERATED_AT
    )
    expect(history.years[0]?.membership.totalMembershipMarch31).toBeNull()
    expect(history.years[0]?.marchDate).toBeNull()
  })

  it('never materialises Smedley as 0 before PY 2025-2026', () => {
    const { history } = buildGlobalHistory(
      [
        source({
          programYear: '2021-2022',
          yearEndDate: '2022-06-30',
          marchDate: '2022-03-31',
          yearEndTotals: totals('2022-06-30', '2021-2022'),
          marchTotals: null,
        }),
      ],
      GENERATED_AT
    )
    expect(history.years[0]?.distinguishedClubs.smedley).toBeNull()
  })

  it('sums education from the year-end reports, scoped to the date set', () => {
    const { history } = buildGlobalHistory(
      [
        source({
          rankingsDistrictIds: ['61', 'U'],
          reports: [
            reportsFile('61', [
              ['MS1Motivational Strategies Level 1', 3],
              ['DTMDistinguished Toastmaster', 2],
              ['PWMENTORPGMPathways Mentor Program', 1],
            ]),
            reportsFile('U', [['EC5Effective Coaching Level 5', 4]]),
            reportsFile('201', [['MS1Motivational Strategies Level 1', 999]]),
          ],
        }),
      ],
      GENERATED_AT
    )

    const education = history.years[0]?.education
    expect(education?.level1).toBe(3)
    expect(education?.level5).toBe(4)
    expect(education?.dtm).toBe(2)
    expect(education?.other).toBe(1)
    expect(education?.total).toBe(10)
    expect(education?.districtsReporting).toBe(2)
    expect(education?.excludedDistricts).toEqual(['201'])
  })

  it('nulls education — never zero-fills it — when the reports set is absent', () => {
    const { history } = buildGlobalHistory([source()], GENERATED_AT)
    expect(history.years[0]?.education).toBeNull()
  })

  it('nulls report-basis newClubs for a historical year that has only education', () => {
    const { history } = buildGlobalHistory(
      [
        source({
          reports: [reportsFile('61', [['DTMDistinguished Toastmaster', 1]])],
        }),
      ],
      GENERATED_AT
    )
    // Distinct from `newClubsStillActive`, which IS known for this year.
    expect(history.years[0]?.clubMovement.newClubs).toBeNull()
    expect(history.years[0]?.clubMovement.newClubsStillActive).toBe(951)
  })

  it('counts report-basis newClubs once the section exists, scoped to the date set', () => {
    const newClubs = (n: number) => ({
      sources: [],
      records: Array.from({ length: n }, (_, i) => ({
        division: 'A',
        area: '01',
        club: `club-${i}`,
        charterDate: '2025-01-01',
        status: 'Active',
        name: 'New Club',
        location: 'Somewhere',
      })),
    })
    const { history } = buildGlobalHistory(
      [
        source({
          rankingsDistrictIds: ['61'],
          reports: [
            reportsFile('61', [], { newClubs: newClubs(3) }),
            reportsFile('201', [], { newClubs: newClubs(50) }),
          ],
        }),
      ],
      GENERATED_AT
    )
    expect(history.years[0]?.clubMovement.newClubs).toBe(3)
  })

  it('omits a year whose year-end rollup is missing, loudly, and keeps the rest', () => {
    const { history, warnings } = buildGlobalHistory(
      [
        source({
          programYear: '2025-2026',
          yearEndDate: '2026-06-30',
          yearEndTotals: null,
          marchTotals: null,
          marchDate: null,
        }),
        source(),
      ],
      GENERATED_AT
    )

    expect(history.years.map(y => y.programYear)).toEqual(['2024-2025'])
    expect(history.omitted).toEqual([
      {
        programYear: '2025-2026',
        yearEndDate: '2026-06-30',
        reason: 'no global-totals.json at the year-end date',
      },
    ])
    expect(warnings.join('\n')).toContain('2026-06-30')
  })

  it('omits a year whose year-end rollup does not match the contract', () => {
    const { history, omittedReasons } = (() => {
      const result = buildGlobalHistory(
        [source({ yearEndTotals: { nonsense: true } })],
        GENERATED_AT
      )
      return {
        ...result,
        omittedReasons: result.history.omitted.map(o => o.reason),
      }
    })()

    expect(history.years).toEqual([])
    expect(omittedReasons[0]).toContain('did not match')
  })
})
