/**
 * The reports-sidecar and Find-a-Club pin colour modes (#1787, spec §4.2):
 * October and April dues renewals, Club Success Plan, officer list, club
 * coach and education awards per member. How members attend moved to
 * `pinMeeting` with the meeting-day mode (`pinMeeting.test.ts`).
 *
 * The reports fixture is built from records observed in the D61
 * `snapshots/2026-10-13/district_61_reports.json` (status strings verbatim)
 * and is parsed through the contract schema, so a shape drift fails here.
 * Absent is never zero: a missing section or row is "Not available for this
 * date", never "Not received" or "No coach".
 */
import { describe, expect, it } from 'vitest'
import {
  DistrictReportsDatasetSchema,
  type DistrictReportsDataset,
} from '@taverns-red/shared-contracts'
import type { ClubTrend } from '../../../hooks/useDistrictAnalytics'
import {
  EXTENDED_FACET_PARAMS,
  applyExtendedFacets,
  extendedModel,
} from '../pinExtended'
import { MAP_COLOR_MODES, legendChips, parseMapColorMode } from '../pinModes'
import { parseIconId } from '../pinLayer'

const club = (o: Partial<ClubTrend>): ClubTrend =>
  ({
    clubId: '1',
    clubName: 'Club',
    divisionId: 'A',
    divisionName: 'Division A',
    areaId: '01',
    areaName: 'Area 01',
    membershipTrend: [],
    dcpGoalsTrend: [],
    currentStatus: 'thriving',
    riskFactors: [],
    distinguishedLevel: 'NotDistinguished',
    coordinates: { lat: 45, lng: -75 },
    ...o,
  }) as ClubTrend

const DATE = '2026-10-13'
const src = (reportType: string) => [
  { reportType, tableId: 't', asOf: 'October 14, 2026' },
]
const dues = (club: string, renewalStatus: string) => ({
  club,
  division: 'D',
  area: '33',
  renewalStatus,
  name: `Club ${club}`,
  location: 'Ottawa',
})

const RAW = {
  districtId: '61',
  programYear: '2026-2027',
  generatedAt: '2026-10-14T09:05:16.444Z',
  sections: {
    octoberDuesRenewal: {
      sources: src('dues-renewal'),
      records: [
        dues('1009147', 'Verified complete - 08/03/2026'),
        dues('1269833', 'Low - Minimum requirement not yet met'),
        dues('1849755', '**Renewals not here**'),
        dues('28679503', 'Ineligible - Minimum requirement not yet met'),
      ],
    },
    aprilDuesRenewal: {
      sources: src('dues-renewal'),
      records: [
        dues('1009147', 'Verified complete - 01/30/2026'),
        dues('1269833', 'Verified complete - 09/02/2026'),
        dues('28679503', 'Ineligible - Minimum requirement not yet met'),
      ],
    },
    officerList: {
      sources: src('officer-list'),
      records: [
        {
          club: '1009147',
          clubName: 'Los Amigos Online',
          division: 'D',
          area: '33',
          listStatus: 'Received - 05/25/2026',
          electionCadence: 'annual',
          officerListSubmitted: true,
        },
        {
          club: '1849755',
          clubName: 'Club 1849755',
          division: 'D',
          area: '33',
          listStatus: 'List Not Here',
          electionCadence: 'annual',
          officerListSubmitted: false,
        },
      ],
    },
    clubSuccessPlan: {
      sources: src('club-success-plan'),
      records: [
        {
          clubNumber: '1009147',
          division: 'D',
          area: '33',
          submissionDate: 'July 9, 2026',
          clubName: 'Los Amigos Online',
        },
        {
          clubNumber: '1269833',
          division: 'D',
          area: '33',
          submissionDate: 'Not Submitted',
          clubName: 'FSA-Universite Laval',
        },
      ],
    },
    educationAchievements: {
      sources: src('education-achievements'),
      records: [
        {
          club: '1009147',
          division: 'D',
          area: '33',
          name: 'Los Amigos Online',
          location: 'Ottawa',
          award: 'MS1Motivational Strategies Level 1',
          achievementCount: 2,
        },
        {
          club: '1009147',
          division: 'D',
          area: '33',
          name: 'Los Amigos Online',
          location: 'Ottawa',
          award: 'CL Competent Leader',
          achievementCount: 3,
        },
        {
          club: '1269833',
          division: 'D',
          area: '33',
          name: 'FSA-Universite Laval',
          location: 'Québec',
          award: 'PI1Presentation Mastery Level 1',
          achievementCount: 1,
        },
      ],
    },
    coaches: {
      sources: src('coaches'),
      records: [
        {
          club: '1269833',
          clubName: 'FSA-Universite Laval',
          code: 'COACH',
          beginDate: '09/30/2026',
          status: 'PENDING',
          activeCoach: true,
        },
      ],
    },
  },
}

const REPORTS: DistrictReportsDataset = DistrictReportsDatasetSchema.parse(RAW)

type Mode = Parameters<typeof extendedModel>[0]
const label = (
  mode: Mode,
  c: ClubTrend,
  reports: DistrictReportsDataset | null = REPORTS,
  date = DATE
) => extendedModel(mode, date, reports).categoryOf(c).label

const NA = 'Not available for this date'
const members = (n: number) => [{ date: DATE, count: n }]

describe('October dues renewal (?color=renew-oct)', () => {
  it('maps the report statuses to Renewed, Below minimum, Not received and Ineligible', () => {
    const at = (id: string) => label('renew-oct', club({ clubId: id }))
    expect(at('1009147')).toBe('Renewed')
    expect(at('1269833')).toBe('Below minimum')
    expect(at('1849755')).toBe('Not received')
    expect(at('28679503')).toBe('Ineligible')
  })

  it('joins zero-padded and unpadded club ids', () => {
    expect(label('renew-oct', club({ clubId: '01009147' }))).toBe('Renewed')
  })

  it('a club missing from the report, or no report, is not available — never "Not received"', () => {
    expect(label('renew-oct', club({ clubId: '42' }))).toBe(NA)
    expect(label('renew-oct', club({ clubId: '1009147' }), null)).toBe(NA)
  })

  it('every status has its own shape (not colour alone)', () => {
    const shapes = extendedModel('renew-oct', DATE, REPORTS).categories.map(
      c => c.shape
    )
    expect(new Set(shapes).size).toBe(shapes.length)
  })
})

describe('April dues renewal (?color=renew-apr)', () => {
  it('a verification before the viewed PY began belongs to the last round: "Not open yet", never green', () => {
    expect(label('renew-apr', club({ clubId: '1009147' }))).toBe('Not open yet')
  })

  it('a verification inside the viewed PY is Renewed', () => {
    expect(label('renew-apr', club({ clubId: '1269833' }))).toBe('Renewed')
  })

  it('the PY comes from the viewed date (R3): in May 2026 the January 2026 renewal is current', () => {
    expect(
      label('renew-apr', club({ clubId: '1009147' }), REPORTS, '2026-05-15')
    ).toBe('Renewed')
  })

  it('keeps Ineligible, and a missing row is not available', () => {
    expect(label('renew-apr', club({ clubId: '28679503' }))).toBe('Ineligible')
    expect(label('renew-apr', club({ clubId: '1849755' }))).toBe(NA)
  })
})

describe('Club Success Plan (?color=csp)', () => {
  it('reads the report first: a date is Submitted, "Not Submitted" is not', () => {
    expect(label('csp', club({ clubId: '1009147' }))).toBe('Submitted')
    expect(label('csp', club({ clubId: '1269833' }))).toBe('Not submitted')
  })

  it('the report wins over the CSV flag', () => {
    expect(label('csp', club({ clubId: '1009147', cspSubmitted: false }))).toBe(
      'Submitted'
    )
  })

  it('falls back to the CSV flag without a report row, and is N/A without either', () => {
    expect(label('csp', club({ clubId: '42', cspSubmitted: true }))).toBe(
      'Submitted'
    )
    expect(
      label('csp', club({ clubId: '42', cspSubmitted: false }), null)
    ).toBe('Not submitted')
    expect(label('csp', club({ clubId: '42' }), null)).toBe(NA)
  })
})

describe('officer list (?color=officers)', () => {
  it('reads officerListSubmitted, with no CSV fallback', () => {
    expect(label('officers', club({ clubId: '1009147' }))).toBe('Submitted')
    expect(label('officers', club({ clubId: '1849755' }))).toBe('Not received')
    expect(label('officers', club({ clubId: '42' }))).toBe(NA)
    expect(label('officers', club({ clubId: '1009147' }), null)).toBe(NA)
  })
})

describe('club coach (?color=coach)', () => {
  it('reads the read-time coach join: active, then completed', () => {
    expect(
      label('coach', club({ coach: { status: 'active', since: null } }))
    ).toBe('Coach active')
    expect(
      label('coach', club({ coach: { status: 'completed', since: null } }))
    ).toBe('Coaching complete')
  })

  it('"No coach" only when the coaches section is present; without it, N/A', () => {
    expect(label('coach', club({ clubId: '42' }))).toBe('No coach')
    expect(label('coach', club({ clubId: '42' }), null)).toBe(NA)
    const { coaches: _drop, ...rest } = RAW.sections
    const noCoaches = DistrictReportsDatasetSchema.parse({
      ...RAW,
      sections: rest,
    })
    expect(label('coach', club({ clubId: '42' }), noCoaches)).toBe(NA)
  })

  it('flags clusters holding an active coach', () => {
    expect(extendedModel('coach', DATE, REPORTS).exceptionKey).toBe('active')
  })
})

describe('education awards per member (?color=awards)', () => {
  it('sums every ledger row for the club and divides by its members', () => {
    // 2 + 3 = 5 awards over 10 members = 0.5 per member.
    expect(
      label('awards', club({ clubId: '1009147', membershipTrend: members(10) }))
    ).toBe('0.5 to 1 per member')
    // 1 award over 20 members = 0.05.
    expect(
      label('awards', club({ clubId: '1269833', membershipTrend: members(20) }))
    ).toBe('Under 0.25 per member')
  })

  it('bins 0, under 0.25, 0.25 to 0.5, 0.5 to 1, 1 or more', () => {
    const at = (n: number) =>
      label('awards', club({ clubId: '1009147', membershipTrend: members(n) }))
    expect(at(5)).toBe('1 or more per member')
    expect(at(19)).toBe('0.25 to 0.5 per member')
    expect(
      label('awards', club({ clubId: '42', membershipTrend: members(9) }))
    ).toBe('No awards yet')
  })

  it('is N/A with 0 members or no ledger, never "No awards yet"', () => {
    expect(
      label('awards', club({ clubId: '1009147', membershipTrend: members(0) }))
    ).toBe(NA)
    expect(
      label(
        'awards',
        club({ clubId: '1009147', membershipTrend: members(10) }),
        null
      )
    ).toBe(NA)
  })

  it('says every award counts, Pathways and legacy', () => {
    expect(extendedModel('awards', DATE, REPORTS).note).toMatch(
      /Pathways and legacy/
    )
  })
})

describe('registry, URL and facets', () => {
  const NEW = [
    'renew-oct',
    'renew-apr',
    'csp',
    'officers',
    'coach',
    'awards',
    'attendance',
  ] as const

  it('every new mode is selectable and URL-seedable', () => {
    for (const id of NEW) {
      expect(MAP_COLOR_MODES.some(m => m.id === id)).toBe(true)
      expect(parseMapColorMode(id)).toBe(id)
    }
  })

  it('each writes a legend key named after the mode', () => {
    for (const id of NEW) {
      expect(EXTENDED_FACET_PARAMS).toContain(id)
      expect(extendedModel(id, DATE, REPORTS).facet?.param).toBe(id)
    }
  })

  it('suspended overrides the report modes too', () => {
    const c = club({ clubId: '1009147', clubStatus: 'Suspended' })
    expect(label('renew-oct', c)).toBe('Suspended')
    expect(label('officers', c)).toBe('Suspended')
  })

  it('filters by the URL keys with the reports', () => {
    const clubs = [
      club({ clubId: '1009147' }),
      club({ clubId: '1269833' }),
      club({ clubId: '42' }),
    ]
    const ids = (q: string) =>
      applyExtendedFacets(clubs, new URLSearchParams(q), DATE, REPORTS).map(
        c => c.clubId
      )
    expect(ids('renew-oct=low,missing')).toEqual(['1269833'])
    expect(ids('csp=no')).toEqual(['1269833'])
    expect(ids('officers=na')).toEqual(['1269833', '42'])
  })

  it('a status legend hides zero chips and counts every club', () => {
    const chips = legendChips(extendedModel('officers', DATE, REPORTS), [
      club({ clubId: '1009147' }),
      club({ clubId: '1849755' }),
      club({ clubId: '42' }),
    ])
    expect(chips.map(c => `${c.label} ${c.count}`)).toEqual([
      'Submitted 1',
      'Not received 1',
      `${NA} 1`,
    ])
  })
})

describe('new shapes reach the icon painter', () => {
  it('every category of every new mode draws a known icon', () => {
    for (const id of [
      'renew-oct',
      'renew-apr',
      'csp',
      'officers',
      'coach',
      'awards',
      'attendance',
    ] as const) {
      for (const cat of extendedModel(id, DATE, REPORTS).categories) {
        const icon = `p|light|${cat.shape}|${cat.fill}||0|0`
        expect(parseIconId(icon), `${id}:${cat.key}`).not.toBeNull()
      }
    }
  })
})
